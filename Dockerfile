# syntax=docker/dockerfile:1

FROM oven/bun:1.3.14-debian AS dependencies

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM dependencies AS build

ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_PINCHANA_WEB_COMMIT=development
ARG NEXT_PUBLIC_PINCHANA_V2_MAX_ARCHIVE_ITEMS=32
ARG SENTRY_MONITORING_ENABLED=false
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY} \
    NEXT_PUBLIC_PINCHANA_WEB_COMMIT=${NEXT_PUBLIC_PINCHANA_WEB_COMMIT} \
    NEXT_PUBLIC_PINCHANA_V2_MAX_ARCHIVE_ITEMS=${NEXT_PUBLIC_PINCHANA_V2_MAX_ARCHIVE_ITEMS} \
    SENTRY_MONITORING_ENABLED=${SENTRY_MONITORING_ENABLED} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=${NEXT_PUBLIC_SENTRY_ENVIRONMENT} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT=${SENTRY_PROJECT}

COPY . .
RUN --mount=type=secret,id=sentry_auth_token \
    if [ -s /run/secrets/sentry_auth_token ]; then \
      export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token)"; \
    fi; \
    rm -rf next-env.d.ts; \
    bun run build

FROM oven/bun:1.3.14-debian AS production-dependencies

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM oven/bun:1.3.14-debian AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=production-dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/.next-build ./.next-build
COPY --from=build --chown=bun:bun /app/public ./public
COPY --from=build --chown=bun:bun \
    /app/package.json \
    /app/bun.lock \
    /app/next.config.ts \
    /app/sentry-build-config.ts \
    ./

USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]
