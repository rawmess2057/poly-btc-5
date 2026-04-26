"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const demo_simulator_1 = require("./demo-simulator");
const dashboard_server_1 = require("./dashboard-server");
const metrics_1 = require("./metrics");
dotenv_1.default.config();
async function main() {
    process.env.DEMO_MODE = 'true';
    const metrics = new metrics_1.DashboardMetricsStore();
    const bot = (0, demo_simulator_1.createDemoBot)(metrics);
    const port = Number(process.env.DASHBOARD_PORT || '3000');
    const durationMs = Number(process.env.DEMO_DURATION_MS || '86400000');
    const server = (0, dashboard_server_1.startDashboardServer)(metrics, port);
    console.log(`🧪 Starting 24h-style BTC demo session for ${(durationMs / 3600000).toFixed(2)}h`);
    const runPromise = bot.runFor(durationMs).then(() => {
        console.log('✅ Demo session finished');
        server.close();
    });
    process.on('SIGINT', () => {
        console.log('\n🛑 Stopping dashboard and demo...');
        server.close();
    });
    await runPromise;
}
void main().catch((error) => {
    console.error('Dashboard runner failed:', error);
    process.exit(1);
});
//# sourceMappingURL=dashboard-runner.js.map