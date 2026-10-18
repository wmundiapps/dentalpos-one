# Notas para o Claude neste repositório
- Node 22 ESM, zero dependências; SQL portátil (`?`, ids TEXT, datas ISO TEXT, dinheiro em centavos).
- Todo acesso a dados filtra por `salon_id` vindo da sessão, nunca do cliente.
- Segredos de integração por salão ficam criptografados (`integrations/store.js`); a plataforma nunca envia mensagens de salão com credenciais próprias.
- Front-end sem innerHTML com dados; usar `h()` de `web/lib.js`. CSP é estrita (sem scripts inline).
- Antes de concluir: `npm test`.
