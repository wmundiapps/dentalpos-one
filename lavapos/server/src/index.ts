import { createApp } from './app.js';
import { migrate } from './db.js';

const port = Number(process.env.PORT ?? 4100);
await migrate();
createApp().listen(port, () => console.log(`[lavapos] API em http://localhost:${port}`));
