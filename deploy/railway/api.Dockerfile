# API do ambiente de teste (Railway). Contexto de build: raiz do repositório.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY revah/packages/dentalpos-one-adapter ./revah/packages/dentalpos-one-adapter
COPY backend ./backend
WORKDIR /app/backend
RUN npm install --no-audit --no-fund && npm run build
ENV NODE_ENV=production
CMD ["sh", "scripts/edu-railway-start.sh"]
