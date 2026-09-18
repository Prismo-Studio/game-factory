# Runner GitHub self-hosted de la factory : Node + Claude Code CLI + Godot headless + export
# templates + SDK Android en ligne de commande + adb. Aucun secret dans l image.
FROM ubuntu:24.04

ARG GODOT_VERSION=4.7.2
ARG RUNNER_VERSION=""
ARG NODE_MAJOR=22
ARG ANDROID_CMDLINE_TOOLS=11076708
ARG ANDROID_PLATFORM=34
ARG ANDROID_BUILD_TOOLS=34.0.0

ENV DEBIAN_FRONTEND=noninteractive \
    ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    GODOT_VERSION=${GODOT_VERSION} \
    PATH=/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:/opt/godot:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git jq unzip zip python3 python3-pip make gosu \
        openjdk-17-jdk-headless libfontconfig1 libgl1 libxcursor1 libxinerama1 libxrandr2 libxi6 \
        libasound2t64 libpulse0 xvfb \
    && curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code@latest && claude --version

# Godot headless + export templates, version lue depuis .godot-version des jeux (doit correspondre).
RUN set -eux; mkdir -p /opt/godot /root/.local/share/godot/export_templates; \
    base="https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}-stable"; \
    curl -fsSL -o /tmp/godot.zip "${base}/Godot_v${GODOT_VERSION}-stable_linux.x86_64.zip"; \
    unzip -q /tmp/godot.zip -d /opt/godot && mv /opt/godot/Godot_v${GODOT_VERSION}-stable_linux.x86_64 /opt/godot/godot; \
    curl -fsSL -o /tmp/templates.tpz "${base}/Godot_v${GODOT_VERSION}-stable_export_templates.tpz"; \
    unzip -q /tmp/templates.tpz -d /tmp/templates; \
    mv /tmp/templates/templates "/root/.local/share/godot/export_templates/${GODOT_VERSION}.stable"; \
    rm -rf /tmp/godot.zip /tmp/templates.tpz /tmp/templates; \
    godot --version

# SDK Android en ligne de commande (pas Android Studio).
RUN set -eux; mkdir -p ${ANDROID_HOME}/cmdline-tools; \
    curl -fsSL -o /tmp/cmdline.zip "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_CMDLINE_TOOLS}_latest.zip"; \
    unzip -q /tmp/cmdline.zip -d ${ANDROID_HOME}/cmdline-tools; \
    mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest; rm /tmp/cmdline.zip; \
    yes | sdkmanager --licenses >/dev/null; \
    sdkmanager "platform-tools" "platforms;android-${ANDROID_PLATFORM}" "build-tools;${ANDROID_BUILD_TOOLS}" "ndk;23.2.8568313"

# Maestro (tests de parcours sur appareil).
RUN curl -fsSL "https://get.maestro.mobile.dev" | bash || true
ENV PATH=/root/.maestro/bin:$PATH

# Runner GitHub Actions.
RUN set -eux; useradd --create-home --shell /bin/bash runner; mkdir -p /home/runner/actions-runner; cd /home/runner/actions-runner; \
    version="${RUNNER_VERSION}"; \
    if [ -z "$version" ]; then version="$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name | sed 's/^v//')"; fi; \
    curl -fsSL -o runner.tar.gz "https://github.com/actions/runner/releases/download/v${version}/actions-runner-linux-x64-${version}.tar.gz"; \
    tar xzf runner.tar.gz && rm runner.tar.gz; \
    ./bin/installdependencies.sh; \
    cp -r /root/.local /home/runner/.local; chown -R runner:runner /home/runner

COPY --chmod=0755 entrypoint.sh /usr/local/bin/entrypoint.sh
# Demarre root pour reprendre les droits sur les volumes, puis bascule sur `runner` (gosu) : voir entrypoint.sh.
WORKDIR /home/runner
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
