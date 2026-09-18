import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { git } from '../lib/git.mjs';
import { findAsset, parseArtTicket, SOURCES } from '../lib/assets.mjs';

const BUDGET = { props: 300, characters: 1500, vehicles: 1200, environment: 2000, ui3d: 200 };

// Pipeline Assets, niveau 1 et 2 de la cascade (charte 05) : bibliotheque CC0 → placeholder.
// Script deterministe : aucun appel modele. Blender (niveau 3) viendra avec le label art:hero.
export async function produceAsset({ ticket, targetDir, reportFile }) {
    const query = parseArtTicket(ticket.body);
    const blocked = (reason, action) => {
        writeFileSync(reportFile, JSON.stringify({ status: 'BLOCKED', kind: 'needs-human', ticket: ticket.number, reason, actionRequired: action }, null, 2));
        return { found: false };
    };
    if (!query.name || !query.category || !query.size) return blocked('Ticket art incomplet : nom, categorie ou dimensions manquants.', 'Remplir le gabarit Asset (nom snake_case, categorie, dimensions L x H x P).');
    const folder = join(targetDir, 'game', 'assets', 'models', query.category, query.name);
    mkdirSync(folder, { recursive: true });
    const maxTriangles = BUDGET[query.category] ?? SOURCES.style.max_triangles_default;

    const found = await findAsset(query, { maxTriangles });
    console.log(`Recherche ${query.name} (${query.keywords.join(', ')}) : ${JSON.stringify(found.attempts)}`);
    let meta;
    let placeholder = false;
    if (found.candidate) {
        writeFileSync(join(folder, `${query.name}.glb`), found.buffer);
        const scale = Number(found.scale.toFixed(4));
        const scaledMin = found.stats.bounds.min.map((value) => value * scale);
        const scaledMax = found.stats.bounds.max.map((value) => value * scale);
        const center = scaledMin.map((value, axis) => (value + scaledMax[axis]) / 2);
        const offset = query.pivot === 'bottom_center' ? [-center[0], -scaledMin[1], -center[2]] : center.map((value) => -value);
        const bounds = { min: scaledMin.map((value, axis) => Number((value + offset[axis]).toFixed(4))), max: scaledMax.map((value, axis) => Number((value + offset[axis]).toFixed(4))) };
        meta = {
            name: query.name, category: query.category, version: 1, source: `library:${found.candidate.id}`, units: 'meters',
            bounds, pivot: query.pivot, attach_points: { top: [0, bounds.max[1], 0] }, triangles: found.stats.triangles,
            palette_slots: [], collision: query.collision, ticket: ticket.number,
            scale, offset: offset.map((value) => Number(value.toFixed(4))), license: found.candidate.license, attribution: found.candidate.attribution ?? '', origin: found.candidate.download ?? found.candidate.file ?? '',
        };
    } else {
        placeholder = true;
        execFileSync('python3', ['tools/bpy/placeholder.py', query.name, query.category, ...query.size.map(String), query.pivot, query.collision, String(ticket.number)], { cwd: targetDir, stdio: 'inherit' });
        meta = null;
    }
    if (meta) writeFileSync(join(folder, `${query.name}.asset.json`), JSON.stringify(meta, null, 2));
    execFileSync('python3', ['tools/asset_prefab.py', query.name], { cwd: targetDir, stdio: 'inherit' });
    execFileSync('python3', ['tools/asset_check.py'], { cwd: targetDir, stdio: 'inherit' });

    git(['add', '-A'], targetDir);
    git(['commit', '-q', '-m', `art(#${ticket.number}): ${placeholder ? 'placeholder' : 'library asset'} ${query.name}`, '-m', placeholder ? 'No CC0 match found: placeholder respecting the asset contract.' : `Source ${meta.source}, ${meta.triangles} triangles, scale ${meta.scale}. ${meta.attribution}`, '-m', `Closes #${ticket.number}`], targetDir);

    const summary = placeholder
        ? `Aucun modele CC0 trouve pour « ${query.keywords.join(', ')} » (${found.attempts.map((item) => item.source + (item.skipped ? ' ignore : ' + item.skipped : '')).join(' ; ')}) : placeholder conforme pose, un humain fournira l asset.`
        : `Asset ${query.name} pris dans ${found.candidate.id} (${meta.triangles} triangles, licence ${meta.license}), mis a l echelle ${meta.scale} et pivote ${query.pivot}. Attribution : ${meta.attribution}.`;
    writeFileSync(reportFile, JSON.stringify({
        status: 'SUCCESS', ticket: ticket.number, placeholder, summary,
        changes: `game/assets/models/${query.category}/${query.name}/ : ${placeholder ? 'asset.json (placeholder)' : 'glb + asset.json'} + prefab ${query.name}.tscn.\nCA1 — asset.json valide (make asset-check vert).\nCA2 — prefab genere.\nCA3 — bounds et pivot derives des dimensions du ticket.\nCA4 — ${placeholder ? 'sans glb (placeholder)' : `${meta.triangles} triangles <= budget ${maxTriangles}`}.`,
        checks: 'tools/asset_prefab.py et tools/asset_check.py OK. Recoloration palette non appliquee (pas de Blender sur le runner) : couleurs d origine.',
        notes: placeholder ? '' : 'Verifier visuellement que le modele correspond a l usage decrit ; sinon retirer le glb pour retomber en placeholder.',
        commitTitle: `art(#${ticket.number}): ${placeholder ? 'placeholder' : 'library asset'} ${query.name}`, commitBody: '', prTitle: `#${ticket.number} — Asset ${query.name}${placeholder ? ' (placeholder)' : ''}`,
    }, null, 2));
    return { found: !placeholder };
}
