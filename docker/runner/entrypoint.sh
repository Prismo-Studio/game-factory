#!/usr/bin/env bash
# Runner GitHub persistant : s enregistre une fois sur l org avec le label `gf`, puis enchaine les jobs.
# L isolation entre deux runs vient du clone neuf de prepare.mjs, pas de la destruction du conteneur :
# les caches Godot/Gradle survivent, c est voulu.
set -euo pipefail

# Les volumes Docker (_work, caches Godot/Gradle) sont crees par root : on les rend a `runner`
# puis on se re-execute sous cet utilisateur. Le runner lui-meme ne tourne jamais en root.
if [[ "$(id -u)" == "0" ]]; then
    mkdir -p /home/runner/actions-runner/_work /home/runner/.local/share/godot/export_templates /home/runner/.gradle
    # Le volume godot-cache masque les templates d export de l image : on y copie ceux de la version courante.
    for templates in /root/.local/share/godot/export_templates/*; do
        [[ -d "$templates" ]] || continue
        target="/home/runner/.local/share/godot/export_templates/$(basename "$templates")"
        [[ -f "$target/android_debug.apk" ]] || { rm -rf "$target"; cp -r "$templates" "$target"; echo "Templates d export installes : $(basename "$templates")"; }
    done
    mkdir -p /home/runner/runner-config /home/runner/.claude
    chown -R runner:runner /home/runner/actions-runner/_work /home/runner/.local /home/runner/.gradle /home/runner/runner-config /home/runner/.claude
    exec gosu runner "$0" "$@"
fi

: "${GF_RUNNER_TOKEN:?GF_RUNNER_TOKEN requis (Settings > Actions > Runners > New self-hosted runner, ou un PAT admin:org pour generer un token de registration)}"
GF_RUNNER_URL="${GF_RUNNER_URL:-https://github.com/Prismo-Studio}"
GF_RUNNER_NAME="${GF_RUNNER_NAME:-gf-local}"   # nom stable : --replace reprend l identite a chaque redemarrage, pas de runner fantome
GF_RUNNER_LABELS="${GF_RUNNER_LABELS:-gf}"

cd /home/runner/actions-runner

# Identite persistante : les fichiers d enregistrement vivent dans le volume runner-config, un
# rebuild du conteneur reprend le meme runner sans nouveau token.
CONFIG_DIR=/home/runner/runner-config
if [[ -f "$CONFIG_DIR/.runner" && -f "$CONFIG_DIR/.credentials" ]]; then
    cp "$CONFIG_DIR"/.runner "$CONFIG_DIR"/.credentials* . 2>/dev/null || true
    echo "Runner deja enregistre (${GF_RUNNER_NAME}) : reprise sans nouveau token."
    exec ./run.sh
fi

# Un PAT (ghp_/github_pat_) est echange contre un token de registration ; un token de registration (A…) est utilise tel quel.
if [[ "$GF_RUNNER_TOKEN" == ghp_* || "$GF_RUNNER_TOKEN" == github_pat_* ]]; then
    org="${GF_RUNNER_URL##*/}"
    REG_TOKEN=$(curl -sS -X POST -H "Authorization: Bearer ${GF_RUNNER_TOKEN}" -H "Accept: application/vnd.github+json" \
        "https://api.github.com/orgs/${org}/actions/runners/registration-token" | jq -r .token)
    [[ "$REG_TOKEN" != "null" && -n "$REG_TOKEN" ]] || { echo "Impossible d obtenir un token de registration (PAT sans admin:org ?)"; sleep 60; exit 1; }
else
    REG_TOKEN="$GF_RUNNER_TOKEN"
fi

# Pas de desenregistrement a l arret : l identite est conservee dans le volume (supprimer le runner
# depuis GitHub > Runners si on veut vraiment le retirer).

./config.sh --unattended --replace \
    --url "${GF_RUNNER_URL}" \
    --token "${REG_TOKEN}" \
    --name "${GF_RUNNER_NAME}" \
    --labels "${GF_RUNNER_LABELS}" \
    --work _work

cp .runner .credentials* "$CONFIG_DIR"/ 2>/dev/null || true
echo "Runner pret : ${GF_RUNNER_NAME} (${GF_RUNNER_LABELS}) sur ${GF_RUNNER_URL}"
exec ./run.sh
