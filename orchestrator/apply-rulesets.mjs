#!/usr/bin/env node
// Applique game-template/.github/rulesets/*.json a un repo (cree ou met a jour). Echoue en 403 sur un
// repo prive d org gratuite : passer le repo en public ou l org en Pro.
//   node orchestrator/apply-rulesets.mjs --repo Prismo-Studio/<jeu> [--dir ../game-template/.github/rulesets]
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GitHub } from './lib/github.mjs';

const args = process.argv.slice(2);
const repo = args[args.indexOf('--repo') + 1];
const dir = resolve(args.includes('--dir') ? args[args.indexOf('--dir') + 1] : '../game-template/.github/rulesets');
if (!repo) throw new Error('--repo owner/name requis');
const gh = new GitHub();
const existing = await gh.request('GET', `/repos/${repo}/rulesets`).catch(() => []);
for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
    const ruleset = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const found = (existing ?? []).find((item) => item.name === ruleset.name);
    if (found) await gh.request('PUT', `/repos/${repo}/rulesets/${found.id}`, ruleset);
    else await gh.request('POST', `/repos/${repo}/rulesets`, ruleset);
    console.log(`${repo} : ruleset ${ruleset.name} ${found ? 'mis a jour' : 'cree'}`);
}
