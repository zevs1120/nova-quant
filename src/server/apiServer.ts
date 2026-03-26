import { createApiApp } from './api/app.js';
import { attachStandaloneWebShell } from './standaloneWeb.js';
import { logInfo } from './utils/log.js';

const port = Number(process.env.PORT || 8787);
const host = String(process.env.HOST || process.env.BIND_HOST || '0.0.0.0').trim() || '0.0.0.0';
const app = attachStandaloneWebShell(createApiApp());

app.listen(port, host, () => {
  logInfo('OHLCV API server running', { host, port });
});
