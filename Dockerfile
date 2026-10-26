FROM node:22-alpine AS base
RUN corepack enable
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./

# ---

# Chỉ phụ thuộc lockfile: layer node_modules giữ nguyên digest giữa các lần deploy,
# server chỉ kéo lại layer dist thay vì cả node_modules
FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod

# ---

FROM base AS builder
RUN pnpm install --frozen-lockfile

COPY . .
ARG APP=core
RUN node_modules/.bin/nest build ${APP}

# ---

FROM node:22-alpine AS runner
RUN apk add --no-cache tini tzdata
WORKDIR /app

ARG APP=core
ARG APP_PATH=apps/core
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown
ARG BUILD_TIME=unknown

ENV NODE_ENV=production \
    TZ=Asia/Ho_Chi_Minh \
    APP=${APP} \
    APP_PATH=${APP_PATH} \
    GIT_COMMIT=$GIT_COMMIT \
    GIT_BRANCH=$GIT_BRANCH \
    BUILD_TIME=$BUILD_TIME

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json .vault.json ./

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "node_modules/.bin/vault-start $VAULT_SECRET_PATH_MAPPED -- node dist/$APP_PATH/main.js"]
