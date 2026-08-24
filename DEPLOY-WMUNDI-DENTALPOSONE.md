# DentalPos One — publicação em /dentalposone/

Frontend Vite configurado com base `/dentalposone/` e BrowserRouter com basename `/dentalposone`.

URL desejada: `https://www.wmundi.com/dentalposone/`

## Reverse proxy esperado
- `/dentalposone/` -> arquivos estáticos do frontend
- `/dentalposone/api/` -> backend DentalPos One (ou ajustar VITE_API_URL para URL pública da API)
- Webhooks públicos: `/api/webhooks/asaas` e `/api/webhooks/stripe` no host da API.

A publicação real depende do acesso ao servidor/DNS/proxy do wmundi.com.
