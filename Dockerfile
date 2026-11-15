# Felt runs as one long-lived Node process (Next.js + Socket.IO on the same
# port, tables held in memory), so it needs a host that runs a container
# continuously — this image is what such a host builds and runs.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
# One process, started directly (no npm wrapper), so the host's stop signal
# reaches the server itself. GET /healthz answers "ok" for health checks.
CMD ["node", "--import", "tsx", "server.ts"]
