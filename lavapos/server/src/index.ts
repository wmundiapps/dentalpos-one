import { createApp } from './app.js';
import { migrate } from './db.js';

const port = Number(process.env.PORT ?? 4100);
if (process.env.NODE_ENV === 'production' && !process.env.ASAAS_WEBHOOK_TOKEN) console.error('[segurança] ASAAS_WEBHOOK_TOKEN ausente: o webhook do Asaas recusará todas as mensagens');
await migrate();
createApp().listen(port, () => console.log(`[lavapos] API em http://localhost:${port}`));
