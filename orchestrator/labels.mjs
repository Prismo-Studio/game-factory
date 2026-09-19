import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Lecture minimaliste de .github/labels.yml (liste plate name/color/description).
export function parseLabelsYaml(text) {
    const labels = [];
    let current = null;
    for (const line of text.split(/\r?\n/)) {
        const name = line.match(/^- name:\s*"?([^"]+?)"?\s*$/);
        if (name) {
            current = { name: name[1] };
            labels.push(current);
            continue;
        }
        const color = line.match(/^\s+color:\s*"?([0-9a-fA-F]{6})"?/);
        if (color && current) current.color = color[1];
        const description = line.match(/^\s+description:\s*"(.*)"\s*$/);
        if (description && current) current.description = description[1];
    }
    return labels;
}

export async function syncLabels(gh, repo, { prune = false } = {}) {
    const wanted = parseLabelsYaml(readFileSync(resolve(here, '..', '.github', 'labels.yml'), 'utf8'));
    const existing = await gh.listLabels(repo);
    const byName = new Map(existing.map((label) => [label.name, label]));
    for (const label of wanted) {
        if (byName.has(label.name)) await gh.updateLabel(repo, label.name, label);
        else await gh.createLabel(repo, label);
    }
    if (prune) {
        for (const label of existing) if (!wanted.some((item) => item.name === label.name)) await gh.request('DELETE', `/repos/${repo}/labels/${encodeURIComponent(label.name)}`);
    }
    console.log(`${repo} : ${wanted.length} labels synchronises.`);
}
