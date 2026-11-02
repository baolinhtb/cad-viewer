# syntax=docker/dockerfile:1

# ---- Build stage: build all workspace packages and assemble the static site ----
FROM node:24-alpine AS build
WORKDIR /app

RUN npm install -g pnpm@10.33.4

ENV NX_DAEMON=false \
    CI=true

# docker/ and server/ are runtime-only — excluding them keeps this layer's
# cache valid when only nginx config or the auth service changes
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm -r --workspace-concurrency=2 run build
# API docs are optional — keep the image build going if typedoc fails
RUN pnpm docs:build || echo "docs build failed, shipping without docs"
# pre-serve assembles demo builds and optional VitePress docs under public/.
RUN pnpm pre-serve

# ---- Runtime stage: plain nginx serving the assembled static site ----
FROM nginx:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/cad-demo-gallery/public /usr/share/nginx/html

EXPOSE 80
