# API do ambiente de teste (Railway). Contexto de build: raiz do repositório.
FROM node:22-bookworm-slim
# postgresql-client-18: pg_dump/pg_restore/psql do backup (repositório oficial PGDG, compatível com servidores 18 e anteriores).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl gnupg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update && apt-get install -y --no-install-recommends postgresql-client-18 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY revah/packages/dentalpos-one-adapter ./revah/packages/dentalpos-one-adapter
COPY backend ./backend
WORKDIR /app/backend
RUN npm install --no-audit --no-fund && npm run build
ENV NODE_ENV=production
CMD ["sh", "scripts/edu-railway-start.sh"]
