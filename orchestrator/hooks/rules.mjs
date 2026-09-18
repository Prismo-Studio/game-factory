// Regles partagees par les hooks (charte 07-garde-fous.md). Testees dans hooks.test.mjs.

export const FORBIDDEN_COMMANDS = [
    { pattern: /\bgit\s+push\b/i, reason: 'le push est fait par le script, pas par toi' },
    { pattern: /--no-verify\b/i, reason: 'contourner les hooks git est interdit' },
    { pattern: /\bgit\s+config\s+--global\b/i, reason: 'configuration git globale interdite' },
    { pattern: /\bgit\s+remote\b/i, reason: 'modification des remotes interdite' },
    { pattern: /\bgit\s+(checkout|switch)\s+(-{1,2}\S+\s+)*(main|master|develop)\b/i, reason: 'tu dois rester sur ta branche' },
    { pattern: /\bgit\s+(reset|clean)\s+.*(--hard|-fdx?)\b/i, reason: 'reset/clean destructif interdit' },
    { pattern: /\bgit\s+cat-file\b|\.git[\/\\]config/i, reason: 'lecture de la configuration git interdite' },
    { pattern: /\b(curl|wget|nc|ncat|ssh|scp|Invoke-WebRequest)\b/i, reason: 'aucun appel reseau sortant autorise' },
    { pattern: /\b(apt|apt-get|pip|pip3|npm\s+(i|install|add)|yarn\s+add|pnpm\s+add|brew)\b/i, reason: 'aucune installation : declare-toi BLOCKED' },
    { pattern: /\brm\s+-rf?\s+[\/~]/i, reason: 'suppression recursive hors du repo interdite' },
    { pattern: /--export-release\b/i, reason: 'l export release est un geste humain (keystore de prod)' },
];

export const FORBIDDEN_PATHS = [
    { pattern: /(^|[\/\\\s"'])\.github[\/\\]/i, reason: 'workflows CI' },
    { pattern: /(^|[\/\\\s"'])addons[\/\\]/i, reason: 'addons geres par le template' },
    { pattern: /\bexport_presets\.cfg\b/i, reason: 'presets d export' },
    { pattern: /\.godot-version\b/i, reason: 'version Godot pinnee' },
    { pattern: /(^|[\/\\\s"'])Makefile\b/i, reason: 'commandes de verification' },
    { pattern: /(^|[\/\\\s"'])CLAUDE\.md\b/i, reason: 'instructions du jeu' },
    { pattern: /(^|[\/\\\s"'])game[\/\\]core[\/\\]/i, reason: 'services du template : un jeu les utilise, ne les modifie pas' },
    { pattern: /\.(keystore|jks|pfx|pem|key)\b/i, reason: 'keystore ou cle' },
    { pattern: /(^|[\/\\\s"'])\.env(\.|\b)/i, reason: 'secret' },
    { pattern: /secrets?[^\/\\]*\.(json|ya?ml|txt|cfg)\b/i, reason: 'secret' },
];

// Bash reserve a QA (charte 07).
export const QA_ONLY_COMMANDS = [{ pattern: /\badb\b/i, reason: 'adb est reserve a la pipeline QA' }];

export const WRITE_MARKERS = /(^|[^<])>{1,2}(?!&)|\btee\b|\bsed\s+-i\b|\bmv\b|\bcp\b|\brm\b|\btruncate\b|\bdd\b/;

export const READONLY_GIT_ALLOWED = /^git\s+(log|show|diff|blame|ls-files|rev-parse|status|branch\s+--list|tag\s+--list|describe)\b/;
export const READONLY_GIT_FORBIDDEN_CHARS = /[;&|`$<>]/;

export const QA_ALLOWED = [
    /^adb\s+(devices|logcat|shell\s+(screencap|dumpsys|getprop|am\s+start|am\s+force-stop|input|monkey|pm\s+list)|pull|install(\s+-r)?\s+\S*build-\S*\.apk|uninstall)\b/,
    /^godot\s+.*--headless\b/,
    /^make\s+(playthrough|screenshot|test|import)\b/,
    /^maestro\s+(test|record)\b/,
    /^(ls|cat|head|tail|wc|find|grep|sleep|mkdir|python3?\s+tools\/)\b/,
];

export function commandDenial(command, { profile }) {
    for (const rule of FORBIDDEN_COMMANDS) if (rule.pattern.test(command)) return rule.reason;
    if (profile !== 'qa') for (const rule of QA_ONLY_COMMANDS) if (rule.pattern.test(command)) return rule.reason;
    if (WRITE_MARKERS.test(command)) {
        for (const rule of FORBIDDEN_PATHS) if (rule.pattern.test(command)) return `ecriture sur un fichier protege (${rule.reason})`;
    }
    return null;
}

export function pathDenial(absolutePath, workspace) {
    const normalized = absolutePath.replace(/\\/g, '/');
    const root = workspace.replace(/\\/g, '/').replace(/\/$/, '');
    if (!normalized.startsWith(root + '/')) return `ecriture hors du repo (${absolutePath})`;
    const relative = normalized.slice(root.length + 1);
    // project.godot : autorise, verifie ensuite par finalize (diff limite aux autoloads/inputs).
    for (const rule of FORBIDDEN_PATHS) if (rule.pattern.test('/' + relative)) return `fichier protege (${rule.reason})`;
    return null;
}

export function readonlyBashDenial(command) {
    const trimmed = command.trim();
    if (READONLY_GIT_FORBIDDEN_CHARS.test(trimmed)) return 'une seule commande git simple par appel, sans chainage ni redirection';
    if (!READONLY_GIT_ALLOWED.test(trimmed)) return 'seules les commandes git de lecture sont autorisees ; lire un fichier passe par Read';
    return null;
}

export function qaBashDenial(command) {
    const trimmed = command.trim();
    for (const rule of FORBIDDEN_COMMANDS) if (rule.pattern.test(trimmed)) return rule.reason;
    if (/[;&|`$]|(^|[^<])>{1,2}(?!&)/.test(trimmed) && !/^adb\s+logcat.*>\s*\S*build\//.test(trimmed)) {
        return 'une seule commande simple par appel (sortie de logcat autorisee vers build/ uniquement)';
    }
    if (!QA_ALLOWED.some((pattern) => pattern.test(trimmed))) return 'commande hors de la liste blanche QA';
    return null;
}
