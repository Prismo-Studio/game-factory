import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env, inActions, isDryRun, sanitizeSecrets, warn } from '../lib/env.mjs';
import { FACTORY_EMAIL, forcePushArgs, git, isAllowedBranch } from '../lib/git.mjs';
import { buildTrace, truncate } from '../lib/traces.mjs';
import { FORBIDDEN_PATHS } from '../hooks/rules.mjs';
import { LOCK_LABEL } from '../pipelines.mjs';

const SECRET_PATTERNS = [/sk-ant-[A-Za-z0-9_-]{20,}/, /AIza[0-9A-Za-z_-]{30,}/, /ghp_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{40,}/, /ca-app-pub-(?!3940256099942544)\d{16}~\d{10}/];

export function readReport(reportFile) {
    if (!existsSync(reportFile)) return { status: 'BLOCKED', kind: 'needs-human', reason: 'Rapport introuvable.', actionRequired: 'Consulter les logs du run.' };
    try {
        const report = JSON.parse(readFileSync(reportFile, 'utf8'));
        if (!['SUCCESS', 'BLOCKED'].includes(report.status)) throw new Error(`status invalide : ${report.status}`);
        return report;
    } catch (error) {
        return { status: 'BLOCKED', kind: 'needs-human', reason: `Rapport illisible : ${error.message}`, actionRequired: 'Consulter les logs du run.' };
    }
}

// Pure : verifie un diff avant push (teste dans finalize.test.mjs).
export function diffViolations(files, { diffText = '', sizes = {} } = {}) {
    const violations = [];
    for (const file of files) {
        for (const rule of FORBIDDEN_PATHS) if (rule.pattern.test('/' + file)) violations.push(`${file} : ${rule.reason}`);
        if ((sizes[file] ?? 0) > 2 * 1024 * 1024) violations.push(`${file} : plus de 2 Mo`);
    }
    for (const pattern of SECRET_PATTERNS) if (pattern.test(diffText)) violations.push(`le diff contient une chaine ressemblant a un secret (${pattern.source.slice(0, 12)}…)`);
    if (files.includes('project.godot')) {
        const added = diffText.split('\n').filter((line) => /^[+-](?![+-])/.test(line) && !/^[+-]\s*$/.test(line));
        const allowed = added.every((line) => /^[+-]\s*(\[autoload\]|\[input\]|[A-Za-z_]+="\*res:\/\/|[a-z_]+=\{|"[a-z_]+":|\]|\}|\{|Object\(InputEvent)/.test(line) || /^[+-]\s*config\/version=/.test(line));
        if (!allowed) violations.push('project.godot : seuls les autoloads, actions d input et la version sont modifiables');
    }
    return violations;
}

function ownerComment({ pipeline, ticket, stats, status, headline, detail, action, extra = {} }) {
    const trace = buildTrace('run', {
        pipeline: pipeline.name,
        attempt: ticket.attempt,
        status,
        cost_usd: (stats?.cost ?? 0).toFixed(2),
        turns: stats?.turns ?? 0,
        duration_s: stats?.durationS ?? 0,
        model: stats?.model ?? '',
        ...extra,
    });
    return [trace, headline, detail ? truncate(detail, 400) : '', action ? `Action attendue : ${truncate(action, 200)}` : ''].filter(Boolean).join('\n');
}

async function unlock(gh, ticket) {
    if (isDryRun() || ticket.number === null) return;
    await gh.removeLabel(ticket.repo, ticket.number, LOCK_LABEL);
}

async function chain(gh, org, pipeline) {
    if (isDryRun() || !inActions() || String(env('GF_CHAIN') ?? 'true') !== 'true') return;
    try {
        await gh.dispatchWorkflow(`${org}/game-factory`, `${pipeline.name}.yml`, { ref: 'main' });
        console.log('Run suivant mis en file (chainage).');
    } catch (error) {
        warn(`Chainage impossible : ${sanitizeSecrets(error.message)}`);
    }
}

async function blocked({ gh, pipeline, ticket, report, stats, targetDir }) {
    const kind = report.kind === 'blocked' ? 'blocked' : 'needs-human';
    console.log(`${kind.toUpperCase()} : ${report.reason}`);
    if (targetDir && existsSync(targetDir)) {
        try {
            const dirty = git(['status', '--porcelain'], targetDir);
            if (dirty) {
                warn('L agent a laisse des modifications malgre BLOCKED : elles sont jetees.');
                git(['checkout', '--', '.'], targetDir);
                git(['clean', '-fd'], targetDir);
            }
        } catch {
            // pas un depot git (pipeline llm) : rien a nettoyer
        }
    }
    if (ticket.number === null) return;
    const body = ownerComment({ pipeline, ticket, stats, status: 'BLOCKED', headline: `${pipeline.name} · tentative ${ticket.attempt} · ${kind}`, detail: report.reason, action: report.actionRequired });
    if (isDryRun()) return console.log(`DRY RUN, commentaire non poste :\n${body}`);
    await gh.comment(ticket.repo, ticket.number, body);
    await gh.updateLabels(ticket.repo, ticket.number, { add: [kind], remove: [LOCK_LABEL] });
}

// --- pipelines qui livrent une PR (dev, assets) ---

async function finalizePullRequest({ gh, pipeline, ticket, prepared, report, stats, targetDir }) {
    const branch = prepared.branch;
    if (!isAllowedBranch(branch)) throw new Error(`Branche refusee : ${branch}`);
    if (git(['rev-parse', '--abbrev-ref', 'HEAD'], targetDir) !== branch) {
        return blocked({ gh, pipeline, ticket, report: { kind: 'needs-human', reason: `L agent a quitte la branche ${branch}.`, actionRequired: 'Reprise manuelle.' }, stats, targetDir });
    }
    const range = `origin/${prepared.base}..HEAD`;
    let commits = git(['log', '--oneline', range], targetDir).split('\n').filter(Boolean);
    if (!commits.length) {
        return blocked({ gh, pipeline, ticket, report: { kind: 'needs-human', reason: 'Aucun commit produit.', actionRequired: 'Relire le ticket : l agent a annonce un succes sans rien livrer.' }, stats, targetDir });
    }
    if (commits.length > 1) {
        git(['reset', '--soft', `origin/${prepared.base}`], targetDir);
        git(['commit', '-m', report.commitTitle ?? `${pipeline.branchPrefix.replace('/', '')}(#${ticket.number}): ${ticket.title}`, '-m', report.commitBody ?? '', '-m', `Closes #${ticket.number}`], targetDir);
        commits = git(['log', '--oneline', range], targetDir).split('\n').filter(Boolean);
        console.log('Commits squashes en un seul.');
    }
    const files = git(['diff', '--name-only', `origin/${prepared.base}`, 'HEAD'], targetDir).split('\n').filter(Boolean);
    const diffText = git(['diff', `origin/${prepared.base}`, 'HEAD', '--', 'project.godot', '*.gd', '*.tscn', '*.tres', '*.cfg', '*.json', '*.md'], targetDir);
    const sizes = Object.fromEntries(files.filter((file) => existsSync(`${targetDir}/${file}`)).map((file) => [file, readFileSync(`${targetDir}/${file}`).length]));
    const violations = diffViolations(files, { diffText, sizes });
    if (violations.length) {
        return blocked({ gh, pipeline, ticket, report: { kind: 'needs-human', reason: `Diff refuse : ${violations.join(' ; ')}`, actionRequired: 'Corriger le ticket ou le template : la pipeline ne peut pas livrer ce changement.' }, stats, targetDir });
    }
    const diffStat = git(['diff', '--shortstat', `origin/${prepared.base}`, 'HEAD'], targetDir);
    console.log(`Commit : ${commits[0]}\nDiff : ${diffStat}\nFichiers :\n${files.map((file) => `  - ${file}`).join('\n')}`);
    if (isDryRun()) return console.log('DRY RUN : ni push, ni PR, ni ecriture GitHub.');

    let pushArgs = ['push', gh.cloneUrl(ticket.repo), `HEAD:refs/heads/${branch}`];
    if (git(['ls-remote', gh.cloneUrl(ticket.repo), `refs/heads/${branch}`], targetDir)) {
        git(['fetch', '--depth', '1', gh.cloneUrl(ticket.repo), `refs/heads/${branch}`], targetDir);
        const author = git(['log', '-1', '--pretty=%ae', 'FETCH_HEAD'], targetDir);
        if (author !== FACTORY_EMAIL) {
            return blocked({ gh, pipeline, ticket, report: { kind: 'blocked', reason: `La branche ${branch} existe et son dernier commit est de ${author}.`, actionRequired: 'Un humain a repris cette branche : finir le ticket a la main.' }, stats, targetDir });
        }
        pushArgs = ['push', '--force', gh.cloneUrl(ticket.repo), `HEAD:refs/heads/${branch}`];
    }
    git(pushArgs, targetDir);
    console.log(`Branche poussee : ${branch}`);

    const existing = (await gh.listPulls(ticket.repo, { head: `${ticket.repo.split('/')[0]}:${branch}` }))[0];
    const body = [
        `Closes #${ticket.number}`,
        '',
        report.summary ?? '',
        '',
        '## Changements',
        report.changes ?? '',
        '',
        '## Verifications',
        report.checks ?? '',
        report.notes ? `\n## Notes hors perimetre\n${report.notes}` : '',
        '',
        'PR generee par la factory. Revue humaine requise avant merge.',
        buildTrace('pr', { ticket: ticket.number, pipeline: pipeline.name }),
    ].join('\n').slice(0, 60_000);
    const title = truncate(report.prTitle ?? `#${ticket.number} — ${ticket.title}`, 200);
    const pull = existing ? await gh.request('PATCH', `/repos/${ticket.repo}/pulls/${existing.number}`, { title, body }) : await gh.createPull(ticket.repo, { head: branch, base: prepared.base, title, body });
    console.log(`PR : ${gh.pullUrl(ticket.repo, pull.number)}`);
    // Un humain a pose auto-merge sur le ticket : la PR merge seule quand ci + merge-gate + review passent.
    if (ticket.labels.includes('auto-merge')) await gh.addLabels(ticket.repo, pull.number, ['auto-merge']);

    const extra = { pr: pull.number, sha: git(['rev-parse', '--short', 'HEAD'], targetDir) };
    await gh.comment(ticket.repo, ticket.number, [ownerComment({ pipeline, ticket, stats, status: 'SUCCESS', headline: `${pipeline.name} · tentative ${ticket.attempt} · PR #${pull.number} ${existing ? 'mise a jour' : 'ouverte'} · ${files.length} fichier(s)`, detail: report.summary, extra }), buildTrace('pr', { number: pull.number })].join('\n'));
    const add = ['review', ...(report.placeholder ? ['needs-human:art'] : [])];
    await gh.updateLabels(ticket.repo, ticket.number, { add, remove: [ticket.inputLabel, LOCK_LABEL] });
}

// --- review + autofix ---

async function finalizeReview({ gh, pipeline, ticket, prepared, report, stats, targetDir }) {
    const pull = prepared.pull;
    const reviewedSha = pull.head;
    const findings = (report.findings ?? []).filter((finding) => ['bloquant', 'a_corriger', 'note'].includes(finding.severity));
    const verdictOk = report.verdict === 'ok' && !findings.some((finding) => finding.severity !== 'note');
    if (isDryRun()) return console.log(`DRY RUN : verdict ${report.verdict}, ${findings.length} remarque(s), ${(report.threads ?? []).length} reponse(s).`);

    // 1. La review elle-meme, sur le SHA relu (trace anti-rejeu).
    const reviewBody = [buildTrace('review', { sha: reviewedSha, verdict: verdictOk ? 'ok' : 'changes', pass: ticket.attempt }), `[gf] Review · passe ${ticket.attempt} · ${verdictOk ? 'OK' : `${findings.length} remarque(s)`}`, '', report.summary ?? ''].join('\n');
    const inlineComments = findings.filter((finding) => finding.path && finding.line).map((finding) => ({ path: finding.path, line: finding.line, body: `[gf] **${finding.severity}** — ${finding.body}` }));
    const orphan = findings.filter((finding) => !finding.path || !finding.line).map((finding) => `- **${finding.severity}** ${finding.path ?? ''} : ${finding.body}`);
    try {
        await gh.createReview(ticket.repo, pull.number, { event: 'COMMENT', body: orphan.length ? `${reviewBody}\n\n${orphan.join('\n')}` : reviewBody, comments: inlineComments, commitId: reviewedSha });
    } catch (error) {
        warn(`Review inline refusee (${sanitizeSecrets(error.message)}), publiee sans positions.`);
        await gh.createReview(ticket.repo, pull.number, { event: 'COMMENT', body: `${reviewBody}\n\n${findings.map((finding) => `- **${finding.severity}** ${finding.path ?? ''}${finding.line ? `:${finding.line}` : ''} : ${finding.body}`).join('\n')}` });
    }

    // 2. Reponses aux fils humains, toujours prefixees [gf].
    for (const thread of report.threads ?? []) {
        try {
            await gh.replyToReviewComment(ticket.repo, pull.number, thread.id, `[gf] ${thread.reply ?? (thread.addressed ? 'Traite.' : 'Non traite.')}`);
        } catch (error) {
            warn(`Reponse au fil ${thread.id} impossible : ${sanitizeSecrets(error.message)}`);
        }
    }

    // 3. Rebase en cours (conflits avec la base laisses a l agent) : ses resolutions terminent le rebase.
    const rebasing = existsSync(join(targetDir, '.git', 'rebase-merge')) || existsSync(join(targetDir, '.git', 'rebase-apply'));
    if (rebasing) {
        const unresolved = (prepared.conflicts ?? []).filter((file) => existsSync(join(targetDir, file)) && /^(<{7}|={7}|>{7})/m.test(readFileSync(join(targetDir, file), 'utf8')));
        if (unresolved.length) {
            git(['rebase', '--abort'], targetDir);
            return blocked({ gh, pipeline, ticket, report: { kind: 'needs-human', reason: `Conflits avec ${prepared.base} non resolus : ${unresolved.join(', ')}`, actionRequired: `Rebaser la branche sur ${prepared.base} a la main.` }, stats, targetDir });
        }
        git(['add', '-A'], targetDir);
        git(['-c', 'core.editor=true', 'rebase', '--continue'], targetDir);
    }

    // 4. Autofix : modifications laissees dans le clone → amend ; puis push si HEAD a change (autofix ou rebase).
    const dirty = git(['status', '--porcelain'], targetDir);
    let newSha = null;
    const changedFiles = () => git(['diff', '--name-only', `origin/${prepared.base}...HEAD`], targetDir).split('\n').filter(Boolean);
    if (dirty) {
        const files = git(['status', '--porcelain'], targetDir).split('\n').map((line) => line.slice(3)).filter(Boolean);
        const violations = diffViolations(files, { diffText: git(['diff'], targetDir) });
        if (violations.length) {
            git(['checkout', '--', '.'], targetDir);
            git(['clean', '-fd'], targetDir);
            return blocked({ gh, pipeline, ticket, report: { kind: 'needs-human', reason: `Autofix refuse : ${violations.join(' ; ')}`, actionRequired: 'Corriger a la main.' }, stats, targetDir });
        }
        const previousBody = git(['log', '-1', '--pretty=%B'], targetDir);
        git(['add', '-A'], targetDir);
        git(['commit', '--amend', '-m', report.commitBody ? `${previousBody.trim()}\n\n${report.commitBody.trim()}` : previousBody], targetDir);
    }
    const headNow = git(['rev-parse', 'HEAD'], targetDir);
    if (headNow !== reviewedSha) {
        const violations = diffViolations(changedFiles(), { diffText: git(['diff', `origin/${prepared.base}...HEAD`], targetDir) });
        if (violations.length) {
            return blocked({ gh, pipeline, ticket, report: { kind: 'needs-human', reason: `Diff refuse apres rebase/autofix : ${violations.join(' ; ')}`, actionRequired: 'Corriger a la main.' }, stats, targetDir });
        }
        try {
            git(forcePushArgs(gh.cloneUrl(ticket.repo), prepared.branch, reviewedSha), targetDir);
        } catch (error) {
            return blocked({ gh, pipeline, ticket, report: { kind: 'needs-human', reason: `Push refuse : ${sanitizeSecrets(error.message).slice(-300)}`, actionRequired: 'La branche a bouge pendant la reprise : verifier a la main.' }, stats, targetDir });
        }
        newSha = headNow;
        const what = [rebasing || (prepared.conflicts ?? []).length ? `rebase sur ${prepared.base}` : null, dirty ? 'autofix' : null].filter(Boolean).join(' + ') || `rebase sur ${prepared.base}`;
        await gh.comment(ticket.repo, ticket.number, `${buildTrace('autofix', { from: reviewedSha.slice(0, 7), to: newSha.slice(0, 7) })}\n${what} · ${changedFiles().length} fichier(s) dans la PR apres la passe ${ticket.attempt}.`);
    }

    const headline = `review · passe ${ticket.attempt} · ${verdictOk ? 'verdict OK, au tour de l humain' : newSha ? 'corrections poussees, nouvelle passe a venir' : 'remarques sans correction possible'}`;
    await gh.comment(ticket.repo, ticket.number, ownerComment({ pipeline, ticket, stats, status: 'SUCCESS', headline, detail: report.summary, extra: { sha: (newSha ?? reviewedSha).slice(0, 7) } }));
    if (verdictOk && !newSha) await gh.updateLabels(ticket.repo, ticket.number, { add: ['review:handled'], remove: ['review', LOCK_LABEL] });
    else if (!newSha && !verdictOk) await gh.updateLabels(ticket.repo, ticket.number, { add: ['needs-human'], remove: ['review', LOCK_LABEL] });
    else await gh.removeLabel(ticket.repo, ticket.number, LOCK_LABEL);
}

// --- spec : creer les enfants ---

async function finalizeSpec({ gh, pipeline, ticket, report, stats }) {
    const children = report.children ?? [];
    if (children.length < 2) return blocked({ gh, pipeline, ticket, report: { kind: 'needs-human', reason: `Spec a propose ${children.length} ticket(s) : un GDD se decoupe en au moins deux.`, actionRequired: 'Relire le GDD.' }, stats });
    if (isDryRun()) return console.log(`DRY RUN : ${children.length} tickets seraient crees :\n${children.map((child) => `  - ${child.title}`).join('\n')}`);
    const created = [];
    for (const child of children) {
        const depends = (child.dependsOn ?? []).map((index) => created[index]?.number).filter(Boolean);
        const body = [child.body, '', `Parent : #${ticket.number}`, depends.length ? `Depends on ${depends.map((number) => `#${number}`).join(', ')}` : '', buildTrace('child', { parent: ticket.number, domain_hint: child.domainHint ?? '' })].filter((line) => line !== '').join('\n');
        const issue = await gh.createIssue(ticket.repo, { title: truncate(child.title, 120), body, labels: ['triage'] });
        created.push(issue);
        console.log(`  #${issue.number} ${issue.title}`);
    }
    await gh.comment(ticket.repo, ticket.number, ownerComment({ pipeline, ticket, stats, status: 'SUCCESS', headline: `spec · ${created.length} tickets crees : ${created.map((issue) => `#${issue.number}`).join(' ')}`, detail: report.summary, extra: { children: created.length } }));
    await gh.updateLabels(ticket.repo, ticket.number, { add: ['spec:done'], remove: ['spec', LOCK_LABEL] });
}

// --- triage : un label ---

async function finalizeTriage({ gh, pipeline, ticket, report, stats }) {
    if (!pipeline.outputs.includes(report.label)) return blocked({ gh, pipeline, ticket, report: { kind: 'needs-human', reason: `Label propose invalide : ${report.label}`, actionRequired: 'Router a la main.' }, stats });
    if (report.label === 'todo:art' && !/\d+(\.\d+)?\s*(m|cm)\b|dimension|bounds/i.test(ticket.body)) {
        return blocked({ gh, pipeline, ticket, report: { kind: 'needs-human', reason: 'Ticket art sans dimensions (charte 05).', actionRequired: 'Ajouter dimensions, pivot et points d attache au ticket.' }, stats });
    }
    if (isDryRun()) return console.log(`DRY RUN : ${report.label} (${report.justification})`);
    await gh.comment(ticket.repo, ticket.number, ownerComment({ pipeline, ticket, stats, status: 'SUCCESS', headline: `triage · ${report.label}`, detail: report.justification }));
    await gh.updateLabels(ticket.repo, ticket.number, { add: [report.label], remove: ['triage'] });
}

// --- concept : une issue dans game-factory ---

async function finalizeConcept({ gh, pipeline, ticket, report, stats }) {
    const body = [report.pitch, '', '## Boucle de jeu', ...(report.loop ?? []).map((step, index) => `${index + 1}. ${step}`), '', '## Ce que le joueur voit', `- 0 s : ${report.seconds?.['0'] ?? ''}`, `- 10 s : ${report.seconds?.['10'] ?? ''}`, `- 60 s : ${report.seconds?.['60'] ?? ''}`, '', '## Hook fake ad', report.fakeAdHook ?? '', '', '## Assets', ...(report.assets ?? []).map((asset) => `- ${asset}`), '', '## Monetisation', ...(report.placements ?? []).map((placement) => `- ${placement}`), '', '## Risque principal', report.risk ?? '', '', buildTrace('concept', { run: ticket.runId })].join('\n');
    if (isDryRun()) return console.log(`DRY RUN : concept "${report.title}"\n${body}`);
    const issue = await gh.createIssue(ticket.repo, { title: truncate(report.title, 100), body, labels: ['concept'] });
    console.log(`Concept cree : ${gh.issueUrl(ticket.repo, issue.number)}`);
}

// --- qa : issues + trace sur la release ---

async function finalizeQa({ gh, pipeline, ticket, report, stats }) {
    const findings = report.findings ?? [];
    if (isDryRun()) return console.log(`DRY RUN : ${findings.length} ecart(s), verdict ${report.verdict}`);
    const created = [];
    for (const finding of findings.slice(0, 15)) {
        const labels = ['triage', 'origin:qa', ...(finding.severity === 'crash' ? ['priority:high'] : [])];
        const body = [finding.body, '', '## Reproduction', finding.reproduction ?? '', '', `Build : ${ticket.release.tag}`, finding.screenshot ? `Capture : ${finding.screenshot}` : '', buildTrace('qa-finding', { build: ticket.release.tag })].join('\n');
        created.push(await gh.createIssue(ticket.repo, { title: truncate(`[QA] ${finding.title}`, 120), body, labels }));
    }
    const summary = [buildTrace('qa', { build: ticket.release.tag, verdict: report.verdict ?? 'unknown', findings: created.length, cost_usd: (stats?.cost ?? 0).toFixed(2) }), `QA · ${report.verdict} · ${created.length} ticket(s) : ${created.map((issue) => `#${issue.number}`).join(' ') || 'aucun'}`, report.summary ?? ''].join('\n');
    await gh.updateRelease(ticket.repo, ticket.release.id, { body: `${ticket.release.body ?? ''}\n\n${summary}` });
}

export async function finalize(context) {
    const { gh, pipeline, ticket, org } = context;
    const report = context.report ?? readReport(context.reportFile);
    context.report = report;
    if (report.status !== 'SUCCESS') {
        await blocked(context);
    } else {
        const handlers = { dev: finalizePullRequest, assets: finalizePullRequest, review: finalizeReview, spec: finalizeSpec, triage: finalizeTriage, concept: finalizeConcept, qa: finalizeQa };
        const handler = handlers[pipeline.name];
        if (!handler) throw new Error(`Pas de finalizer pour ${pipeline.name}`);
        try {
            await handler(context);
        } catch (error) {
            warn(`finalize a echoue : ${sanitizeSecrets(error.message)}`);
            await blocked({ ...context, report: { kind: 'needs-human', reason: `Finalisation en erreur : ${sanitizeSecrets(error.message).slice(0, 300)}`, actionRequired: 'Consulter les logs du run.' } });
        }
    }
    await unlock(gh, ticket);
    await chain(gh, org, pipeline);
}
