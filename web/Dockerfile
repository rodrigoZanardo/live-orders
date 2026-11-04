# Build context: the repository root (npm workspaces share one lockfile).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci
COPY web web
RUN npm run build --workspace @live/web

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
# standalone output keeps the monorepo layout: the server lives in web/server.js
COPY --from=build /app/web/.next/standalone ./
COPY --from=build /app/web/.next/static web/.next/static
ENV PORT=3000
# listen on every interface; hosts like Render set HOSTNAME to the container name (docs/HANDOFF.md)
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["node", "/app/web/server.js"]
