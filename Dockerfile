ARG NODE_IMAGE=node:24-trixie-slim
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

RUN corepack pnpm install --prod --frozen-lockfile

FROM ${NODE_IMAGE} AS runner

LABEL org.opencontainers.image.title="Forman" \
    org.opencontainers.image.description="The Swiss Army knife for forms and surveys." \
    org.opencontainers.image.vendor="Telag" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.source="https://github.com/xtelag/forman"

ENV NODE_ENV=production \
    NODE_TLS_REJECT_UNAUTHORIZED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Apply available Debian fixes even when the upstream Node image has not been rebuilt.
RUN sed -i "s|http://deb.debian.org|https://deb.debian.org|g" /etc/apt/sources.list.d/debian.sources \
    && node -e 'require("node:fs").writeFileSync("/tmp/build-ca.pem", require("node:tls").rootCertificates.join("\n"))' \
    && apt-get update -o APT::Update::Error-Mode=any -o Acquire::https::CaInfo=/tmp/build-ca.pem \
    && apt-get upgrade -y --no-install-recommends -o Acquire::https::CaInfo=/tmp/build-ca.pem \
    && rm -rf /var/lib/apt/lists/* /tmp/build-ca.pem

# Package managers are needed only in build stages, never by the running server.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
        /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx

RUN groupadd --system --gid 1001 forman \
    && useradd --system --uid 1001 --gid forman --create-home forman \
    && install -d --owner=forman --group=forman /data

WORKDIR /app

COPY --from=build --chown=forman:forman /app/public ./public
COPY --from=build --chown=forman:forman /app/drizzle ./drizzle
COPY --from=build --chown=forman:forman /app/.next/standalone ./
COPY --from=production-dependencies --chown=forman:forman /app/node_modules ./node_modules
COPY --from=build --chown=forman:forman /app/.next/static ./.next/static

USER forman

EXPOSE 3000

CMD ["node", "server.js"]
