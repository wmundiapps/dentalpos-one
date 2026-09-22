# EduMaster Pro — Frontend

Aplicação própria do EduMaster Pro, separada do DentalPos One. Produto e
marca independentes (comercializado como plataforma educacional exclusiva),
mas reaproveita o mesmo backend e a mesma infraestrutura do DentalPos One
(`wmundiapps/dentalpos-one/backend`): autenticação/JWT, multi-tenant,
RBAC, motor financeiro, REVAH (marketing/captação) e serviço de IA. Só a
apresentação (marca, login, menu) é exclusiva do EduMaster.

## Rodando localmente

```bash
npm install
npm run dev
```

Por padrão aponta para `http://localhost:3000/api` (o mesmo backend do
DentalPos One). Ajuste `VITE_API_URL` num `.env` local se necessário.

## Build

```bash
npm run build
```

## Deploy

Pensado para deploy independente (domínio/projeto Vercel próprios,
separado do DentalPos One). Em produção, o backend precisa incluir o
domínio deste app em `CORS_ORIGIN`.
