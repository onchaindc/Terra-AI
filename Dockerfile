FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git bash \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g \
    @okxweb3/a2a-node@0.1.9 \
    @openai/codex@latest

RUN curl -fsSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh \
    && install -m 0755 /root/.local/bin/onchainos /usr/local/bin/onchainos \
    && onchainos --version \
    && okx-a2a --version \
    && codex --version

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production \
    HOME=/data/home \
    CODEX_HOME=/data/home/.codex \
    OKX_AGENT_TASK_HOME=/data/okx-agent-task \
    OKX_A2A_AI_PROVIDER=codex \
    OKX_A2A_AI_CWD=/app/cloud-a2a \
    OKX_A2A_AI_PROVIDER_TIMEOUT_MS=300000

RUN mkdir -p /data/home /data/okx-agent-task \
    && ln -s /app/.agents /app/cloud-a2a/.agents \
    && chmod +x /app/scripts/start-combined-railway.sh

CMD ["bash", "/app/scripts/start-combined-railway.sh"]
