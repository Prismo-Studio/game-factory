import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACTORY_EMAIL, FACTORY_NAME, git, gitStream, isAllowedBranch } from '../lib/git.mjs';
import { BASE_BRANCH } from '../pipelines.mjs';

// Clone neuf, depth 1, remote nettoye du token (charte 07 : l agent lit avec Read, qui
// ignore les fichiers proteges d un hook Bash — .git/config exposerait le token).
export async function prepare({ gh, ticket, pipeline, targetDir }) {
    rmSync(targetDir, { recursive: true, force: true });
    mkdirSync(targetDir, { recursive: true });

    // Une PR fermee sans merge (placeholder retire, reset) ne compte plus : on repart de la base.
    const knownPull = ticket.pullRequest ? await gh.getPull(ticket.repo, ticket.pullRequest) : null;
    const pull = knownPull && knownPull.state === 'open' ? knownPull : null;
    if (knownPull && !pull) console.log(`PR #${knownPull.number} fermee : on repart de ${BASE_BRANCH}.`);
    const branch = pull ? pull.head.ref : ticket.branch;
    const base = pull ? pull.base.ref : BASE_BRANCH;

    console.log(`Clone de ${ticket.repo} (${pull ? branch : base}) vers ${targetDir}`);
    gitStream(['clone', '--branch', pull ? branch : base, '--depth', '50', '--no-tags', '--quiet', gh.cloneUrl(ticket.repo), targetDir]);
    git(['remote', 'set-url', 'origin', gh.publicUrl(ticket.repo)], targetDir);
    git(['config', 'user.name', FACTORY_NAME], targetDir);
    git(['config', 'user.email', FACTORY_EMAIL], targetDir);

    if (pull) {
        // Review + autofix : on travaille sur la branche de la PR, main est recupere pour le diff.
        git(['fetch', '--depth', '50', gh.cloneUrl(ticket.repo), `refs/heads/${base}:refs/remotes/origin/${base}`], targetDir);
    } else if (branch) {
        if (!isAllowedBranch(branch)) throw new Error(`Nom de branche refuse : ${branch}`);
        git(['checkout', '-b', branch], targetDir);
    }

    const head = git(['rev-parse', 'HEAD'], targetDir);
    console.log(`HEAD ${head.slice(0, 7)} sur ${branch ?? base}`);
    const prepared = { branch, base, head, pull: pull ? { number: pull.number, head: pull.head.sha, base: pull.base.ref } : null };
    writeFileSync(join(targetDir, '..', 'prepare.json'), JSON.stringify(prepared, null, 2));
    return prepared;
}
