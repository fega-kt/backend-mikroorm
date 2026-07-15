FROM node:22-alpine AS builder
RUN corepack enable
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
ARG APP=core
RUN node_modules/.bin/nest build ${APP} && pnpm prune --prod

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

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json .vault.json ./

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "node_modules/.bin/vault-start $VAULT_SECRET_PATH_MAPPED -- node dist/$APP_PATH/main.js"]
