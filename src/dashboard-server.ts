import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DashboardMetricsStore } from './metrics';

const dashboardHtml = readFileSync(join(__dirname, '..', 'dashboard', 'index.html'), 'utf8');

function sendJson(response: ServerResponse, payload: unknown, statusCode = 200) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function sendHtml(response: ServerResponse, html: string) {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

export function startDashboardServer(metrics: DashboardMetricsStore, port: number, host = '127.0.0.1') {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = request.url || '/';

    if (url === '/' || url === '/dashboard') {
      sendHtml(response, dashboardHtml);
      return;
    }

    if (url === '/api/metrics') {
      sendJson(response, metrics.getSnapshot());
      return;
    }

    if (url === '/api/health') {
      sendJson(response, { ok: true, timestamp: Date.now() });
      return;
    }

    sendJson(response, { error: 'Not found' }, 404);
  });

  server.listen(port, host, () => {
    console.log(`📈 Dashboard ready at http://${host}:${port}`);
  });

  return server;
}
