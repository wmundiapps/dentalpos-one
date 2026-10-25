// Entrada da API na Vercel (função serverless). As migrações rodam no build (npm run vercel-build)
// e a rotina diária pelo Vercel Cron (/api/cron/daily, protegida por CRON_SECRET).
import { assertProductionConfig } from '../server/src/config.js';
import { createApp } from '../server/src/app.js';

assertProductionConfig();
export default createApp();
