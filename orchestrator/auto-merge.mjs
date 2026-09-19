#!/usr/bin/env node
// Auto-merge cote factory : merge avec GF_GITHUB_TOKEN (un merge fait par GITHUB_TOKEN dans le repo
// du jeu ne declencherait ni build ni on-pr-merged). Conditions (charte 01) : label auto-merge,
// checks `check` + `gate` verts sur le HEAD, aucun humain en changes requested, ticket review:handled
// ou approved (sauf promotion develop→main et PR template-change).
import { env } from './lib/env.mjs';
import { GitHub } from './lib/github.mjs';
import { buildTrace } from './lib/traces.mjs';
import { GAME_TOPIC } from './pipelines.mjs';

const org = env('GF_ORG') ?? 'Prismo-Studio';
const gh = new GitHub();
const REQUIRED = ['ci', 'merge-gate']; // noms de workflows (l API check-runs exige une GitHub App, pas un PAT)

export async function mergeable(repo, pr) {
    const labels = pr.labels.map((label) => label.name);
    if (pr.draft || !labels.includes('auto-merge')) return 'pas de label auto-merge';
    const isPromotion = pr.base.ref === 'main' && pr.head.ref === 'develop';
    if (pr.base.ref === 'main' && !isPromotion && !/^hotfix\//.test(pr.head.ref)) return 'main seulement par promotion';
    const runs = await gh.request('GET', `/repos/${repo}/actions/runs?head_sha=${pr.head.sha}&per_page=50`);
    for (const name of REQUIRED) {
        const run = (runs.workflow_runs ?? []).filter((item) => item.name === name).sort((a, b) => b.run_number - a.run_number)[0];
        if (!run) return `workflow ${name} pas encore lance sur ${pr.head.sha.slice(0, 7)}`;
        if (run.status !== 'completed' || run.conclusion !== 'success') return `workflow ${name} : ${run.status}/${run.conclusion ?? '?'}`;
    }
    const reviews = await gh.listReviews(repo, pr.number);
    const latest = {};
    for (const review of reviews) if (!/^\[gf\]|<!--\s*gf:review/.test(review.body ?? '') && review.user?.type !== 'Bot') latest[review.user.login] = review.state;
    if (Object.values(latest).includes('CHANGES_REQUESTED')) return 'changes requested par un humain';
    if (!isPromotion && !labels.includes('template-change')) {
        const ticket = Number((pr.body ?? '').match(/closes\s+#(\d+)/i)?.[1]);
        if (!ticket) return 'pas de Closes #N';
        const ticketLabels = await gh.labels(repo, ticket);
        if (!ticketLabels.some((label) => ['review:handled', 'approved'].includes(label))) return `ticket #${ticket} pas review:handled`;
        return { ticket };
    }
    return { ticket: null };
}

async function mergeOne(repo, pr, verdict) {
    await gh.request('PUT', `/repos/${repo}/pulls/${pr.number}/merge`, { merge_method: 'squash', commit_title: `${pr.title} (#${pr.number})` });
    await gh.comment(repo, pr.number, `${buildTrace('auto-merge', { sha: pr.head.sha.slice(0, 7), base: pr.base.ref })}\n[gf] auto-merge : checks verts, ticket valide, squash sur ${pr.base.ref}.`);
    if (verdict.ticket) {
        const labels = (await gh.labels(repo, verdict.ticket)).filter((label) => !['review', 'review:handled', 'approved', 'in-progress'].includes(label));
        await gh.updateIssue(repo, verdict.ticket, { labels: [...labels, 'done'], state: 'closed', state_reason: 'completed' });
        await gh.comment(repo, verdict.ticket, `${buildTrace('done', { pr: pr.number })}\ndone · PR #${pr.number} mergee dans ${pr.base.ref}.`);
    }
    if (pr.head.ref !== 'develop') {
        try {
            await gh.request('DELETE', `/repos/${repo}/git/refs/heads/${pr.head.ref}`);
        } catch {
            // branche deja supprimee
        }
    }
    console.log(`${repo}#${pr.number} merge (${pr.head.ref} → ${pr.base.ref})`);
}

const repos = (await gh.listOrgRepos(org, { topic: GAME_TOPIC })).map((repo) => repo.full_name);
let merged = 0;
for (const repo of repos) {
    for (const pr of await gh.listPulls(repo, { state: 'open' })) {
        const verdict = await mergeable(repo, pr);
        if (typeof verdict === 'string') {
            if (pr.labels.some((label) => label.name === 'auto-merge')) console.log(`${repo}#${pr.number} en attente : ${verdict}`);
            continue;
        }
        await mergeOne(repo, pr, verdict);
        merged += 1;
    }
}
console.log(`${merged} PR mergee(s).`);
