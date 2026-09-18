#!/usr/bin/env node
// Point d entree unique de l usine. Meme commande en local et dans GitHub Actions.
//
//   node orchestrator/run.mjs <pipeline> [--repo owner/name] [--issue N] [--dry-run] [--runner claude|interactive] [--work DIR]
//   node orchestrator/run.mjs finalize --work DIR          (apres un run interactif)
//   node orchestrator/run.mjs labels --repo owner/name     (sync de .github/labels.yml)
//
// Variables : GF_GITHUB_TOKEN (obligatoire), GF_ORG (defaut Prismo-Studio), ANTHROPIC_API_KEY (runner claude),
// GF_LLM_BACKEND=ollama|anthropic, GF_DRY_RUN, GF_ENABLED, GF_COOLDOWN_MIN, GF_<PIPELINE>_MAX_COST_USD…

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { env, isDryRun, setOutput, warn } from './lib/env.mjs';
import { GitHub } from './lib/github.mjs';
import { pipelineConfig } from './pipelines.mjs';
import { scan } from './steps/scan.mjs';
import { prepare } from './steps/prepare.mjs';
import { run } from './steps/run.mjs';
import { finalize, readReport } from './steps/finalize.mjs';
import { bootstrap } from './steps/bootstrap.mjs';
import { scanRelease } from './steps/scan-release.mjs';
import { produceAsset } from './steps/assets.mjs';
import { syncLabels } from './labels.mjs';

function parseArgs(argv) {
    const [command, ...rest] = argv;
    const options = {};
    for (let index = 0; index < rest.length; index += 1) {
        const arg = rest[index];
        if (!arg.startsWith('--')) continue;
        const key = arg.slice(2);
        const next = rest[index + 1];
        if (next === undefined || next.startsWith('--')) options[key] = true;
        else {
            options[key] = next;
            index += 1;
        }
    }
    return { command, options };
}

const { command, options } = parseArgs(process.argv.slice(2));
if (!command) {
    console.log('Usage : node orchestrator/run.mjs <pipeline|finalize|labels> [--repo] [--issue] [--dry-run] [--runner] [--work]');
    process.exit(1);
}
if (options['dry-run']) process.env.GF_DRY_RUN = 'true';

const org = env('GF_ORG') ?? 'Prismo-Studio';
const gh = new GitHub();
const runId = env('GITHUB_RUN_ID') ?? `local-${Date.now().toString(36)}`;

if (command === 'labels') {
    await syncLabels(gh, options.repo ?? `${org}/game-factory`);
    process.exit(0);
}

if (command === 'finalize') {
    const workDir = resolve(options.work);
    const state = JSON.parse(readFileSync(join(workDir, 'state.json'), 'utf8'));
    const pipeline = pipelineConfig(state.pipeline);
    const prepared = existsSync(join(workDir, 'prepare.json')) ? JSON.parse(readFileSync(join(workDir, 'prepare.json'), 'utf8')) : null;
    await finalize({ gh, org, pipeline, ticket: state.ticket, prepared, targetDir: join(workDir, 'repo'), reportFile: join(workDir, 'report.json'), stats: { cost: 0, turns: 0, durationS: 0, model: 'interactive' } });
    process.exit(0);
}

const pipeline = pipelineConfig(command);
const workDir = resolve(options.work ?? join(env('GF_WORK') ?? env('RUNNER_TEMP') ?? '/tmp/gf', `${pipeline.name}-${runId}`));
const targetDir = join(workDir, 'repo');
mkdirSync(workDir, { recursive: true });
console.log(`Pipeline ${pipeline.name} · run ${runId} · ${isDryRun() ? 'DRY RUN' : 'reel'} · work ${workDir}`);

if (pipeline.name === 'bootstrap') {
    const found = await scan({ gh, pipeline, org, repo: options.repo, issue: options.issue ? Number(options.issue) : undefined, runId, outDir: workDir });
    if (!found.found) {
        console.log(`Rien a faire : ${found.reason}`);
        setOutput('hasTicket', 'false');
        process.exit(0);
    }
    await bootstrap({ gh, org, pipeline, ticket: found.ticket, workDir });
    process.exit(0);
}

let ticket;
if (pipeline.trigger === 'release') {
    const found = await scanRelease({ gh, org, pipeline, repo: options.repo, tag: options.tag, runId, outDir: workDir });
    if (!found.found) {
        console.log(`Rien a faire : ${found.reason}`);
        setOutput('hasTicket', 'false');
        process.exit(0);
    }
    ticket = found.ticket;
} else if (pipeline.trigger === 'dispatch') {
    ticket = { repo: `${org}/game-factory`, number: null, title: options.theme ?? 'Nouveau concept', body: options.theme ? `Theme impose : ${options.theme}` : '', labels: [], comments: '', attachments: [], attempt: 1, runId, pipeline: pipeline.name };
    writeFileSync(join(workDir, 'ticket.json'), JSON.stringify(ticket, null, 2));
} else {
    const found = await scan({ gh, pipeline, org, repo: options.repo, issue: options.issue ? Number(options.issue) : undefined, runId, outDir: workDir });
    if (!found.found) {
        console.log(`Rien a faire : ${found.reason}`);
        setOutput('hasTicket', 'false');
        process.exit(0);
    }
    ticket = found.ticket;
}
setOutput('hasTicket', 'true');
writeFileSync(join(workDir, 'state.json'), JSON.stringify({ pipeline: pipeline.name, ticket, runId }, null, 2));

let prepared = null;
let stats = null;
try {
    if (pipeline.runner === 'claude-code' || pipeline.name === 'assets') prepared = await prepare({ gh, ticket, pipeline, targetDir });
    if (pipeline.name === 'assets') {
        await produceAsset({ ticket, targetDir, reportFile: join(workDir, 'report.json') });
        stats = { cost: 0, turns: 0, durationS: 0, model: 'script' };
    } else {
        const result = await run({ gh, pipeline, ticket, prepared, targetDir, workDir, runner: options.runner ?? 'claude' });
        if (result.interactive) process.exit(0);
        stats = result;
    }
} catch (error) {
    warn(`Etape run en erreur : ${error.message}`);
    writeFileSync(join(workDir, 'report.json'), JSON.stringify({ status: 'BLOCKED', kind: 'needs-human', reason: `Erreur d infrastructure : ${error.message.slice(0, 300)}`, actionRequired: 'Consulter les logs du run.' }, null, 2));
}

await finalize({ gh, org, pipeline, ticket, prepared, targetDir, reportFile: join(workDir, 'report.json'), report: readReport(join(workDir, 'report.json')), stats: stats ?? { cost: 0, turns: 0, durationS: 0 } });
