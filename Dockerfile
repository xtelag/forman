ARG NODE_IMAGE=node:24-trixie-slim
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs24-debian13:nonroot
ARG BUILDPLATFORM

# Compile Next.js on the builder architecture, without cross-platform emulation.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS base

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1

RUN corepack enable

WORKDIR /app

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN corepack pnpm install --frozen-lockfile

FROM base AS build

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN corepack pnpm build \
    && rm -rf .next/standalone/node_modules

# Native modules must be installed for the runtime architecture, not the builder.
FROM ${NODE_IMAGE} AS production-dependencies

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN corepack pnpm install --prod --frozen-lockfile \
    && install -d -m 0700 /runtime-data /runtime-home

FROM ${RUNTIME_IMAGE} AS runner

LABEL org.opencontainers.image.title="Forman" \
    org.opencontainers.image.description="The Swiss Army knife for forms and surveys." \
    org.opencontainers.image.vendor="Telag" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.source="https://github.com/xtelag/forman"

ENV NODE_ENV=production \
    NODE_TLS_REJECT_UNAUTHORIZED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HOME=/home/forman \
    PATH=/nodejs/bin:${PATH}

WORKDIR /app

COPY --from=production-dependencies --chown=1001:1001 /runtime-data /data
COPY --from=production-dependencies --chown=1001:1001 /runtime-home /home/forman
COPY --from=build --chown=1001:1001 /app/public ./public
COPY --from=build --chown=1001:1001 /app/drizzle ./drizzle
COPY --from=build --chown=1001:1001 /app/.next/standalone ./
COPY --from=production-dependencies --chown=1001:1001 /app/node_modules ./node_modules
COPY --from=build --chown=1001:1001 /app/.next/static ./.next/static

USER 1001:1001

EXPOSE 3000

CMD ["server.js"]
