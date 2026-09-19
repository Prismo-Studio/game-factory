import { env, required } from './env.mjs';

// Remplace les classes Jira + AzureDevOps du kit d origine : une seule API, GitHub.
// Tout ce qui ecrit sur GitHub passe par ici, jamais par le modele.
export class GitHub {
    constructor({ token = required('GF_GITHUB_TOKEN'), apiUrl = env('GITHUB_API_URL') ?? 'https://api.github.com' } = {}) {
        this.token = token;
        this.apiUrl = apiUrl.replace(/\/$/, '');
    }

    async request(method, path, body, { raw = false, headers = {} } = {}) {
        const url = path.startsWith('http') ? path : `${this.apiUrl}${path}`;
        const response = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                ...(body && !raw ? { 'Content-Type': 'application/json' } : {}),
                ...headers,
            },
            body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
        });
        if (response.status === 204) return null;
        const text = await response.text();
        let data = text;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            // reponse non JSON (rare) : on garde le texte
        }
        if (!response.ok) {
            const message = typeof data === 'object' && data?.message ? data.message : String(text).slice(0, 300);
            const error = new Error(`GitHub ${method} ${path} → HTTP ${response.status} : ${message}`);
            error.status = response.status;
            throw error;
        }
        return data;
    }

    async paginate(path, { perPage = 100, max = 1000 } = {}) {
        const results = [];
        const separator = path.includes('?') ? '&' : '?';
        for (let page = 1; results.length < max; page += 1) {
            const batch = await this.request('GET', `${path}${separator}per_page=${perPage}&page=${page}`);
            if (!Array.isArray(batch) || !batch.length) break;
            results.push(...batch);
            if (batch.length < perPage) break;
        }
        return results;
    }

    // --- org / repos ---

    listOrgRepos(org, { topic } = {}) {
        return this.paginate(`/orgs/${org}/repos?type=all&sort=created`).then((repos) =>
            topic ? repos.filter((repo) => (repo.topics ?? []).includes(topic)) : repos,
        );
    }

    getRepo(repo) {
        return this.request('GET', `/repos/${repo}`);
    }

    createRepoFromTemplate({ template, owner, name, description, isPrivate = true }) {
        return this.request('POST', `/repos/${template}/generate`, {
            owner,
            name,
            description,
            private: isPrivate,
            include_all_branches: false,
        });
    }

    setTopics(repo, names) {
        return this.request('PUT', `/repos/${repo}/topics`, { names });
    }

    getVariable(repo, name) {
        return this.request('GET', `/repos/${repo}/actions/variables/${name}`).then((v) => v?.value).catch(() => undefined);
    }

    // --- issues ---

    listIssues(repo, { labels = [], state = 'open', since } = {}) {
        const query = new URLSearchParams({ state, sort: 'created', direction: 'asc' });
        if (labels.length) query.set('labels', labels.join(','));
        if (since) query.set('since', since);
        return this.paginate(`/repos/${repo}/issues?${query}`).then((items) => items.filter((item) => !item.pull_request));
    }

    getIssue(repo, number) {
        return this.request('GET', `/repos/${repo}/issues/${number}`);
    }

    createIssue(repo, { title, body, labels = [] }) {
        return this.request('POST', `/repos/${repo}/issues`, { title, body, labels });
    }

    updateIssue(repo, number, patch) {
        return this.request('PATCH', `/repos/${repo}/issues/${number}`, patch);
    }

    listComments(repo, number) {
        return this.paginate(`/repos/${repo}/issues/${number}/comments`);
    }

    comment(repo, number, body) {
        return this.request('POST', `/repos/${repo}/issues/${number}/comments`, { body });
    }

    labels(repo, number) {
        return this.getIssue(repo, number).then((issue) => (issue.labels ?? []).map((label) => label.name));
    }

    addLabels(repo, number, labels) {
        if (!labels.length) return Promise.resolve();
        return this.request('POST', `/repos/${repo}/issues/${number}/labels`, { labels });
    }

    async removeLabel(repo, number, label) {
        try {
            await this.request('DELETE', `/repos/${repo}/issues/${number}/labels/${encodeURIComponent(label)}`);
        } catch (error) {
            if (error.status !== 404) throw error;
        }
    }

    async updateLabels(repo, number, { add = [], remove = [] }) {
        for (const label of remove) await this.removeLabel(repo, number, label);
        await this.addLabels(repo, number, add);
    }

    listLabels(repo) {
        return this.paginate(`/repos/${repo}/labels`);
    }

    createLabel(repo, label) {
        return this.request('POST', `/repos/${repo}/labels`, label);
    }

    updateLabel(repo, name, label) {
        return this.request('PATCH', `/repos/${repo}/labels/${encodeURIComponent(name)}`, { new_name: label.name, ...label });
    }

    // --- pull requests ---

    listPulls(repo, { state = 'open', head, base } = {}) {
        const query = new URLSearchParams({ state });
        if (head) query.set('head', head);
        if (base) query.set('base', base);
        return this.paginate(`/repos/${repo}/pulls?${query}`);
    }

    getPull(repo, number) {
        return this.request('GET', `/repos/${repo}/pulls/${number}`);
    }

    createPull(repo, { head, base = 'main', title, body, draft = false }) {
        return this.request('POST', `/repos/${repo}/pulls`, { head, base, title, body, draft });
    }

    listReviews(repo, number) {
        return this.paginate(`/repos/${repo}/pulls/${number}/reviews`);
    }

    listReviewComments(repo, number) {
        return this.paginate(`/repos/${repo}/pulls/${number}/comments`);
    }

    createReview(repo, number, { event, body, comments = [], commitId }) {
        return this.request('POST', `/repos/${repo}/pulls/${number}/reviews`, {
            event,
            body,
            comments,
            ...(commitId ? { commit_id: commitId } : {}),
        });
    }

    replyToReviewComment(repo, number, commentId, body) {
        return this.request('POST', `/repos/${repo}/pulls/${number}/comments/${commentId}/replies`, { body });
    }

    pullFiles(repo, number) {
        return this.paginate(`/repos/${repo}/pulls/${number}/files`);
    }

    // --- releases ---

    listReleases(repo) {
        return this.paginate(`/repos/${repo}/releases`);
    }

    getReleaseByTag(repo, tag) {
        return this.request('GET', `/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`);
    }

    createRelease(repo, { tag, name, body, prerelease = true, targetCommitish }) {
        return this.request('POST', `/repos/${repo}/releases`, {
            tag_name: tag,
            name,
            body,
            prerelease,
            target_commitish: targetCommitish,
        });
    }

    updateRelease(repo, id, patch) {
        return this.request('PATCH', `/repos/${repo}/releases/${id}`, patch);
    }

    async uploadReleaseAsset(repo, release, { name, data, contentType = 'application/octet-stream' }) {
        const url = release.upload_url.replace(/\{.*\}$/, '') + `?name=${encodeURIComponent(name)}`;
        return this.request('POST', url, data, { raw: true, headers: { 'Content-Type': contentType } });
    }

    // --- workflows ---

    dispatchWorkflow(repo, workflowFile, { ref = 'main', inputs = {} } = {}) {
        return this.request('POST', `/repos/${repo}/actions/workflows/${workflowFile}/dispatches`, { ref, inputs });
    }

    // --- git ---

    cloneUrl(repo) {
        return `https://x-access-token:${this.token}@github.com/${repo}.git`;
    }

    publicUrl(repo) {
        return `https://github.com/${repo}.git`;
    }

    issueUrl(repo, number) {
        return `https://github.com/${repo}/issues/${number}`;
    }

    pullUrl(repo, number) {
        return `https://github.com/${repo}/pull/${number}`;
    }
}
