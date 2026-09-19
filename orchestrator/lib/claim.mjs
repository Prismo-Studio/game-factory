import { buildTrace, claimsIn, tracesIn } from './traces.mjs';
import { LOCK_LABEL, CLAIM_WINDOW_MS } from '../pipelines.mjs';

// Le label in-progress n est pas atomique : on ecrit une revendication, on relit, la plus
// ancienne de moins de 15 min gagne (charte 01-board.md). Porte du kit d origine.
export async function claimIssue(gh, repo, number, { pipeline, runId, lock = true, windowMs = CLAIM_WINDOW_MS }) {
    if (lock) await gh.addLabels(repo, number, [LOCK_LABEL]);
    await gh.comment(repo, number, `${buildTrace('claim', { pipeline, run: runId })}\nPrise en charge par ${pipeline} (run ${runId}).`);
    const comments = await gh.listComments(repo, number);
    const winner = claimsIn(comments, pipeline, windowMs)[0];
    if (!winner) {
        console.log(`  #${number} : revendication introuvable apres ecriture, on passe.`);
        return false;
    }
    if (winner.attrs.run !== String(runId)) {
        console.log(`  #${number} : deja revendique par le run ${winner.attrs.run}.`);
        return false;
    }
    console.log(`  #${number} : revendication obtenue.`);
    return true;
}

// Temps ecoule depuis la derniere revendication sur les tickets recemment mis a jour.
export async function msSinceLastClaim(gh, repos, { lookback = 5 } = {}) {
    let latest = 0;
    for (const repo of repos) {
        const issues = await gh.listIssues(repo, { state: 'all', since: new Date(Date.now() - 6 * 3_600_000).toISOString() });
        for (const issue of issues.slice(-lookback)) {
            const comments = await gh.listComments(repo, issue.number);
            for (const trace of tracesIn(comments, 'claim')) latest = Math.max(latest, trace.createdAt);
        }
    }
    return latest ? Date.now() - latest : Number.POSITIVE_INFINITY;
}
