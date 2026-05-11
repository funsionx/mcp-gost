FROM oven/bun:1.2.11-debian

WORKDIR /app

ARG TARGETARCH

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates xz-utils \
  && case "${TARGETARCH:-amd64}" in \
    amd64) TYPST_ARCH="x86_64-unknown-linux-musl" ;; \
    arm64) TYPST_ARCH="aarch64-unknown-linux-musl" ;; \
    *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
  esac \
  && curl -L "https://github.com/typst/typst/releases/latest/download/typst-${TYPST_ARCH}.tar.xz" -o /tmp/typst.tar.xz \
  && mkdir -p /tmp/typst \
  && tar -xf /tmp/typst.tar.xz -C /tmp/typst --strip-components=1 \
  && mv /tmp/typst/typst /usr/local/bin/typst \
  && rm -rf /tmp/typst /tmp/typst.tar.xz /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
COPY templates ./templates

RUN bun run build

ENV PORT=3000

EXPOSE 3000

CMD ["bun", "src/server.ts"]
