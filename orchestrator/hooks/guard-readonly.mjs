import { readFileSync } from 'node:fs';
import { readonlyBashDenial } from './rules.mjs';

// Profil `read-only` (Spec) : aucune ecriture, Bash limite a git en lecture.
function deny(reason) {
    process.stderr.write(`GARDE-FOU GF : action refusee — ${reason}.\n`);
    process.exit(2);
}

const raw = readFileSync(0, 'utf8');
if (!raw.trim()) process.exit(0);

const event = JSON.parse(raw);
if (['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(event.tool_name)) deny('cet agent est en lecture seule');
if (event.tool_name === 'Bash') {
    if (event.tool_input?.run_in_background === true) deny('pas de tache de fond en headless');
    const reason = readonlyBashDenial(String(event.tool_input?.command ?? ''));
    if (reason) deny(reason);
}
process.exit(0);
