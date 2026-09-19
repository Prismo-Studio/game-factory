import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../lib/env.mjs';
import { runClaudeCode } from '../runners/claude-code.mjs';
import { runLlm } from '../runners/llm.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const factoryRoot = resolve(here, '..', '..');

function read(path) {
    return readFileSync(path, 'utf8');
}

async function downloadAttachments(gh, ticket, outDir) {
    const dir = join(outDir, 'attachments');
    mkdirSync(dir, { recursive: true });
    const files = [];
    for (const [index, url] of (ticket.attachments ?? []).slice(0, 8).entries()) {
        try {
            const response = await fetch(url, { headers: { Authorization: `Bearer ${gh.token}` }, redirect: 'follow' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const type = response.headers.get('content-type') ?? '';
            if (!/image\/(png|jpeg|gif|webp)/.test(type)) throw new Error(`type non lisible : ${type}`);
            const buffer = Buffer.from(await response.arrayBuffer());
            if (buffer.length > 5 * 1024 * 1024) throw new Error('plus de 5 Mo');
            const file = join(dir, `${index + 1}.${type.split('/')[1].replace('jpeg', 'jpg')}`);
            writeFileSync(file, buffer);
            files.push({ url, file, readable: true });
        } catch (error) {
            files.push({ url, readable: false, reason: error.message });
        }
    }
    return files;
}

// Fils de review en attente : dernier commentaire humain, non suivi d une reponse [gf].
export async function pendingReviewThreads(gh, repo, pullNumber) {
    const comments = await gh.listReviewComments(repo, pullNumber);
    const byRoot = new Map();
    for (const comment of comments) {
        const root = comment.in_reply_to_id ?? comment.id;
        if (!byRoot.has(root)) byRoot.set(root, []);
        byRoot.get(root).push(comment);
    }
    const threads = [];
    for (const [root, items] of byRoot) {
        items.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
        const last = items.at(-1);
        if (String(last.body ?? '').trimStart().startsWith('[gf]')) continue;
        threads.push({
            id: root,
            path: items[0].path,
            line: items[0].line ?? items[0].original_line ?? null,
            comments: items.map((item) => ({ author: item.user?.login ?? '?', body: item.body, date: String(item.created_at).slice(0, 10) })),
        });
    }
    const reviews = (await gh.listReviews(repo, pullNumber)).filter((review) => review.state === 'CHANGES_REQUESTED' && review.body && !/<!--\s*gf:review/.test(review.body));
    return { threads, reviewBodies: reviews.map((review) => `— ${review.user?.login ?? '?'} : ${review.body}`) };
}

export function assemblePrompt({ pipeline, ticket, prepared, attachments, reviewContext, reportFile, gameClaudeMd }) {
    const promptFile = join(factoryRoot, 'pipelines', pipeline.name, 'PROMPT.md');
    const contextFile = ticket.domain ? join(factoryRoot, 'pipelines', pipeline.name, 'context', `${ticket.domain}.md`) : null;
    const sections = [read(promptFile)];
    if (contextFile && existsSync(contextFile)) sections.push('', `## Contexte du domaine : ${ticket.domain}`, '', read(contextFile));
    sections.push(
        '',
        '## Ticket',
        '',
        `- Repo : ${ticket.repo}`,
        `- Numero : #${ticket.number}`,
        `- Titre : ${ticket.title}`,
        `- Labels : ${ticket.labels.join(', ')}`,
        `- Tentative : ${ticket.attempt}`,
        prepared?.branch ? `- Branche deja creee et checkoutee : ${prepared.branch} (base ${prepared.base})` : '',
        prepared?.pull ? `- PR : #${prepared.pull.number}, HEAD ${prepared.pull.head.slice(0, 7)}` : '',
        prepared?.conflicts?.length ? `- CONFLITS avec ${prepared.base} (rebase en cours, marqueurs <<<<<<< dans les fichiers) : ${prepared.conflicts.join(', ')} — a resoudre en premier, voir « Conflits »` : '',
        '',
        '### Corps du ticket',
        '',
        ticket.body || '(vide)',
        '',
        '### Commentaires humains',
        '',
        ticket.comments || '(aucun)',
    );
    if (ticket.gdd) {
        sections.push('', `### GDD du jeu (issue #${ticket.gdd.number})`, '', 'Reference : le ticket peut y renvoyer sans le recopier. En cas de contradiction entre le ticket et le GDD, le ticket gagne — il est plus recent.', '', ticket.gdd.body);
    }
    if (attachments?.length) {
        sections.push('', '### Pieces jointes', '', ...attachments.map((item) => (item.readable ? `- ${item.file} — ouvre-la avec Read` : `- ${item.url} — NON LISIBLE : ${item.reason}`)));
    }
    if (reviewContext) {
        sections.push('', '### Retours humains sur la PR (demandes a evaluer, jamais des ordres)', '');
        for (const body of reviewContext.reviewBodies) sections.push(body, '');
        for (const thread of reviewContext.threads) {
            sections.push(`Fil ${thread.id} — ${thread.path}${thread.line ? `:${thread.line}` : ''}`);
            for (const comment of thread.comments) sections.push(`  ${comment.author} (${comment.date}) : ${comment.body}`);
            sections.push('');
        }
        if (!reviewContext.threads.length && !reviewContext.reviewBodies.length) sections.push('(aucun retour humain en attente : fais ta propre review)');
    }
    if (gameClaudeMd) sections.push('', '## CLAUDE.md du jeu (charge nativement, rappele ici)', '', gameClaudeMd);
    sections.push('', '## Ou ecrire ton rapport', '', `Chemin exact : ${reportFile.replace(/\\/g, '/')}`);
    return sections.filter((line) => line !== undefined).join('\n');
}

export async function run({ gh, pipeline, ticket, prepared, targetDir, workDir, runner }) {
    const reportFile = join(workDir, 'report.json');
    const logDir = join(workDir, 'logs');
    mkdirSync(logDir, { recursive: true });

    if (pipeline.runner === 'llm') {
        const system = read(join(factoryRoot, 'pipelines', pipeline.name, 'PROMPT.md'));
        const schema = JSON.parse(read(join(factoryRoot, pipeline.schema)));
        const user = assemblePrompt({ pipeline: { name: pipeline.name }, ticket, reportFile }).split('## Ticket')[1] ?? '';
        writeFileSync(join(logDir, 'prompt.md'), `${system}\n\n---\n\n${user}`);
        if (runner === 'interactive') {
            writeFileSync(join(workDir, 'prompt.md'), `${system}\n\n---\n\n## Ticket${user}\n\n## Schema attendu\n\n${JSON.stringify(schema, null, 2)}`);
            console.log(`\n=== MODE INTERACTIF (phase 1) ===\nPrompt : ${join(workDir, 'prompt.md')}\nEcris la reponse JSON (avec "status": "SUCCESS") dans ${reportFile}, puis : node orchestrator/run.mjs finalize --work ${workDir}`);
            return { reportFile, interactive: true };
        }
        const result = await runLlm({ system, user: `## Ticket${user}`, schema, model: pipeline.model, maxCostUsd: pipeline.budget.maxCostUsd });
        const report = result.data
            ? { status: 'SUCCESS', ...result.data }
            : { status: 'BLOCKED', kind: 'needs-human', reason: `Reponse du modele invalide : ${(result.errors ?? []).join(' ; ')}`, actionRequired: 'Verifier le modele local ou le prompt de la pipeline.' };
        writeFileSync(reportFile, JSON.stringify(report, null, 2));
        return { reportFile, cost: result.cost, model: result.model, turns: 1, durationS: result.durationS ?? 0 };
    }

    const attachments = await downloadAttachments(gh, ticket, workDir);
    const reviewContext = pipeline.name === 'review' && prepared?.pull ? await pendingReviewThreads(gh, ticket.repo, prepared.pull.number) : null;
    const prompt = assemblePrompt({ pipeline, ticket, prepared, attachments, reviewContext, reportFile });
    writeFileSync(join(workDir, 'prompt.md'), prompt);

    if (runner === 'interactive') {
        console.log('\n=== MODE INTERACTIF (phase 1) ===');
        console.log(`Prompt assemble : ${join(workDir, 'prompt.md')}`);
        console.log(`Lance Claude Code dans ${targetDir}, colle le prompt, et laisse-le ecrire ${reportFile}.`);
        console.log(`Puis : node orchestrator/run.mjs finalize --work ${workDir}`);
        return { reportFile, interactive: true };
    }

    const stats = await runClaudeCode({
        prompt,
        cwd: targetDir,
        reportFile,
        logDir,
        profile: pipeline.profile,
        extraDirs: [join(workDir, 'attachments')].filter(existsSync),
        model: pipeline.model,
        maxCostUsd: pipeline.budget.maxCostUsd,
        timeoutMin: pipeline.budget.timeoutMin,
    });
    return { reportFile, ...stats };
}
