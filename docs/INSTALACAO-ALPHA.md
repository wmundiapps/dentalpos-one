# Instalação Alpha — núcleo

1. Backend: copiar `.env.example` para `.env` e trocar segredos/senha bootstrap.
2. Subir PostgreSQL (`docker compose up -d postgres`) ou usar PostgreSQL externo.
3. `cd backend && npm install && npx prisma db push && npm run bootstrap:admin && npm run dev`.
4. `cd frontend && npm install && npm run dev`.

Nenhuma credencial real de Asaas, Stripe, banco, Z-API, Resend ou Comtele deve ser colocada no frontend.
