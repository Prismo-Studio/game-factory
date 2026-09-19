import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.mjs';
import { glbStats, fitScale } from './glb.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const SOURCES = JSON.parse(readFileSync(resolve(here, '..', '..', 'assets', 'sources.json'), 'utf8'));

// --- ticket art → requete ---
export function parseArtTicket(body) {
    const text = String(body ?? '');
    // Le libelle doit ouvrir sa ligne (gabarit « - Nom : `x` ») : sinon une phrase du contexte
    // comme « meme nom, meme dossier : le glb… » serait lue comme le nom de l asset.
    const field = (label) => text.match(new RegExp(`^[-*\\s]*\\*{0,2}(?:${label})\\*{0,2}[^\\n:：]*[:：]\\s*\`?([^\\n\`]+)`, 'im'))?.[1]?.trim();
    const name = (field('Nom') ?? '').match(/[a-z0-9_]+/)?.[0] ?? text.match(/`([a-z0-9_]+)`/)?.[1];
    const category = (field('Cat[ée]gorie') ?? text.match(/cat[ée]gorie\s*`?(\w+)/i)?.[1] ?? '').toLowerCase().match(/props|characters|vehicles|environment|ui3d/)?.[0];
    const dims = (field('Dimensions') ?? text).match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
    const pivot = (field('Pivot') ?? '').match(/bottom_center|center/)?.[0] ?? 'bottom_center';
    const collision = (field('Collision') ?? '').match(/box|cylinder|sphere|mesh|none/)?.[0] ?? 'box';
    const usage = field('Usage') ?? '';
    // Ordre de recherche : mots-cles anglais explicites (champ Recherche), puis le nom snake_case (anglais par
    // convention), puis les mots de l usage (francais : rarement utiles sur une API anglophone, en dernier).
    const explicit = (field('Recherche') ?? '').toLowerCase().split(/[,;]+/).map((word) => word.trim()).filter(Boolean);
    const nameParts = (name ?? '').split('_').filter((word) => word.length > 2 && !['small', 'large', 'deco', 'player', 'pickup'].includes(word));
    const usageWords = usage.toLowerCase().split(/[^a-z]+/).filter((word) => word.length > 3 && !['avec', 'pour', 'dans', 'plateforme', 'placeholder', 'small', 'large', 'deco'].includes(word));
    const keywords = [...new Set([...explicit, ...nameParts, ...usageWords])];
    return {
        name,
        category,
        size: dims ? [dims[1], dims[2], dims[3]].map((value) => Number(value.replace(',', '.'))) : null,
        pivot,
        collision,
        keywords,
    };
}

// --- source 1 : bibliotheque locale indexee (Kenney, Quaternius) ---
export function searchLocalIndex(query, index) {
    const wanted = query.keywords;
    return (index?.assets ?? [])
        .map((asset) => ({ asset, score: wanted.filter((word) => asset.tags.includes(word) || asset.name.includes(word)).length }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ asset }) => asset);
}

// --- source 2 : Poly Pizza ---
export async function searchPolyPizza(keyword, { limit = 10, fetchImpl = fetch } = {}) {
    const source = SOURCES.sources.find((item) => item.id === 'polypizza');
    const key = env(source.api.secret);
    if (!key) return { skipped: `secret ${source.api.secret} absent`, results: [] };
    const url = `${source.api.base}${source.api.search.replace('{keyword}', encodeURIComponent(keyword)).replace('{limit}', String(limit))}`;
    const response = await fetchImpl(url, { headers: { [source.api.auth_header]: key } });
    if (!response.ok) throw new Error(`Poly Pizza HTTP ${response.status}`);
    const data = await response.json();
    return { results: (data.results ?? []).map(normalizePolyPizzaModel) };
}

// Champs de l API v1.1 : ID, Title, Download, TriangleCount, Licence ("CC0" | "CC-BY 4.0"), Creator.Username.
// Les variantes en minuscules sont acceptees par prudence (docs en beta).
export function normalizePolyPizzaModel(model) {
    const pick = (...keys) => keys.map((key) => model[key]).find((value) => value !== undefined && value !== null);
    const creator = model.Creator ?? model.creator ?? {};
    const username = creator.Username ?? creator.username ?? creator.name ?? '';
    const title = pick('Title', 'title') ?? '';
    const license = pick('Licence', 'License', 'license');
    return {
        id: `polypizza:${pick('ID', 'id')}`,
        name: title,
        download: pick('Download', 'download'),
        triangles: pick('TriangleCount', 'triCount', 'triangles'),
        license,
        attribution: `"${title}" by ${username} (poly.pizza/u/${username}) ${license ?? ''}`.trim(),
        thumbnail: pick('Thumbnail', 'thumbnail'),
    };
}

export function licenseAllowed(license) {
    const normalized = String(license ?? '').toUpperCase().replace(/\s/g, '-');
    if (/-NC|-ND|SA\b.*NC/.test(normalized)) return false;
    return SOURCES.style.license_allow.some((tag) => normalized.includes(tag));
}

export function pickCandidate(candidates, { maxTriangles }) {
    return candidates.filter((item) => licenseAllowed(item.license) && (!item.triangles || item.triangles <= maxTriangles)).sort((a, b) => (a.triangles ?? 0) - (b.triangles ?? 0))[0] ?? null;
}

// Cascade complete : index local → Poly Pizza. Renvoie { candidate, buffer, stats, scale } ou null.
export async function findAsset(query, { maxTriangles = 2000, fetchImpl = fetch } = {}) {
    const indexFile = join(env('GF_ASSET_LIBRARY') ?? '', 'index.json');
    const index = env('GF_ASSET_LIBRARY') && existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : null;
    const attempts = [];
    const local = searchLocalIndex(query, index);
    for (const asset of local.slice(0, 5)) {
        const buffer = readFileSync(join(env('GF_ASSET_LIBRARY'), asset.file));
        const stats = glbStats(buffer);
        attempts.push({ source: asset.id, triangles: stats.triangles });
        if (stats.triangles <= maxTriangles) return { candidate: { ...asset, license: asset.license ?? 'CC0' }, buffer, stats, scale: query.size ? fitScale(stats.size, query.size) : 1, attempts };
    }
    // L API ne renvoie pas toujours le nombre de triangles : le seul chiffre sur lequel on peut
    // compter est celui du .glb telecharge. On essaie donc plusieurs candidats par mot-cle et on
    // garde le premier qui tient vraiment dans le budget, au lieu d abandonner sur le premier rate.
    const tried = new Set();
    for (const keyword of query.keywords.slice(0, 4)) {
        const { results, skipped } = await searchPolyPizza(keyword, { fetchImpl });
        if (skipped) {
            attempts.push({ source: 'polypizza', skipped });
            break;
        }
        const usable = results.filter((item) => licenseAllowed(item.license) && item.download && !tried.has(item.id))
            .sort((a, b) => (a.triangles ?? Number.MAX_SAFE_INTEGER) - (b.triangles ?? Number.MAX_SAFE_INTEGER));
        let chosen = null;
        for (const candidate of usable.slice(0, 5)) {
            tried.add(candidate.id);
            let buffer;
            let stats;
            try {
                const response = await fetchImpl(candidate.download);
                if (!response.ok) continue;
                buffer = Buffer.from(await response.arrayBuffer());
                stats = glbStats(buffer);
            } catch {
                continue;
            }
            if (stats.triangles > maxTriangles) {
                attempts.push({ source: 'polypizza', keyword, rejected: candidate.id, triangles: stats.triangles, budget: maxTriangles });
                continue;
            }
            chosen = { candidate, buffer, stats };
            break;
        }
        attempts.push({ source: 'polypizza', keyword, results: results.length, chosen: chosen?.candidate.id ?? null });
        if (!chosen) continue;
        return { ...chosen, scale: query.size ? fitScale(chosen.stats.size, query.size) : 1, attempts };
    }
    return { candidate: null, attempts };
}
