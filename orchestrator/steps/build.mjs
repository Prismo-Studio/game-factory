import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { git, gitStream } from '../lib/git.mjs';
import { buildTrace } from '../lib/traces.mjs';

// Chemin de l APK tel que le jeu le declare : un jeu peut renommer son preset, on ne devine pas.
export function apkPath(targetDir) {
    const presets = join(targetDir, 'export_presets.cfg');
    const declared = existsSync(presets) ? readFileSync(presets, 'utf8').match(/^export_path\s*=\s*"([^"]+\.apk)"/m)?.[1] : null;
    return join(targetDir, declared ?? 'build/game-debug.apk');
}

// Pipeline Build (charte 02, etape 7) : `develop` a avance, on publie une release build-N avec
// l APK. C est cette release qui declenche la QA, donc c est le maillon qui reboucle l usine :
// sans elle, la QA n a jamais rien a tester et plus aucun ticket ne nait apres le lot initial.
export async function buildRelease({ gh, ticket, targetDir, reportFile }) {
    const { tag, branch, sha, previousTag } = ticket.build;
    gitStream(['clone', '--branch', branch, '--depth', '50', '--no-tags', '--quiet', gh.cloneUrl(ticket.repo), targetDir]);
    git(['checkout', '--quiet', sha], targetDir);

    const make = spawnSync('make', ['export'], { cwd: targetDir, stdio: 'inherit', env: { ...process.env, GF_SKIP_EXPORT: '' } });
    if (make.status !== 0) {
        writeFileSync(reportFile, JSON.stringify({ status: 'BLOCKED', kind: 'needs-human', reason: `L export Android a echoue sur ${branch} (${sha.slice(0, 7)}).`, actionRequired: 'Consulter les logs du run : keystore, version de Godot, ou modele Android casse.' }, null, 2));
        return { published: false };
    }
    const apk = apkPath(targetDir);
    if (!existsSync(apk)) {
        writeFileSync(reportFile, JSON.stringify({ status: 'BLOCKED', kind: 'needs-human', reason: `L export s est termine sans erreur mais ${apk} est absent.`, actionRequired: 'Verifier export_path dans export_presets.cfg.' }, null, 2));
        return { published: false };
    }

    const log = previousTag ? git(['log', '--oneline', '--no-merges', `${previousTag}..HEAD`], targetDir) : git(['log', '--oneline', '--no-merges', '-20'], targetDir);
    const body = [
        buildTrace('build', { sha, branch, run: ticket.runId }),
        `Export debug de \`${branch}\` a \`${sha.slice(0, 7)}\`.`,
        '',
        '## Changements depuis ' + (previousTag ?? 'le debut'),
        '',
        log || '(aucun commit)',
    ].join('\n');

    const release = await gh.createRelease(ticket.repo, { tag, name: tag, body, prerelease: true, targetCommitish: sha });
    await gh.uploadReleaseAsset(ticket.repo, release, { name: `${ticket.repo.split('/')[1]}-${tag}.apk`, data: readFileSync(apk), contentType: 'application/vnd.android.package-archive' });
    const sizeMo = (statSync(apk).size / 1048576).toFixed(1);
    writeFileSync(reportFile, JSON.stringify({ status: 'SUCCESS', summary: `Release ${tag} publiee (${sizeMo} Mo).`, release: { tag, id: release.id, sha } }, null, 2));
    console.log(`Release ${tag} publiee sur ${ticket.repo} (${sizeMo} Mo).`);
    return { published: true, tag };
}
