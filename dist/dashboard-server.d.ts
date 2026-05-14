import { DashboardMetricsStore } from './metrics';
export declare class DashboardServer {
    private server;
    private metrics;
    private metricsStore?;
    private equityHistory;
    private eventLog;
    private startTime;
    private startCapital;
    private maxEquity;
    private minEquity;
    constructor(port?: number, metricsStore?: DashboardMetricsStore);
    addEvent(message: string): void;
    private updateMetrics;
    private handleRequest;
    updateFromBot(report: any, compounding: any): void;
    private calculateTierProgress;
    private getHtmlDashboard;
    close(): void;
}
//# sourceMappingURL=dashboard-server.d.ts.map