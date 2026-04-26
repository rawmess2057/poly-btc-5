import { IncomingMessage, ServerResponse } from 'http';
import { DashboardMetricsStore } from './metrics';
export declare function startDashboardServer(metrics: DashboardMetricsStore, port: number, host?: string): import("node:http").Server<typeof IncomingMessage, typeof ServerResponse>;
//# sourceMappingURL=dashboard-server.d.ts.map