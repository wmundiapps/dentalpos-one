// Entrada da API na Vercel (função serverless). Migrações rodam no build (npm run vercel-build); rotina periódica pelo Vercel Cron.
import { createApp } from '../server/src/app.js';

export default createApp();
