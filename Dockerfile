# All-in-one deployment: static site + /api/feed + 24/7 race loop in one service.
# Used by Railway when deploying the repo root.
FROM node:22-alpine
WORKDIR /app
COPY worker/package.json worker/package-lock.json worker/
RUN cd worker && npm ci --omit=dev
COPY . .
ENV DATA_DIR=/data
CMD ["node", "worker/server.mjs"]
