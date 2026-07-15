FROM oven/bun:1.3.14-debian AS dependencies

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM dependencies AS build

ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_PINCHANA_WEB_COMMIT=development
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY} \
    NEXT_PUBLIC_PINCHANA_WEB_COMMIT=${NEXT_PUBLIC_PINCHANA_WEB_COMMIT}

COPY . .
RUN bun run build

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
COPY --from=build --chown=bun:bun /app/package.json /app/bun.lock /app/next.config.ts ./

USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]
