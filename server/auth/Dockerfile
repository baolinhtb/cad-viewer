FROM node:24-alpine
WORKDIR /app
COPY server.mjs ./
COPY public ./public
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production \
    DB_PATH=/data/auth.db
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
