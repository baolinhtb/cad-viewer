FROM node:24-alpine
WORKDIR /app
# The build context is the repository root, not this directory, because the
# service ships the TCVN corpus from `assets/` and a context cannot reach above
# itself. Paths below are therefore repo-relative.
#
# Named explicitly rather than `COPY *.mjs` so test files never ship, and so a
# new runtime module cannot be forgotten silently — a missing one crashes the
# service at startup.
COPY server/auth/server.mjs server/auth/schema.mjs server/auth/drawings.mjs \
     server/auth/standards.mjs server/auth/templates.mjs server/auth/ai.mjs \
     server/auth/tcvn.mjs ./
COPY server/auth/public ./public
# The standards the assistant cites. Copied into the image rather than mounted:
# which edition of a standard a drawing was checked against is part of what the
# deployed version *is*, and a mount would let it drift per host.
COPY assets/tcvn ./tcvn
# COPY keeps the host's permissions, and the service runs as `node`. A corpus
# checked out with a restrictive umask therefore builds into an image that
# starts fine and then answers every lookup with EACCES.
RUN chmod -R a+r ./tcvn && mkdir -p /data && chown node:node /data
ENV NODE_ENV=production \
    DB_PATH=/data/auth.db
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
