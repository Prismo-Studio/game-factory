#!/usr/bin/env bash
# Runner GitHub persistant : s enregistre une fois sur l org avec le label `gf`, puis enchaine les jobs.
# L isolation entre deux runs vient du clone neuf de prepare.mjs, pas de la destruction du conteneur :
# les caches Godot/Gradle survivent, c est voulu.
set -euo pipefail

: "${GF_RUNNER_TOKEN:?GF_RUNNER_TOKEN requis (Settings > Actions > Runners > New self-hosted runner, ou un PAT admin:org pour generer un token de registration)}"
GF_RUNNER_URL="${GF_RUNNER_URL:-https://github.com/Prismo-Studio}"
GF_RUNNER_NAME="${GF_RUNNER_NAME:-gf-$(hostname)}"
GF_RUNNER_LABELS="${GF_RUNNER_LABELS:-gf}"

cd /home/runner/actions-runner

# Un PAT (ghp_/github_pat_) est echange contre un token de registration ; un token de registration (A…) est utilise tel quel.
if [[ "$GF_RUNNER_TOKEN" == ghp_* || "$GF_RUNNER_TOKEN" == github_pat_* ]]; then
    org="${GF_RUNNER_URL##*/}"
    REG_TOKEN=$(curl -sS -X POST -H "Authorization: Bearer ${GF_RUNNER_TOKEN}" -H "Accept: application/vnd.github+json" \
        "https://api.github.com/orgs/${org}/actions/runners/registration-token" | jq -r .token)
    [[ "$REG_TOKEN" != "null" && -n "$REG_TOKEN" ]] || { echo "Impossible d obtenir un token de registration (PAT sans admin:org ?)"; sleep 60; exit 1; }
else
    REG_TOKEN="$GF_RUNNER_TOKEN"
fi

cleanup() {
    echo "Desenregistrement de ${GF_RUNNER_NAME}…"
    ./config.sh remove --unattended --token "${REG_TOKEN}" || true
}
trap cleanup EXIT INT TERM

./config.sh --unattended --replace \
    --url "${GF_RUNNER_URL}" \
    --token "${REG_TOKEN}" \
    --name "${GF_RUNNER_NAME}" \
    --labels "${GF_RUNNER_LABELS}" \
    --work _work

echo "Runner pret : ${GF_RUNNER_NAME} (${GF_RUNNER_LABELS}) sur ${GF_RUNNER_URL}"
./run.sh
