import { readFileSync } from 'node:fs';

// Deuxieme couche independante de --disallowedTools / permissions.deny (voir
// runners/claude-code.mjs, ALWAYS_DENIED_TOOLS). Aucun role de l usine n a besoin d un
// outil de session, d orchestration ou de reseau ; un outil absent de toutes les couches
// passe inapercu (incident Monitor du kit d origine), donc celle-ci refuse tout.
const raw = readFileSync(0, 'utf8');
if (!raw.trim()) process.exit(0);

const event = JSON.parse(raw);
process.stderr.write(`GARDE-FOU GF : outil "${event.tool_name}" toujours interdit dans l usine.\n`);
process.exit(2);
