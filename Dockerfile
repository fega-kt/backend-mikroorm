FROM node:22-alpine AS builder
RUN corepack enable
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build && pnpm prune --prod

# ---

FROM node:22-alpine AS runner
WORKDIR /app

ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown
ARG BUILD_TIME=unknown

ENV NODE_ENV=production \
    GIT_COMMIT=$GIT_COMMIT \
    GIT_BRANCH=$GIT_BRANCH \
    BUILD_TIME=$BUILD_TIME

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ecosystem.config.js .vault.json ./

EXPOSE 3000
CMD ["node_modules/.bin/vault-start", "--", "node_modules/.bin/pm2-runtime", "ecosystem.config.js"]
