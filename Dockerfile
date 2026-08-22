# ── build ────────────────────────────────────────────────────────────────────
# Debian rather than Alpine on purpose: better-sqlite3 is a native module, and
# its prebuilt binaries are linked against glibc. On musl every image build would
# compile SQLite from source.
FROM node:24-slim AS build
WORKDIR /app

# node-gyp's fallback, for the case where no prebuilt binary matches this Node.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# `prepare` runs `svelte-kit sync` before the sources exist; it already ends in
# `|| echo ''`, so installing ahead of the source copy is safe.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .
RUN npm run build

# The runtime needs three packages (better-sqlite3, drizzle-orm, ws). Everything
# else was only ever needed to produce ./build.
RUN npm prune --omit=dev

# ── run ──────────────────────────────────────────────────────────────────────
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production

# SQLite lives on a Fly volume mounted here; see fly.toml. The default in
# db.ts is a relative path, which would put the database inside the container
# and lose it on every deploy.
ENV DATABASE_PATH=/data/homeward.db

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
# `npm start` runs server.ts directly under Node's type stripping, so the
# TypeScript sources it imports have to be in the image — as do the migrations,
# which are applied on boot.
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/src ./src
COPY --from=build /app/drizzle ./drizzle

EXPOSE 3000
CMD ["npm", "start"]
