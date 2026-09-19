import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, warn } from '../lib/env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const hooksDir = resolve(here, '..', 'hooks');

// Porte du kit d origine (claude-runner.mjs). Aucun role de l usine n a besoin de ces
// outils ; on les interdit pour tous, en trois couches (CLI, permissions.deny, hook).
export const ALWAYS_DENIED_TOOLS = [
    'Agent', 'SendMessage', 'Workflow', 'Skill', 'AskUserQuestion', 'Artifact', 'ArtifactComments', 'ArtifactData',
    'SendUserFile', 'SendUserMessage', 'PushNotification',
    'TaskCreate', 'TaskGet', 'TaskList', 'TaskUpdate', 'TaskOutput', 'TaskStop',
    'CronCreate', 'CronDelete', 'CronList', 'ScheduleWakeup', 'RemoteTrigger',
    'EnterWorktree', 'ExitWorktree', 'EnterPlanMode', 'ExitPlanMode', 'EndConversation',
    'ListMcpResourcesTool', 'ReadMcpResourceTool', 'ReadMcpResourceDirTool', 'WaitForMcpServers', 'RefreshMcpTools',
    'ToolSearch', 'ListAgents', 'Monitor', 'DesignSync', 'SendFeedback', 'ReportFindings', 'ReadNotifications',
    'WebFetch', 'WebSearch', 'PowerShell', 'SuggestSkills', 'SearchMcpRegistry', 'SuggestConnectors',
];

export const PROFILES = {
    write: { hook: 'guard-write.mjs', disallowed: [] },
    'read-only': { hook: 'guard-readonly.mjs', disallowed: ['Bash', 'Write', 'Edit', 'NotebookEdit', 'MultiEdit'], captureReport: true },
    'read-only-git': { hook: 'guard-readonly.mjs', disallowed: ['Write', 'Edit', 'NotebookEdit', 'MultiEdit'], captureReport: true },
    qa: { hook: 'guard-qa.mjs', disallowed: ['Edit', 'NotebookEdit', 'MultiEdit'] },
};

function apiActionRequired(status, message) {
    if (status === 401) return 'Corriger ANTHROPIC_API_KEY (secret d org) : cle complete, active sur console.anthropic.com.';
    if (/credit balance/i.test(message) || status === 402) return 'Solde Anthropic epuise : recharger le workspace game-factory.';
    if (/spend limit|usage limit/i.test(message)) return 'Plafond mensuel du workspace atteint : le relever ou attendre le mois suivant.';
    if (status === 429) return 'Quota atteint : verifier les limites du workspace Anthropic.';
    return null;
}

export function extractJsonFromText(text) {
    if (!text) return null;
    const fenced = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/);
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    for (const candidate of [fenced?.[1], text.trim(), start !== -1 && end > start ? text.slice(start, end + 1) : null]) {
        if (!candidate) continue;
        try {
            return JSON.parse(candidate.trim());
        } catch {
            continue;
        }
    }
    return null;
}

function lastLines(text, count = 4) {
    return String(text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-count).join(' | ');
}

// Lance Claude Code en headless dans le clone, sous garde-fous, et garantit un report.json.
export async function runClaudeCode({ prompt, cwd, reportFile, logDir, profile = 'write', extraDirs = [], model, maxCostUsd, timeoutMin, fallbackAction }) {
    const config = PROFILES[profile];
    if (!config) throw new Error(`Profil inconnu : ${profile}`);
    mkdirSync(logDir, { recursive: true });
    rmSync(reportFile, { force: true });

    const disallowed = [...new Set([...ALWAYS_DENIED_TOOLS, ...config.disallowed])];
    const guard = join(hooksDir, config.hook);
    const denyAlways = join(hooksDir, 'deny-always.mjs');
    const settingsFile = join(logDir, 'claude-settings.json');
    writeFileSync(
        settingsFile,
        JSON.stringify(
            {
                permissions: { deny: disallowed },
                hooks: {
                    PreToolUse: [
                        { matcher: 'Bash', hooks: [{ type: 'command', command: `node "${guard}"` }] },
                        { matcher: 'Edit|Write|NotebookEdit|MultiEdit', hooks: [{ type: 'command', command: `node "${guard}"` }] },
                        { matcher: ALWAYS_DENIED_TOOLS.join('|'), hooks: [{ type: 'command', command: `node "${denyAlways}"` }] },
                    ],
                },
            },
            null,
            2,
        ),
    );
    writeFileSync(join(logDir, 'prompt.md'), prompt, 'utf8');

    // Phase 1 bis : un abonnement Claude connecte sur la machine du runner (`claude login`, identifiants dans
    // ~/.claude) remplace la cle API. Phase 2 : ANTHROPIC_API_KEY (workspace dedie, plafond mensuel).
    const apiKey = env('ANTHROPIC_API_KEY')?.trim();
    const homes = [env('HOME'), '/home/runner'].filter(Boolean);
    const subscription = !apiKey && homes.some((home) => ['.credentials.json', '.claude.json'].some((file) => existsSync(join(home, '.claude', file)) || existsSync(join(home, file))));
    if (!apiKey && !subscription) {
        writeFileSync(reportFile, JSON.stringify({ status: 'BLOCKED', kind: 'blocked', reason: 'Ni ANTHROPIC_API_KEY ni abonnement Claude connecte sur le runner : l agent ne peut pas demarrer.', actionRequired: 'Poser le secret ANTHROPIC_API_KEY, ou faire `claude login` dans le conteneur du runner.' }, null, 2));
        return { cost: 0, turns: 0, durationS: 0 };
    }
    if (subscription) console.log('Auth : abonnement Claude du runner (pas de cle API).');

    try {
        console.log(`Claude Code CLI : ${execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim()}`);
    } catch (error) {
        warn(`Version du CLI illisible : ${error.message}`);
    }

    const args = [
        '-p', '--output-format', 'stream-json', '--verbose',
        '--max-budget-usd', String(maxCostUsd),
        '--dangerously-skip-permissions',
        ...(model ? ['--model', model] : []),
        '--disallowedTools', disallowed.join(' '),
        ...extraDirs.flatMap((dir) => ['--add-dir', dir]),
        '--settings', settingsFile,
    ];

    console.log(`Agent : profil ${profile}, modele ${model ?? 'par defaut'}, budget ${maxCostUsd} USD, timeout ${timeoutMin} min`);
    const started = Date.now();
    const rawLog = createWriteStream(join(logDir, 'agent.jsonl'), { flags: 'a' });
    const child = spawn('claude', args, {
        cwd,
        env: { ...process.env, ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}), CI: 'true', GF_PROFILE: profile, GF_REPORT_FILE: reportFile, GF_SKIP_EXPORT: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderrTail = '';
    child.stderr.on('data', (chunk) => {
        process.stderr.write(chunk);
        stderrTail = (stderrTail + chunk.toString('utf8')).slice(-4000);
    });
    const timer = setTimeout(() => {
        warn(`Timeout de ${timeoutMin} min atteint, arret de l agent.`);
        child.kill('SIGKILL');
    }, timeoutMin * 60_000);
    child.stdin.end(prompt);

    let buffer = '';
    let summary = null;
    let stdoutTail = '';
    child.stdout.on('data', (chunk) => {
        rawLog.write(chunk);
        stdoutTail = (stdoutTail + chunk.toString('utf8')).slice(-4000);
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            if (!line.trim()) continue;
            let event;
            try {
                event = JSON.parse(line);
            } catch {
                continue;
            }
            if (event.type === 'assistant') {
                for (const block of event.message?.content ?? []) {
                    if (block.type === 'text' && block.text.trim()) console.log(`[agent] ${block.text.trim().slice(0, 300)}`);
                    if (block.type === 'tool_use') console.log(`[outil] ${block.name}`);
                }
            }
            if (event.type === 'result') summary = event;
            if (event.type === 'error' || event.subtype === 'error') console.log(`[erreur] ${JSON.stringify(event).slice(0, 400)}`);
        }
    });

    const exitCode = await new Promise((done) => child.on('close', (code) => { clearTimeout(timer); rawLog.end(); done(code ?? 1); }));
    const durationS = Math.round((Date.now() - started) / 1000);
    const cost = Number(summary?.total_cost_usd ?? 0);
    const turns = Number(summary?.num_turns ?? 0);
    if (summary) console.log(`Fin de l agent : ${summary.subtype} — ${turns} tours — ${cost.toFixed(2)} USD — ${durationS}s`);
    if (cost >= maxCostUsd * 0.95) warn(`Budget de ${maxCostUsd} USD atteint : l agent a pu etre coupe avant la fin.`);

    const apiError = summary?.is_error ? summary : null;
    const apiStatus = apiError?.api_error_status;
    const apiMessage = String(apiError?.result ?? '').trim();
    const finalText = !apiError ? String(summary?.result ?? '').trim() : '';

    if (config.captureReport && !existsSync(reportFile)) {
        const parsed = extractJsonFromText(finalText);
        if (parsed) {
            writeFileSync(reportFile, JSON.stringify(parsed, null, 2));
            console.log('Rapport extrait de la reponse finale (agent sans outil d ecriture).');
        }
    }

    if (!existsSync(reportFile)) {
        const reason = apiError
            ? `Appel a l API Anthropic refuse (HTTP ${apiStatus ?? '?'}) : ${apiMessage}`
            : [
                  exitCode === 0 ? 'L agent s est arrete sans ecrire de rapport.' : `L agent s est arrete en erreur (code ${exitCode}) ou sur timeout.`,
                  config.captureReport && finalText ? `Reponse finale illisible : ${finalText.slice(0, 300)}` : lastLines(stderrTail || stdoutTail) && `Derniere sortie : ${lastLines(stderrTail || stdoutTail)}`,
              ].filter(Boolean).join(' ');
        console.log(`Aucun rapport : ${reason}`);
        writeFileSync(
            reportFile,
            JSON.stringify({ status: 'BLOCKED', kind: 'needs-human', reason, actionRequired: apiActionRequired(apiStatus, apiMessage) ?? fallbackAction ?? 'Consulter les logs du run.' }, null, 2),
        );
    }

    return { cost, turns, durationS, model: summary?.model ?? model ?? null };
}
