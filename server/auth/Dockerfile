FROM node:24-alpine
WORKDIR /app
# Named explicitly rather than `COPY *.mjs` so test files never ship, and so a
# new runtime module cannot be forgotten silently — a missing one crashes the
# service at startup.
COPY server.mjs schema.mjs drawings.mjs standards.mjs templates.mjs ai.mjs ./
COPY public ./public
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production \
    DB_PATH=/data/auth.db
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
