import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE_BRANCH, GAME_TOPIC, PAUSE_LABEL, RELEASE_BRANCH } from '../pipelines.mjs';

// Promote : la "file" est la liste des jeux dont `develop` est en avance sur `main`.
// La release elle-meme est produite par le workflow `build.yml` du depot du jeu, au push sur
// `main` — l usine ne la fabrique pas, elle declenche seulement la promotion qui y mene.
export async function scanPromote({ gh, org, pipeline, repo: forcedRepo, runId, outDir }) {
    mkdirSync(outDir, { recursive: true });
    const repos = forcedRepo ? [forcedRepo] : (await gh.listOrgRepos(org, { topic: GAME_TOPIC })).map((item) => item.full_name);
    for (const repo of repos) {
        const paused = await gh.listIssues(repo, { labels: [PAUSE_LABEL] });
        if (paused.length) continue;
        let comparison;
        try {
            comparison = await gh.request('GET', `/repos/${repo}/compare/${RELEASE_BRANCH}...${BASE_BRANCH}`);
        } catch (error) {
            console.log(`  ${repo} : comparaison impossible (${error.message.slice(0, 80)})`);
            continue;
        }
        if (!comparison.ahead_by) {
            console.log(`  ${repo} : ${BASE_BRANCH} n a rien de plus que ${RELEASE_BRANCH}`);
            continue;
        }
        const ticket = {
            repo, number: null, title: `Promotion ${BASE_BRANCH} → ${RELEASE_BRANCH}`, body: '', labels: [], comments: '', attachments: [], attempt: 1,
            promote: { ahead: comparison.ahead_by, sha: comparison.commits.at(-1)?.sha ?? null },
            runId, pipeline: pipeline.name,
        };
        writeFileSync(join(outDir, 'ticket.json'), JSON.stringify(ticket, null, 2));
        console.log(`A promouvoir : ${repo} (${comparison.ahead_by} commit(s) d avance)`);
        return { found: true, ticket };
    }
    return { found: false, reason: `aucun jeu dont ${BASE_BRANCH} est en avance sur ${RELEASE_BRANCH}` };
}
