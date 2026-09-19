import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTraces } from '../lib/traces.mjs';
import { GAME_TOPIC, PAUSE_LABEL } from '../pipelines.mjs';

// QA : la "file" est la liste des releases build-* dont le corps ne porte pas encore gf:qa.
export function pendingReleases(releases) {
    return releases
        .filter((release) => /^build-\d+/.test(release.tag_name))
        .filter((release) => !parseTraces(release.body).some((trace) => trace.kind === 'qa'))
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

export async function scanRelease({ gh, org, pipeline, repo: forcedRepo, tag, runId, outDir }) {
    mkdirSync(outDir, { recursive: true });
    const repos = forcedRepo ? [forcedRepo] : (await gh.listOrgRepos(org, { topic: GAME_TOPIC })).map((item) => item.full_name);
    for (const repo of repos) {
        const paused = await gh.listIssues(repo, { labels: [PAUSE_LABEL] });
        if (paused.length) continue;
        const releases = await gh.listReleases(repo);
        const candidates = tag ? releases.filter((release) => release.tag_name === tag) : pendingReleases(releases);
        // Seule la plus recente compte : tester un build deja remplace n apporte rien.
        const release = candidates.at(-1);
        if (!release) continue;
        const apk = (release.assets ?? []).find((asset) => asset.name.endsWith('.apk'));
        const gdd = (await gh.listIssues(repo, { labels: ['spec:done'], state: 'all' }))[0] ?? (await gh.listIssues(repo, { labels: ['spec'], state: 'all' }))[0];
        const ticket = {
            repo,
            number: null,
            title: `QA ${release.tag_name}`,
            body: gdd ? `## GDD (issue #${gdd.number})\n\n${gdd.body}` : '(GDD introuvable)',
            labels: [],
            comments: '',
            attachments: [],
            attempt: 1,
            release: { id: release.id, tag: release.tag_name, body: release.body ?? '', apkUrl: apk?.url ?? null, apkName: apk?.name ?? null, sha: release.target_commitish },
            runId,
            pipeline: pipeline.name,
        };
        writeFileSync(join(outDir, 'ticket.json'), JSON.stringify(ticket, null, 2));
        console.log(`Release a tester : ${repo} ${release.tag_name}`);
        return { found: true, ticket };
    }
    return { found: false, reason: 'aucune release build-* sans trace gf:qa' };
}
