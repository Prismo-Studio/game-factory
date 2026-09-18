#!/usr/bin/env node
// Agrege les balises gf:run de tous les repos de jeux → dashboard/out/{data.json,index.html}.
// Aucune base : si ce script disparait, GitHub a tout (charte 06-budgets.md).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../orchestrator/lib/env.mjs';
import { GitHub } from '../orchestrator/lib/github.mjs';
import { tracesIn } from '../orchestrator/lib/traces.mjs';
import { GAME_TOPIC } from '../orchestrator/pipelines.mjs';

const org = env('GF_ORG') ?? 'Prismo-Studio';
const gh = new GitHub();
const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(outDir, { recursive: true });

const repos = [`${org}/game-factory`, ...(await gh.listOrgRepos(org, { topic: GAME_TOPIC })).map((repo) => repo.full_name)];
const rows = [];
const board = {};
for (const repo of repos) {
    const issues = await gh.listIssues(repo, { state: 'all' });
    board[repo] = {};
    for (const issue of issues) {
        for (const label of issue.labels.map((item) => item.name)) board[repo][label] = (board[repo][label] ?? 0) + 1;
        const comments = await gh.listComments(repo, issue.number);
        for (const trace of tracesIn(comments, 'run')) {
            rows.push({ repo, issue: issue.number, title: issue.title, pipeline: trace.attrs.pipeline, status: trace.attrs.status, cost: Number(trace.attrs.cost_usd) || 0, turns: Number(trace.attrs.turns) || 0, duration: Number(trace.attrs.duration_s) || 0, model: trace.attrs.model ?? '', at: new Date(trace.createdAt).toISOString() });
        }
    }
}
const week = (iso) => { const d = new Date(iso); const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - start) / 86_400_000 + start.getUTCDay() + 1) / 7)).padStart(2, '0')}`; };
const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);
const group = (items, fn) => items.reduce((acc, item) => { const key = fn(item); (acc[key] ??= []).push(item); return acc; }, {});
const monthCost = sum(rows.filter((row) => row.at.slice(0, 7) === new Date().toISOString().slice(0, 7)), 'cost');
const data = {
    generatedAt: new Date().toISOString(),
    monthCostUsd: monthCost,
    monthlyCapUsd: Number(env('GF_MONTHLY_CAP_USD') ?? 100),
    byRepo: Object.fromEntries(Object.entries(group(rows, (row) => row.repo)).map(([key, items]) => [key, { runs: items.length, cost: sum(items, 'cost'), success: items.filter((row) => row.status === 'SUCCESS').length }])),
    byPipeline: Object.fromEntries(Object.entries(group(rows, (row) => row.pipeline)).map(([key, items]) => [key, { runs: items.length, cost: sum(items, 'cost'), success: items.filter((row) => row.status === 'SUCCESS').length, avgDuration: items.length ? Math.round(sum(items, 'duration') / items.length) : 0 }])),
    byWeek: Object.fromEntries(Object.entries(group(rows, (row) => week(row.at))).map(([key, items]) => [key, { runs: items.length, cost: sum(items, 'cost') }])),
    board,
    runs: rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200),
};
writeFileSync(join(outDir, 'data.json'), JSON.stringify(data, null, 2));
const table = (title, obj, cols) => `<h2>${title}</h2><table><tr><th></th>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>${Object.entries(obj).map(([k, v]) => `<tr><td>${k}</td>${cols.map((c) => `<td>${typeof v[c] === 'number' ? (c === 'cost' ? v[c].toFixed(2) + ' $' : v[c]) : v[c] ?? ''}</td>`).join('')}</tr>`).join('')}</table>`;
writeFileSync(join(outDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>game-factory</title><style>body{font:14px system-ui;margin:2rem;background:#111;color:#eee}table{border-collapse:collapse;margin-bottom:2rem}td,th{border:1px solid #333;padding:4px 10px;text-align:left}h1 small{color:#888}</style>
<h1>game-factory <small>${data.generatedAt}</small></h1><p>Mois en cours : <b>${monthCost.toFixed(2)} $</b> / ${data.monthlyCapUsd} $</p>
${table('Par jeu', data.byRepo, ['runs', 'success', 'cost'])}${table('Par pipeline', data.byPipeline, ['runs', 'success', 'cost', 'avgDuration'])}${table('Par semaine', data.byWeek, ['runs', 'cost'])}
<h2>Board</h2>${Object.entries(board).map(([repo, labels]) => `<p><b>${repo}</b> : ${Object.entries(labels).map(([l, n]) => `${l} ${n}`).join(' · ')}</p>`).join('')}
<h2>Derniers runs</h2><table><tr><th>date</th><th>repo</th><th>#</th><th>pipeline</th><th>statut</th><th>cout</th><th>tours</th><th>duree</th></tr>${data.runs.map((r) => `<tr><td>${r.at.slice(0, 16)}</td><td>${r.repo.split('/')[1]}</td><td>${r.issue}</td><td>${r.pipeline}</td><td>${r.status}</td><td>${r.cost.toFixed(2)}</td><td>${r.turns}</td><td>${r.duration}s</td></tr>`).join('')}</table>`);
console.log(`Dashboard : ${join(outDir, 'index.html')} — ${rows.length} runs, ${monthCost.toFixed(2)} $ ce mois.`);
