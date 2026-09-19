// Les balises <!-- gf:kind k=v k=v --> sont la seule memoire de l usine (charte 01-board.md).
// Elles vivent dans les commentaires d issue, de PR et de release. Tout ce qui compte
// (tentatives, cout, SHA deja relu) se recalcule a partir d elles.

const TRACE_RE = /<!--\s*gf:([a-z-]+)((?:\s+[a-z_]+=[^\s>]+)*)\s*-->/g;

export function parseTraces(text) {
    const traces = [];
    for (const match of String(text ?? '').matchAll(TRACE_RE)) {
        const attrs = {};
        for (const pair of match[2].trim().split(/\s+/).filter(Boolean)) {
            const [key, ...rest] = pair.split('=');
            attrs[key] = decodeURIComponent(rest.join('=').replace(/\+/g, ' '));
        }
        traces.push({ kind: match[1], attrs });
    }
    return traces;
}

export function buildTrace(kind, attrs) {
    const parts = Object.entries(attrs)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}=${encodeURIComponent(String(value)).replace(/%20/g, '+')}`);
    return `<!-- gf:${kind}${parts.length ? ' ' + parts.join(' ') : ''} -->`;
}

// Un commentaire = une notification en trois lignes + la balise (charte 01-board.md).
export function buildRunComment({ pipeline, attempt, status, headline, detail, action, trace }) {
    const lines = [trace, headline];
    if (detail) lines.push(truncate(detail, 400));
    if (action) lines.push(`Action attendue : ${truncate(action, 200)}`);
    return lines.filter(Boolean).join('\n');
}

export function truncate(text, max) {
    const value = String(text ?? '').trim();
    return value.length > max ? value.slice(0, max - 1) + '…' : value;
}

// Commentaires = tableau { body, created_at, user }. Renvoie les traces avec leur date.
export function tracesIn(comments, kind, filter = () => true) {
    const found = [];
    for (const comment of comments) {
        for (const trace of parseTraces(comment.body)) {
            if (trace.kind === kind && filter(trace.attrs)) {
                found.push({ ...trace, createdAt: Date.parse(comment.created_at ?? 0), comment });
            }
        }
    }
    return found;
}

// Le label `reset` pose par un humain remet le compteur a zero : on ne compte que les
// runs posterieurs au dernier commentaire <!-- gf:reset --> (ecrit par le scan quand il
// retire le label).
export function resetBoundary(comments) {
    const resets = tracesIn(comments, 'reset');
    return resets.length ? Math.max(...resets.map((trace) => trace.createdAt)) : 0;
}

export function attempts(comments, pipeline) {
    const since = resetBoundary(comments);
    return tracesIn(comments, 'run', (attrs) => attrs.pipeline === pipeline).filter((trace) => trace.createdAt > since).length;
}

export function costSpent(comments, pipeline) {
    const since = resetBoundary(comments);
    return tracesIn(comments, 'run', (attrs) => !pipeline || attrs.pipeline === pipeline)
        .filter((trace) => trace.createdAt > since)
        .reduce((sum, trace) => sum + (Number(trace.attrs.cost_usd) || 0), 0);
}

export function reviewPasses(comments) {
    return tracesIn(comments, 'review').length;
}

export function alreadyReviewed(comments, sha) {
    return tracesIn(comments, 'review', (attrs) => attrs.sha === sha).length > 0;
}

// Revendications encore vivantes : dans la fenetre, et qu aucune trace gf:run n a cloturee.
// Sans ce second filtre, la revendication d un run deja termine (meme en echec) bloquait tous
// les suivants pendant 15 min ; avec un battement de coeur toutes les 10 min, le ticket ne
// repartait jamais — chaque tentative laissait une nouvelle revendication morte derriere elle.
export function claimsIn(comments, pipeline, windowMs, now = Date.now()) {
    const ended = tracesIn(comments, 'run').map((trace) => trace.createdAt);
    return tracesIn(comments, 'claim', (attrs) => attrs.pipeline === pipeline)
        .filter((trace) => now - trace.createdAt < windowMs)
        .filter((trace) => !ended.some((at) => at >= trace.createdAt))
        .sort((a, b) => a.createdAt - b.createdAt);
}

// "Depends on #12, #13" dans le corps d un ticket (charte 01-board.md).
export function dependencies(body) {
    const numbers = new Set();
    for (const match of String(body ?? '').matchAll(/depends?\s+on\s*:?\s*((?:#\d+[\s,]*)+)/gi)) {
        for (const number of match[1].matchAll(/#(\d+)/g)) numbers.add(Number(number[1]));
    }
    return [...numbers];
}

// Verrou orphelin : une revendication plus vieille que `staleMs` qu aucune trace gf:run n a suivie.
// Cas typique : le PC (ou Docker) s arrete au milieu d un run, le label in-progress reste pour toujours.
export function staleClaim(comments, { staleMs = 2 * 3_600_000, now = Date.now() } = {}) {
    const claim = tracesIn(comments, 'claim').at(-1);
    if (!claim || now - claim.createdAt < staleMs) return null;
    const ended = tracesIn(comments, 'run').some((trace) => trace.createdAt >= claim.createdAt);
    return ended ? null : { pipeline: claim.attrs.pipeline, run: claim.attrs.run, ageMin: Math.round((now - claim.createdAt) / 60_000) };
}
