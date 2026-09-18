import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { isDryRun, slugify, warn } from '../lib/env.mjs';
import { FACTORY_EMAIL, FACTORY_NAME, git, gitStream } from '../lib/git.mjs';
import { buildTrace, truncate } from '../lib/traces.mjs';
import { BASE_BRANCH, GAME_TOPIC, LOCK_LABEL } from '../pipelines.mjs';
import { syncLabels } from '../labels.mjs';

// Bootstrap : concept:approved → repo depuis game-template, renommage, labels, issue spec.
// Script deterministe, aucun appel modele (le slug vient du titre).
export function derive(title) {
    const slug = slugify(title, 30).replace(/-+/g, '-');
    const packageName = `studio.prismo.${slug.replace(/-/g, '')}`;
    const displayName = title.trim().slice(0, 40);
    return { slug, packageName, displayName };
}

export async function bootstrap({ gh, org, pipeline, ticket, workDir }) {
    const { slug, packageName, displayName } = derive(ticket.title);
    const repo = `${org}/${slug}`;
    console.log(`Bootstrap de ${repo} (package ${packageName}) depuis ${org}/game-template`);
    if (isDryRun()) return console.log('DRY RUN : rien de cree.');

    let exists = false;
    try {
        await gh.getRepo(repo);
        exists = true;
        warn(`${repo} existe deja : reprise (labels, issue spec) sans recreer le repo.`);
    } catch (error) {
        if (error.status !== 404) throw error;
    }

    try {
        if (!exists) {
            await gh.createRepoFromTemplate({ template: `${org}/game-template`, owner: org, name: slug, description: truncate(ticket.title, 100) });
            await new Promise((done) => setTimeout(done, 5000));
        }
        await gh.setTopics(repo, [GAME_TOPIC, 'godot', 'android']);
        await syncLabels(gh, repo);

        const targetDir = join(workDir, 'repo');
        rmSync(targetDir, { recursive: true, force: true });
        mkdirSync(targetDir, { recursive: true });
        gitStream(['clone', '--depth', '1', '--quiet', gh.cloneUrl(repo), targetDir]);
        git(['remote', 'set-url', 'origin', gh.publicUrl(repo)], targetDir);
        git(['config', 'user.name', FACTORY_NAME], targetDir);
        git(['config', 'user.email', FACTORY_EMAIL], targetDir);
        let alreadyNamed = false;
        try {
            alreadyNamed = git(['grep', '-l', packageName, '--', 'export_presets.cfg'], targetDir).length > 0;
        } catch {
            alreadyNamed = false; // git grep sort en 1 quand rien ne correspond
        }
        if (!alreadyNamed) {
            execFileSync('bash', ['tools/bootstrap.sh', displayName, packageName, slug], { cwd: targetDir, stdio: 'inherit' });
            git(['add', '-A'], targetDir);
            git(['commit', '-q', '-m', `chore: bootstrap ${slug} from game-template`, '-m', `Package ${packageName}. Concept: ${ticket.url}`], targetDir);
            git(['push', gh.cloneUrl(repo), 'HEAD:refs/heads/main'], targetDir);
        }
        // Branche d integration : les PR de la factory la visent, main ne bouge que par promotion.
        if (!git(['ls-remote', gh.cloneUrl(repo), `refs/heads/${BASE_BRANCH}`], targetDir)) {
            git(['push', gh.cloneUrl(repo), `HEAD:refs/heads/${BASE_BRANCH}`], targetDir);
            console.log(`Branche ${BASE_BRANCH} creee.`);
        }

        const existingSpec = await gh.listIssues(repo, { labels: ['spec'], state: 'all' });
        let spec = existingSpec[0];
        if (!spec) {
            spec = await gh.createIssue(repo, {
                title: `GDD — ${displayName}`,
                body: [ticket.body, '', `Concept d origine : ${ticket.url}`, buildTrace('gdd', { concept: ticket.number, package: packageName })].join('\n'),
                labels: ['spec'],
            });
        }
        const control = await gh.listIssues(repo, { labels: [], state: 'open' });
        if (!control.some((issue) => /^Factory control/.test(issue.title))) {
            const issue = await gh.createIssue(repo, { title: 'Factory control', body: 'Poser le label `factory:paused` ici pour suspendre toutes les pipelines sur ce jeu. Ne pas fermer.', labels: [] });
            try {
                await gh.request('PUT', `/repos/${repo}/issues/${issue.number}/pin`);
            } catch {
                // epinglage non disponible via REST sur ce plan : le label suffit
            }
        }

        await gh.comment(ticket.repo, ticket.number, [buildTrace('bootstrap', { repo, package: packageName, spec: spec.number }), `bootstrap · repo cree : https://github.com/${repo} · GDD : ${gh.issueUrl(repo, spec.number)}`].join('\n'));
        await gh.updateLabels(ticket.repo, ticket.number, { add: ['concept:bootstrapped'], remove: ['concept:approved', LOCK_LABEL] });
        writeFileSync(join(workDir, 'report.json'), JSON.stringify({ status: 'SUCCESS', repo, spec: spec.number }, null, 2));
    } catch (error) {
        await gh.comment(ticket.repo, ticket.number, [buildTrace('run', { pipeline: 'bootstrap', attempt: ticket.attempt, status: 'BLOCKED', cost_usd: 0 }), `bootstrap · echec : ${truncate(error.message, 300)}`, 'Action attendue : corriger puis retirer needs-human.'].join('\n'));
        await gh.updateLabels(ticket.repo, ticket.number, { add: ['needs-human'], remove: [LOCK_LABEL] });
        throw error;
    }
}
