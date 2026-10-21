FROM node:22-alpine@sha256:ce8d97f7cfc7c5386421eb932df20a29df99b1a7f469f6157d5c9956702ffadc

WORKDIR /app
COPY --chown=node:node server/ /app/server/
COPY --chown=node:node web/ /app/web/
RUN mkdir -p /data && chown node:node /data

ENV PORT=8080 \
    LICENSE_DATA_DIR=/data \
    WEB_DIR=/app/web \
    LICENSE_OFFLINE_DAYS=30

USER node
EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server/license-server.js"]

