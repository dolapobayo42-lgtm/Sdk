// telegram-bot/src/types.ts
/**
 * Minimal shared types for the telegram-bot module.
 */

export interface BotConfig {
    allowedUserIds: number[];
    enableFeeDistributionAlerts: boolean;
    enableGraduationAlerts: boolean;
    enableLaunchMonitor: boolean;
    enableTradeAlerts: boolean;
    githubOnlyFilter: boolean;
    ipfsGateway: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    pollIntervalSeconds: number;
    solanaRpcUrl: string;
    solanaRpcUrls: string[];
    solanaWsUrl?: string;
    telegramToken: string;
    whaleThresholdSol: number;
    // Early-activity scorer config
    earlyWindowSeconds: number;
    scoreThreshold: number;
    weights?: {
        devBuyWeight: number;
        uniqueBuyersWeight: number;
        topConcentrationWeight: number;
        curveProgressWeight: number;
        creatorHistoryWeight: number;
    };
}

// TokenLaunchEvent type (minimal)
export interface TokenLaunchEvent {
    txSignature: string;
    slot: number;
    timestamp: number;
    mintAddress: string;
    creatorWallet: string;
    name: string;
    symbol: string;
    description: string;
    metadataUri: string;
    hasGithub: boolean;
    githubUrls: string[];
    mayhemMode: boolean;
    cashbackEnabled: boolean;
    metadata?: Record<string, unknown>;
}

export interface LaunchMonitorEntry {
    chatId: number;
    activatedBy: number;
    githubOnly: boolean;
    active: boolean;
    activatedAt: number;
    alerts?: { launches?: boolean; graduations?: boolean; whales?: boolean; feeDistributions?: boolean };
}
