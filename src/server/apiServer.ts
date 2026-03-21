import { createApiApp } from './api/app.js';
import { attachStandaloneWebShell } from './standaloneWeb.js';
import { logInfo } from './utils/log.js';

const port = Number(process.env.PORT || 8787);
const app = attachStandaloneWebShell(createApiApp());

app.listen(port, () => {
  logInfo('OHLCV API server running', { port });
});
