import { env } from '../lib/env.mjs';
import { extractJsonFromText } from './claude-code.mjs';

// Runner `llm` : une question, une reponse JSON validee par un schema minimal.
// Backend choisi par GF_LLM_BACKEND : `ollama` (defaut, gratuit, local) ou `anthropic`.
// Le modele vient de la pipeline (GF_MODEL_<PIPELINE>) ou de GF_OLLAMA_MODEL / GF_ANTHROPIC_MODEL.

const PRICES_PER_MTOK = { input: 3, output: 15 }; // ordre de grandeur Sonnet, pour la trace cost_usd

export function validateAgainstSchema(value, schema, path = '$') {
    const errors = [];
    if (schema.type === 'object') {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path} doit etre un objet`];
        for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${path}.${key} manquant`);
        for (const [key, sub] of Object.entries(schema.properties ?? {})) {
            if (key in value) errors.push(...validateAgainstSchema(value[key], sub, `${path}.${key}`));
        }
    } else if (schema.type === 'array') {
        if (!Array.isArray(value)) return [`${path} doit etre un tableau`];
        if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} : au moins ${schema.minItems} element(s)`);
        if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} : au plus ${schema.maxItems} element(s)`);
        if (schema.items) value.forEach((item, index) => errors.push(...validateAgainstSchema(item, schema.items, `${path}[${index}]`)));
    } else if (schema.type === 'string') {
        if (typeof value !== 'string') return [`${path} doit etre une chaine`];
        if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} doit etre parmi ${schema.enum.join(', ')}`);
        if (schema.maxLength && value.length > schema.maxLength) errors.push(`${path} depasse ${schema.maxLength} caracteres`);
    } else if (schema.type === 'number' || schema.type === 'integer') {
        if (typeof value !== 'number') return [`${path} doit etre un nombre`];
    } else if (schema.type === 'boolean') {
        if (typeof value !== 'boolean') return [`${path} doit etre un booleen`];
    }
    return errors;
}

async function callOllama({ system, user, model }) {
    const base = (env('GF_OLLAMA_URL') ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
    const response = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, stream: false, format: 'json', options: { temperature: 0.2 }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status} : ${(await response.text()).slice(0, 200)}`);
    const data = await response.json();
    return { text: data.message?.content ?? '', cost: 0, model, tokens: { input: data.prompt_eval_count ?? 0, output: data.eval_count ?? 0 } };
}

async function callAnthropic({ system, user, model }) {
    const apiKey = env('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY absente');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 4000, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!response.ok) throw new Error(`Anthropic HTTP ${response.status} : ${(await response.text()).slice(0, 200)}`);
    const data = await response.json();
    const input = data.usage?.input_tokens ?? 0;
    const output = data.usage?.output_tokens ?? 0;
    return {
        text: (data.content ?? []).filter((block) => block.type === 'text').map((block) => block.text).join('\n'),
        cost: (input * PRICES_PER_MTOK.input + output * PRICES_PER_MTOK.output) / 1_000_000,
        model,
        tokens: { input, output },
    };
}

export async function runLlm({ system, user, schema, model, maxCostUsd = 1, retries = 1 }) {
    const backend = env('GF_LLM_BACKEND') ?? 'ollama';
    const resolvedModel = model ?? (backend === 'ollama' ? env('GF_OLLAMA_MODEL') ?? 'qwen2.5:14b' : env('GF_ANTHROPIC_MODEL') ?? 'claude-sonnet-4-5');
    const call = backend === 'ollama' ? callOllama : callAnthropic;
    let cost = 0;
    let lastErrors = [];
    let userPrompt = user;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const started = Date.now();
        const result = await call({ system, user: userPrompt, model: resolvedModel });
        cost += result.cost;
        const parsed = extractJsonFromText(result.text);
        lastErrors = parsed ? validateAgainstSchema(parsed, schema) : ['reponse non JSON'];
        if (!lastErrors.length) return { data: parsed, cost, model: resolvedModel, durationS: Math.round((Date.now() - started) / 1000), tokens: result.tokens };
        if (cost > maxCostUsd) break;
        userPrompt = `${user}\n\nTa reponse precedente etait invalide (${lastErrors.join(' ; ')}). Reponds uniquement avec un JSON conforme au schema.`;
    }
    return { data: null, errors: lastErrors, cost, model: resolvedModel };
}
