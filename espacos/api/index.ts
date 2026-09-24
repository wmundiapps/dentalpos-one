// Entrada da API na Vercel (função serverless). As migrações rodam no build
// (npm run vercel-build) e a rotina periódica pelo Vercel Cron (/api/cron/tick).
import { createApp } from '../server/src/app';

export default createApp();
