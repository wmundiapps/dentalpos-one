import { createApp } from './app.js';
import { assertProductionConfig, config } from './config.js';
import { migrate } from './db.js';

assertProductionConfig();
await migrate();
createApp().listen(config.port, () => console.log(`Vendeu API em http://localhost:${config.port}`));
