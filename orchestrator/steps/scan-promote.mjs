import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE_BRANCH, GAME_TOPIC, LOCK_LABEL, PAUSE_LABEL, RELEASE_BRANCH } from '../pipelines.mjs';

// Un ticket encore en file ou en cours signifie que l increment n est pas fini. Promouvoir a ce
// moment-la envoie a la QA un jeu a moitie construit : elle rapporte alors l absence de tout ce
// qui est deja dans le backlog, et chaque manque devient un ticket en double. On attend donc que
// la file soit vide — ce qui est aussi le moment ou l usine n a plus rien a faire et a besoin que
// la QA lui redonne du travail.
const BUSY = (label) => label.startsWith('todo:') || label === 'review' || label === LOCK_LABEL;

export function pendingWork(issues) {
    return issues.filter((issue) => (issue.labels ?? []).some((label) => BUSY(typeof label === 'string' ? label : label.name)));
}

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
        const busy = pendingWork(await gh.listIssues(repo, { state: 'open' }));
        if (busy.length) {
            console.log(`  ${repo} : ${busy.length} ticket(s) encore en file (${busy.slice(0, 5).map((issue) => `#${issue.number}`).join(', ')}) — increment non termine.`);
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
