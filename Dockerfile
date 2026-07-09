# MDA Калкулатор — контејнер за деплој (работи на Railway, Fly.io, Render, итн.)
FROM node:20-alpine

WORKDIR /app
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
# Базата се чува на монтиран диск за да преживее рестарт/редеплој
ENV MDA_DB_FILE=/data/db.json
VOLUME ["/data"]

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

CMD ["node", "server.js"]
