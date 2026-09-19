import { env } from './lib/env.mjs';

// Table des pipelines : ce que la charte (02-pipelines.md, 06-budgets.md) dit, en donnees.
// Un PROMPT.md ne peut pas relever un plafond ; une variable GF_<PIPELINE>_* peut le
// modifier sans toucher au code (ex. GF_DEV_MAX_COST_USD=4 en rodage).

const GAME_TOPIC = 'gf-game';

export const PIPELINES = {
    concept: {
        runner: 'llm',
        scope: 'factory',
        trigger: 'dispatch',
        outputs: ['concept'],
        budget: { maxCostUsd: 0.5, timeoutMin: 5, maxAttempts: 1, maxCostPerTicketUsd: 0.5 },
        schema: 'pipelines/concept/schema.json',
    },
    bootstrap: {
        runner: 'script',
        scope: 'factory',
        inputLabel: 'concept:approved',
        lock: true,
        outputs: ['concept:bootstrapped'],
        budget: { maxCostUsd: 0.1, timeoutMin: 10, maxAttempts: 2, maxCostPerTicketUsd: 0.2 },
    },
    spec: {
        runner: 'claude-code',
        profile: 'read-only',
        scope: 'game',
        inputLabel: 'spec',
        lock: true,
        outputs: ['spec:done'],
        budget: { maxCostUsd: 5, timeoutMin: 30, maxAttempts: 2, maxCostPerTicketUsd: 10 },
    },
    triage: {
        runner: 'llm',
        scope: 'game',
        inputLabel: 'triage',
        lock: false,
        ignoreDependencies: true, // router n attend pas que les dependances soient livrees
        outputs: ['todo:gameplay', 'todo:ui', 'todo:meta', 'todo:monetisation', 'todo:art'],
        budget: { maxCostUsd: 0.05, timeoutMin: 2, maxAttempts: 2, maxCostPerTicketUsd: 0.1 },
        schema: 'pipelines/triage/schema.json',
    },
    dev: {
        runner: 'claude-code',
        profile: 'write',
        scope: 'game',
        inputLabels: ['todo:gameplay', 'todo:ui', 'todo:meta', 'todo:monetisation'],
        lock: true,
        outputs: ['review'],
        branchPrefix: 'feat/',
        budget: { maxCostUsd: 10, timeoutMin: 45, maxAttempts: 3, maxCostPerTicketUsd: 30 },
        contextFor: (labels) => labels.find((label) => label.startsWith('todo:'))?.split(':')[1],
    },
    review: {
        runner: 'claude-code',
        profile: 'write',
        scope: 'game',
        inputLabel: 'review',
        lock: true,
        outputs: ['review:handled', 'review'],
        budget: { maxCostUsd: 6, timeoutMin: 30, maxAttempts: 3, maxCostPerTicketUsd: 18, maxReviewPasses: 3 },
    },
    build: {
        runner: 'script',
        scope: 'game',
        trigger: 'push-main',
        budget: { maxCostUsd: 0, timeoutMin: 30, maxAttempts: 2, maxCostPerTicketUsd: 0 },
    },
    qa: {
        runner: 'claude-code',
        profile: 'qa',
        scope: 'game',
        trigger: 'release',
        budget: { maxCostUsd: 8, timeoutMin: 45, maxAttempts: 1, maxCostPerTicketUsd: 8 },
    },
    assets: {
        runner: 'script',      // cascade CC0 → placeholder ; Blender (claude-code) plus tard sous label art:hero
        profile: 'write',
        scope: 'game',
        inputLabel: 'todo:art',
        lock: true,
        outputs: ['review', 'needs-human:art'],
        branchPrefix: 'art/',
        budget: { maxCostUsd: 6, timeoutMin: 30, maxAttempts: 3, maxCostPerTicketUsd: 18 },
    },
};

export const BASE_BRANCH = env('GF_BASE_BRANCH') ?? 'develop';
export const RELEASE_BRANCH = 'main';
export const LOCK_LABEL = 'in-progress';
export const EXCLUDED_LABELS = ['in-progress', 'approved', 'done', 'blocked', 'needs-human'];
export const PAUSE_LABEL = 'factory:paused';
export const RESET_LABEL = 'reset';
export const PRIORITY_LABEL = 'priority:high';
export const AUTO_MERGE_LABEL = 'auto-merge';
// Chaine complete sans geste humain (charte 01). GF_AUTO_MERGE=false rend le merge manuel.
export const autoMergeByDefault = () => String(env('GF_AUTO_MERGE') ?? 'true').toLowerCase() === 'true';
export const CLAIM_WINDOW_MS = 15 * 60_000;
export { GAME_TOPIC };

export function pipelineConfig(name) {
    const base = PIPELINES[name];
    if (!base) throw new Error(`Pipeline inconnue : ${name} (attendu : ${Object.keys(PIPELINES).join(', ')})`);
    const key = name.toUpperCase();
    const override = (suffix, fallback) => {
        const value = env(`GF_${key}_${suffix}`);
        return value === undefined ? fallback : Number(value);
    };
    return {
        name,
        ...base,
        inputLabels: base.inputLabels ?? (base.inputLabel ? [base.inputLabel] : []),
        model: env(`GF_MODEL_${key}`) ?? env('GF_MODEL') ?? undefined,
        budget: {
            maxCostUsd: override('MAX_COST_USD', base.budget.maxCostUsd),
            timeoutMin: override('TIMEOUT_MIN', base.budget.timeoutMin),
            maxAttempts: override('MAX_ATTEMPTS', base.budget.maxAttempts),
            maxCostPerTicketUsd: override('MAX_COST_PER_TICKET_USD', base.budget.maxCostPerTicketUsd),
            maxReviewPasses: override('MAX_REVIEW_PASSES', base.budget.maxReviewPasses ?? 3),
        },
    };
}
