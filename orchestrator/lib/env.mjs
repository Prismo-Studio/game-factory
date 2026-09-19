export function env(name) {
    const value = process.env[name];
    return value === undefined || value === '' ? undefined : value;
}

export function required(name) {
    const value = env(name);
    if (!value) throw new Error(`Variable d environnement manquante : ${name}`);
    return value;
}

export function isDryRun() {
    return String(env('GF_DRY_RUN') ?? 'false').toLowerCase() === 'true';
}

export function inActions() {
    return env('GITHUB_ACTIONS') === 'true';
}

export function warn(message) {
    if (inActions()) console.log(`::warning::${message}`);
    else console.log(`AVERTISSEMENT : ${message}`);
}

export function setOutput(name, value) {
    if (env('GITHUB_OUTPUT')) {
        import('node:fs').then(({ appendFileSync }) => appendFileSync(env('GITHUB_OUTPUT'), `${name}=${value}\n`));
    }
    console.log(`[output] ${name}=${value}`);
}

export function slugify(text, max = 40) {
    return String(text)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, max)
        .replace(/-+$/, '') || 'ticket';
}

export function sanitizeSecrets(text) {
    let out = String(text ?? '');
    for (const name of ['GF_GITHUB_TOKEN', 'ANTHROPIC_API_KEY']) {
        const value = env(name);
        if (value) out = out.split(value).join('***');
    }
    return out;
}
