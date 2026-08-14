# syntax=docker/dockerfile:1

# ---- Build stage: build all workspace packages and assemble the static site ----
FROM node:24-alpine AS build
WORKDIR /app

RUN npm install -g pnpm@10.33.4

ENV NX_DAEMON=false \
    CI=true

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm build
# API docs are optional — keep the image build going if typedoc fails
RUN pnpm docs:build || echo "typedoc failed, shipping without API docs"
# pre-serve copies cad-viewer-example/dist, cad-simple-viewer-example/dist and docs/
# into packages/examples/public; docs/ must exist even when typedoc was skipped
RUN mkdir -p docs && pnpm pre-serve

# ---- Runtime stage: plain nginx serving the assembled static site ----
FROM nginx:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/examples/public /usr/share/nginx/html

EXPOSE 80
