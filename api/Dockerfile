# Build context: the repository root (npm workspaces share one lockfile).
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci
COPY api api
RUN npm run build --workspace @live/api

FROM node:22-alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
# shortcut: copies dev dependencies too (prisma CLI is needed for migrate deploy); prune if the image size matters
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/api/package.json api/package.json
COPY --from=build /app/api/dist api/dist
COPY --from=build /app/api/prisma api/prisma
WORKDIR /app/api
ENV PORT=3001
EXPOSE 3001
# absolute paths: hosts like Render run the command from the image's WORKDIR (docs/HANDOFF.md)
CMD ["sh", "-c", "node /app/node_modules/prisma/build/index.js migrate deploy --schema /app/api/prisma/schema.prisma && node /app/api/dist/main.js"]
