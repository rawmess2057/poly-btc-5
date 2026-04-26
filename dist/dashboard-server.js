"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDashboardServer = startDashboardServer;
const http_1 = require("http");
const fs_1 = require("fs");
const path_1 = require("path");
const dashboardHtml = (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '..', 'dashboard', 'index.html'), 'utf8');
function sendJson(response, payload, statusCode = 200) {
    response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(payload));
}
function sendHtml(response, html) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
}
function startDashboardServer(metrics, port, host = '127.0.0.1') {
    const server = (0, http_1.createServer)((request, response) => {
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
//# sourceMappingURL=dashboard-server.js.map