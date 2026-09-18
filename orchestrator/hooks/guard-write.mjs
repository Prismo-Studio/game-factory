import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { commandDenial, pathDenial } from './rules.mjs';

// Profil `write` (Dev, Review + autofix, Assets) — charte 07-garde-fous.md.
function deny(reason) {
    process.stderr.write(`GARDE-FOU GF : action refusee — ${reason}.\n`);
    process.exit(2);
}

const raw = readFileSync(0, 'utf8');
if (!raw.trim()) process.exit(0);

const event = JSON.parse(raw);
const toolInput = event.tool_input ?? {};
const profile = process.env.GF_PROFILE ?? 'write';

if (event.tool_name === 'Bash') {
    if (toolInput.run_in_background === true) {
        deny('les taches de fond ne remontent jamais leur resultat en mode headless : lance la commande au premier plan');
    }
    const reason = commandDenial(String(toolInput.command ?? ''), { profile });
    if (reason) deny(reason);
    process.exit(0);
}

const filePath = toolInput.file_path ?? toolInput.notebook_path;
if (!filePath) process.exit(0);

const absolute = resolve(filePath);
const reportFile = process.env.GF_REPORT_FILE ? resolve(process.env.GF_REPORT_FILE) : null;
if (reportFile && absolute === reportFile) process.exit(0);

const reason = pathDenial(absolute, resolve(event.cwd ?? process.cwd()));
if (reason) deny(reason);
process.exit(0);
