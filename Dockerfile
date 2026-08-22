FROM node:24-alpine
WORKDIR /app

# `prepare` runs `svelte-kit sync` before the sources exist; it already ends in
# `|| echo ''`, so installing ahead of the source copy is safe.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
