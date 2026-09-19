import { readFileSync } from 'node:fs';
import { qaBashDenial } from './rules.mjs';

// Profil `qa` : lecture seule sur le repo, Bash limite a adb / godot headless / maestro / lecture.
function deny(reason) {
    process.stderr.write(`GARDE-FOU GF : action refusee — ${reason}.\n`);
    process.exit(2);
}

const raw = readFileSync(0, 'utf8');
if (!raw.trim()) process.exit(0);

const event = JSON.parse(raw);
if (['Edit', 'NotebookEdit', 'MultiEdit'].includes(event.tool_name)) deny('QA ne modifie pas le code');
if (event.tool_name === 'Write') {
    const target = String(event.tool_input?.file_path ?? '').replace(/\\/g, '/');
    const reportFile = (process.env.GF_REPORT_FILE ?? '').replace(/\\/g, '/');
    if (target !== reportFile && !/\/build\/qa\//.test(target)) deny('QA n ecrit que son rapport et build/qa/');
}
if (event.tool_name === 'Bash') {
    if (event.tool_input?.run_in_background === true) deny('pas de tache de fond en headless');
    const reason = qaBashDenial(String(event.tool_input?.command ?? ''));
    if (reason) deny(reason);
}
process.exit(0);
