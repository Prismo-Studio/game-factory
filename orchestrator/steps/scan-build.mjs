import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseTraces } from '../lib/traces.mjs';
import { BASE_BRANCH, GAME_TOPIC, PAUSE_LABEL } from '../pipelines.mjs';

// Numero de build d une release : build-12 -> 12. Le tri se fait dessus et pas sur la date,
// une release republiee garderait sa date d origine.
export function buildNumber(tag) {
    return Number(String(tag).match(/^build-(\d+)/)?.[1] ?? 0);
}

export function lastBuild(releases) {
    return releases.filter((release) => buildNumber(release.tag_name) > 0).sort((a, b) => buildNumber(a.tag_name) - buildNumber(b.tag_name)).at(-1) ?? null;
}

// Le sha reellement livre par une release : la trace fait foi, `target_commitish` peut avoir ete
// resolu en nom de branche par l API.
export function releaseSha(release) {
    return parseTraces(release?.body).find((trace) => trace.kind === 'build')?.attrs.sha ?? release?.target_commitish ?? null;
}

export function headSha(cloneUrl, branch) {
    const output = execFileSync('git', ['ls-remote', cloneUrl, `refs/heads/${branch}`], { encoding: 'utf8' });
    return output.split(/\s+/)[0] || null;
}

// Build : la "file" est la liste des jeux dont `develop` a avance depuis la derniere release.
export async function scanBuild({ gh, org, pipeline, repo: forcedRepo, runId, outDir }) {
    mkdirSync(outDir, { recursive: true });
    const repos = forcedRepo ? [forcedRepo] : (await gh.listOrgRepos(org, { topic: GAME_TOPIC })).map((item) => item.full_name);
    for (const repo of repos) {
        const paused = await gh.listIssues(repo, { labels: [PAUSE_LABEL] });
        if (paused.length) continue;
        let head;
        try {
            head = headSha(gh.cloneUrl(repo), BASE_BRANCH);
        } catch (error) {
            console.log(`  ${repo} : ${BASE_BRANCH} illisible (${error.message.slice(0, 80)})`);
            continue;
        }
        if (!head) {
            console.log(`  ${repo} : pas de branche ${BASE_BRANCH}`);
            continue;
        }
        const previous = lastBuild(await gh.listReleases(repo));
        if (previous && releaseSha(previous) === head) {
            console.log(`  ${repo} : ${previous.tag_name} est deja au sommet de ${BASE_BRANCH}`);
            continue;
        }
        const tag = `build-${buildNumber(previous?.tag_name ?? 'build-0') + 1}`;
        const ticket = {
            repo,
            number: null,
            title: `Build ${tag}`,
            body: '',
            labels: [],
            comments: '',
            attachments: [],
            attempt: 1,
            build: { tag, branch: BASE_BRANCH, sha: head, previousTag: previous?.tag_name ?? null },
            runId,
            pipeline: pipeline.name,
        };
        writeFileSync(join(outDir, 'ticket.json'), JSON.stringify(ticket, null, 2));
        console.log(`A construire : ${repo} ${tag} (${head.slice(0, 7)})`);
        return { found: true, ticket };
    }
    return { found: false, reason: `aucun jeu dont ${BASE_BRANCH} a avance depuis sa derniere release` };
}
