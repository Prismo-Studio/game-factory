import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { env, isDryRun, slugify, warn } from '../lib/env.mjs';
import { claimIssue, msSinceLastClaim } from '../lib/claim.mjs';
import { attempts, buildTrace, costSpent, dependencies, reviewPasses, staleClaim, tracesIn } from '../lib/traces.mjs';
import { EXCLUDED_LABELS, GAME_TOPIC, LOCK_LABEL, PAUSE_LABEL, PRIORITY_LABEL, RESET_LABEL } from '../pipelines.mjs';

// Pure : decide si un ticket est prenable (teste dans scan.test.mjs).
export function eligibility(issue, comments, pipeline, { doneNumbers = new Set() } = {}) {
    const labels = (issue.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name));
    if (!pipeline.inputLabels.some((label) => labels.includes(label))) return { ok: false, reason: 'pas le label d entree' };
    // Verrou orphelin (run tue : PC eteint, Docker arrete) : on le reprend au lieu d attendre un humain.
    const stale = labels.includes(LOCK_LABEL) ? staleClaim(comments) : null;
    for (const label of EXCLUDED_LABELS) {
        if (!labels.includes(label)) continue;
        if (label === LOCK_LABEL && stale) continue;
        return { ok: false, reason: `label ${label}` };
    }
    const tries = attempts(comments, pipeline.name);
    if (tries >= pipeline.budget.maxAttempts) return { ok: false, reason: `tentatives epuisees (${tries}/${pipeline.budget.maxAttempts})`, exhaust: true };
    const spent = costSpent(comments, pipeline.name);
    if (spent >= pipeline.budget.maxCostPerTicketUsd && pipeline.budget.maxCostPerTicketUsd > 0) {
        return { ok: false, reason: `budget du ticket epuise (${spent.toFixed(2)} USD)`, exhaust: true };
    }
    if (pipeline.name === 'review' && reviewPasses(comments) >= pipeline.budget.maxReviewPasses) {
        return { ok: false, reason: `passes de review epuisees (${pipeline.budget.maxReviewPasses})`, exhaust: true };
    }
    const deps = pipeline.ignoreDependencies ? [] : dependencies(issue.body).filter((number) => !doneNumbers.has(number));
    if (deps.length) return { ok: false, reason: `depend de #${deps.join(', #')} non termine(s)` };
    return { ok: true, priority: labels.includes(PRIORITY_LABEL) ? 1 : 0, attempts: tries, stale };
}

async function gameRepos(gh, org) {
    const repos = await gh.listOrgRepos(org, { topic: GAME_TOPIC });
    const active = [];
    for (const repo of repos) {
        const paused = await gh.listIssues(repo.full_name, { labels: [PAUSE_LABEL], state: 'open' });
        if (paused.length) console.log(`${repo.full_name} : ${PAUSE_LABEL}, ignore.`);
        else active.push(repo.full_name);
    }
    return active;
}

async function markExhausted(gh, repo, issue, pipeline, reason) {
    if (isDryRun()) return;
    await gh.comment(repo, issue.number, `${buildTrace('run', { pipeline: pipeline.name, status: 'EXHAUSTED', cost_usd: 0 })}\n${pipeline.name} · ${reason}.\nAction attendue : relire les tentatives precedentes, corriger le ticket, puis retirer needs-human (et poser reset pour repartir a zero).`);
    await gh.updateLabels(repo, issue.number, { add: ['needs-human'] });
}

export async function scan({ gh, pipeline, org, repo: forcedRepo, issue: forcedIssue, runId, outDir }) {
    mkdirSync(outDir, { recursive: true });
    const enabled = String((await gh.getVariable(`${org}/game-factory`, 'GF_ENABLED')) ?? env('GF_ENABLED') ?? 'true').toLowerCase() === 'true';
    if (!enabled && !forcedIssue) return { found: false, reason: 'GF_ENABLED=false (kill switch)' };

    const repos = forcedRepo ? [forcedRepo] : pipeline.scope === 'factory' ? [`${org}/game-factory`] : await gameRepos(gh, org);
    if (!repos.length) return { found: false, reason: 'aucun repo de jeu (topic gf-game)' };

    const cooldownMs = Number(env('GF_COOLDOWN_MIN') ?? 0) * 60_000;
    if (!forcedIssue && !isDryRun() && cooldownMs > 0) {
        const age = await msSinceLastClaim(gh, repos);
        if (age < cooldownMs) return { found: false, reason: `temporisation (${Math.round(age / 60_000)} min < ${cooldownMs / 60_000})` };
    }

    const candidates = [];
    for (const repo of repos) {
        const issues = forcedIssue ? [await gh.getIssue(repo, forcedIssue)] : await gh.listIssues(repo, { labels: pipeline.inputLabels.length === 1 ? pipeline.inputLabels : [] });
        const closed = forcedIssue ? [] : await gh.listIssues(repo, { state: 'closed' });
        const doneLabelled = forcedIssue ? [] : await gh.listIssues(repo, { labels: ['done'], state: 'open' });
        const doneNumbers = new Set([...closed, ...doneLabelled].map((item) => item.number));
        for (const issue of issues) {
            const comments = await gh.listComments(repo, issue.number);
            const labels = issue.labels.map((label) => label.name);
            if (labels.includes(RESET_LABEL) && !isDryRun()) {
                await gh.comment(repo, issue.number, `${buildTrace('reset', { by: pipeline.name })}\nCompteur de tentatives remis a zero.`);
                await gh.removeLabel(repo, issue.number, RESET_LABEL);
                comments.push({ body: buildTrace('reset', {}), created_at: new Date().toISOString() });
            }
            const verdict = forcedIssue ? { ok: true, priority: 0, attempts: attempts(comments, pipeline.name) } : eligibility(issue, comments, pipeline, { doneNumbers });
            if (verdict.exhaust) {
                warn(`${repo}#${issue.number} : ${verdict.reason}`);
                await markExhausted(gh, repo, issue, pipeline, verdict.reason);
                continue;
            }
            if (!verdict.ok) {
                console.log(`  ${repo}#${issue.number} ignore : ${verdict.reason}`);
                continue;
            }
            if (verdict.stale && !isDryRun()) {
                await gh.comment(repo, issue.number, `${buildTrace('stale-claim', { pipeline: verdict.stale.pipeline, run: verdict.stale.run, age_min: verdict.stale.ageMin })}\nVerrou orphelin : le run ${verdict.stale.run} de ${verdict.stale.pipeline} n a jamais rendu de rapport (${verdict.stale.ageMin} min). Le ticket est repris.`);
            }
            candidates.push({ repo, issue, comments, priority: verdict.priority, attempts: verdict.attempts });
        }
    }
    if (!candidates.length) return { found: false, reason: 'aucun candidat' };
    candidates.sort((a, b) => b.priority - a.priority || Date.parse(a.issue.created_at) - Date.parse(b.issue.created_at));

    let chosen = null;
    for (const candidate of candidates) {
        if (isDryRun()) {
            chosen = candidate;
            break;
        }
        if (await claimIssue(gh, candidate.repo, candidate.issue.number, { pipeline: pipeline.name, runId, lock: pipeline.lock })) {
            chosen = candidate;
            break;
        }
    }
    if (!chosen) return { found: false, reason: 'tous les candidats sont revendiques par d autres runs' };

    const { repo, issue, comments } = chosen;
    const labels = issue.labels.map((label) => label.name);
    const inputLabel = pipeline.inputLabels.find((label) => labels.includes(label)) ?? pipeline.inputLabels[0];
    const humanComments = comments.filter((comment) => !/<!--\s*gf:/.test(comment.body ?? ''));
    const attachments = [...String(issue.body ?? '').matchAll(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)|(https:\/\/github\.com\/user-attachments\/assets\/[^\s)]+)/g)]
        .map((match) => match[1] ?? match[2]);
    const ticket = {
        repo,
        number: issue.number,
        title: issue.title,
        body: issue.body ?? '',
        labels,
        inputLabel,
        domain: pipeline.contextFor ? pipeline.contextFor(labels) : undefined,
        comments: humanComments.map((comment) => `— ${comment.user?.login ?? '?'} (${String(comment.created_at).slice(0, 10)}) :\n${comment.body}`).join('\n\n'),
        attachments,
        attempt: chosen.attempts + 1,
        pullRequest: tracesIn(comments, 'pr').at(-1)?.attrs.number ? Number(tracesIn(comments, 'pr').at(-1).attrs.number) : null,
        branch: pipeline.branchPrefix ? `${pipeline.branchPrefix}${issue.number}-${slugify(issue.title)}` : null,
        url: gh.issueUrl(repo, issue.number),
        runId,
        pipeline: pipeline.name,
    };
    writeFileSync(join(outDir, 'ticket.json'), JSON.stringify(ticket, null, 2));
    console.log(`Ticket : ${repo}#${issue.number} — ${issue.title} (tentative ${ticket.attempt})`);
    return { found: true, ticket };
}
