import { execFileSync, spawnSync } from 'node:child_process';
import { sanitizeSecrets } from './env.mjs';

export function git(args, cwd) {
    try {
        return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch (error) {
        throw new Error(sanitizeSecrets(`git ${args.join(' ')} : ${error.stderr || error.message}`));
    }
}

export function gitStream(args, cwd) {
    const result = spawnSync('git', args, { cwd, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(sanitizeSecrets(`git ${args.join(' ')} a echoue (code ${result.status})`));
}

export const FACTORY_NAME = 'Game Factory';
export const FACTORY_EMAIL = 'factory@prismo.studio';

export const BRANCH_PREFIXES = ['feat/', 'fix/', 'art/', 'chore/'];

export function isAllowedBranch(name) {
    return BRANCH_PREFIXES.some((prefix) => String(name).startsWith(prefix)) && /^[a-z]+\/\d+-[a-z0-9-]+$/.test(name);
}

export function forcePushArgs(url, branch, expectedTip) {
    return ['push', `--force-with-lease=refs/heads/${branch}:${expectedTip}`, url, `HEAD:refs/heads/${branch}`];
}
