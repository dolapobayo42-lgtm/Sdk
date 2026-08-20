import 'dotenv/config';

import type { BotConfig } from './types.js';

export function loadConfig(): BotConfig {
    const apiOnly = process.env.API_ONLY === 'true';
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN || '';

    const solanaRpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

    const solanaRpcUrls = process.env.SOLANA_RPC_URLS
        ? process.env.SOLANA_RPC_URLS.split(',').map((s) => s.trim()).filter(Boolean)
        : [solanaRpcUrl];

    const solanaWsUrl = process.env.SOLANA_WS_URL || '';

    const pollIntervalSeconds = Number.parseInt(process.env.POLL_INTERVAL_SECONDS || '60', 10);

    const allowedUserIds = process.env.ALLOWED_USER_IDS
        ? process.env.ALLOWED_USER_IDS.split(',').map((id) => Number.parseInt(id.trim(), 10)).filter((id) => !Number.isNaN(id))
        : [];

    const logLevel = (process.env.LOG_LEVEL || 'info') as BotConfig['logLevel'];

    const enableLaunchMonitor = (process.env.ENABLE_LAUNCH_MONITOR || 'false').toLowerCase() === 'true';
    const githubOnlyFilter = (process.env.GITHUB_ONLY_FILTER || 'false').toLowerCase() === 'true';

    const enableGraduationAlerts = (process.env.ENABLE_GRADUATION_ALERTS || 'true').toLowerCase() === 'true';
    const enableTradeAlerts = (process.env.ENABLE_TRADE_ALERTS || 'false').toLowerCase() === 'true';
    const whaleThresholdSol = Number.parseFloat(process.env.WHALE_THRESHOLD_SOL || '10');
    const enableFeeDistributionAlerts = (process.env.ENABLE_FEE_DISTRIBUTION_ALERTS || 'false').toLowerCase() === 'true';

    const earlyWindowSeconds = Number.parseInt(process.env.EARLY_WINDOW_SECONDS ?? '120', 10);
    const scoreThreshold = Number.parseFloat(process.env.SCORE_THRESHOLD ?? '7');

    const weights = {
        devBuyWeight: Number.parseFloat(process.env.WEIGHT_DEV_BUY ?? '1'),
        uniqueBuyersWeight: Number.parseFloat(process.env.WEIGHT_UNIQUE_BUYERS ?? '1'),
        topConcentrationWeight: Number.parseFloat(process.env.WEIGHT_TOP_CONCENTRATION ?? '1'),
        curveProgressWeight: Number.parseFloat(process.env.WEIGHT_CURVE_PROGRESS ?? '1'),
        creatorHistoryWeight: Number.parseFloat(process.env.WEIGHT_CREATOR_HISTORY ?? '1'),
    };

    return {
        allowedUserIds,
        enableFeeDistributionAlerts,
        enableGraduationAlerts,
        enableLaunchMonitor,
        enableTradeAlerts,
        githubOnlyFilter,
        ipfsGateway: process.env.IPFS_GATEWAY || 'https://cf-ipfs.com/ipfs/',
        logLevel,
        pollIntervalSeconds,
        solanaRpcUrl,
        solanaRpcUrls,
        solanaWsUrl,
        telegramToken,
        whaleThresholdSol,
        earlyWindowSeconds,
        scoreThreshold,
        weights,
    } as unknown as BotConfig;
}
