#!/usr/bin/env node
// Battement de coeur de l usine : reveille les pipelines a intervalle fixe.
//
// Les crons GitHub Actions ne sont pas fiables sur un depot prive peu actif : ils sautent des
// executions, parfois pendant des heures (constate le 19/09 : aucun run dev entre 13h17 et 15h51).
// Le chainage ne suffit pas non plus, il ne relance que tant que quelque chose tourne deja.
// Ce script, lance en boucle sur la machine qui heberge les runners, garantit le reveil.
//
// `promote` et `qa` en font partie : ce sont elles qui rebouclent l usine (develop avance -> promotion -> release
// -> QA joue le build -> tickets origin:qa -> triage -> dev). Les retirer de cette liste arrete la
// generation de tickets des que le lot initial est epuise.
//
//   node orchestrator/heartbeat.mjs [--once] [--every 600]

import { env, warn } from './lib/env.mjs';
import { GitHub } from './lib/github.mjs';

const PIPELINES = (env('GF_HEARTBEAT_PIPELINES') ?? 'triage,dev,review,assets,spec,bootstrap,promote,qa').split(',').map((name) => name.trim()).filter(Boolean);
const org = env('GF_ORG') ?? 'Prismo-Studio';
const args = process.argv.slice(2);
const once = args.includes('--once');
const everyS = Number(args[args.indexOf('--every') + 1]) || Number(env('GF_HEARTBEAT_EVERY_S')) || 600;
const gh = new GitHub();

async function beat() {
    for (const pipeline of PIPELINES) {
        try {
            await gh.dispatchWorkflow(`${org}/game-factory`, `${pipeline}.yml`, { ref: 'main' });
            console.log(`${new Date().toISOString().slice(11, 19)} reveil ${pipeline}`);
        } catch (error) {
            warn(`reveil ${pipeline} impossible : ${error.message}`);
        }
    }
}

await beat();
if (!once) {
    console.log(`Battement toutes les ${everyS} s sur : ${PIPELINES.join(', ')}`);
    setInterval(() => { beat().catch((error) => warn(error.message)); }, everyS * 1000);
}
