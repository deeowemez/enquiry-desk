# Staff console: builds the React app and the API, then runs one small Node process that serves both.
# Build context is the REPO ROOT (see docker-compose.yml): the image also carries the 24-case scorer and gate (test/score.py,
# compare.py, baseline.json, enquiries.jsonl) so the console runs the same test the command line does, plus python3 and psql for them.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY console/package.json console/package-lock.json ./
RUN npm ci
COPY console/tsconfig.server.json ./
COPY console/shared shared
COPY console/server server
COPY console/web web
RUN npm run build:web && npm run build:server

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 postgresql-client && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production CONSOLE_REPO_ROOT=/app
COPY console/package.json console/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist dist
COPY --from=build /app/web/dist web/dist
COPY test/score.py test/compare.py test/baseline.json test/enquiries.jsonl test/
# Past scoring runs: compare.py --check reads the BASELINE run's file from the results folder. The folder is a volume (runs started
# from the console are kept), so the history is kept aside and copied in on start (never overwriting).
COPY test/results test/results-seed
COPY kb/facts.json kb/
RUN mkdir -p test/results && chown -R node:node test
USER node
EXPOSE 3100
CMD ["sh", "-c", "cp -n test/results-seed/*.jsonl test/results/ 2>/dev/null; exec node dist/server/server/index.js"]
