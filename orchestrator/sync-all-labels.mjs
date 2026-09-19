import { env } from './lib/env.mjs';
import { GitHub } from './lib/github.mjs';
import { syncLabels } from './labels.mjs';
import { GAME_TOPIC } from './pipelines.mjs';

const org = env('GF_ORG') ?? 'Prismo-Studio';
const gh = new GitHub();
for (const repo of [`${org}/game-factory`, `${org}/game-template`]) await syncLabels(gh, repo);
for (const repo of await gh.listOrgRepos(org, { topic: GAME_TOPIC })) await syncLabels(gh, repo.full_name);
