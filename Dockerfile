FROM node:24-slim
# Claude Code CLI powers the Watcher's chat with Claude (your Claude subscription).
# `script` (bsdutils, already in the base image) gives the login a pseudo-terminal.
RUN npm install -g @anthropic-ai/claude-code@2.1.303 && npm cache clean --force
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    CLAUDE_CONFIG_DIR=/app/data/claude
COPY package.json ./
COPY src ./src
COPY web ./web
COPY tools ./tools
COPY CHANGELOG.md ./
RUN mkdir -p /app/data
EXPOSE 3000
# The supervisor restarts the engine on new code after the current turn ends.
CMD ["node", "--disable-warning=ExperimentalWarning", "src/supervisor.ts"]
