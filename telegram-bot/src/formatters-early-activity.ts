import { shortAddr, escapeHtml } from './formatters.js';
import type { TokenLaunchEvent } from './types.js';
import type { EarlyActivityMetrics } from './early-activity-scorer.js';

export function formatEarlyActivityAlert(event: TokenLaunchEvent, metrics: EarlyActivityMetrics, score: number): string {
    const mint = event.mintAddress || '';
    const title = `🚨 <b>Early Activity Signal</b>`;
    const name = event.name ? `${escapeHtml(event.name)} (${escapeHtml(event.symbol || '')})` : escapeHtml(event.symbol || mint.slice(0, 8));
    const creatorShort = event.creatorWallet ? `${event.creatorWallet.slice(0, 6)}...${event.creatorWallet.slice(-4)}` : 'unknown';
    const threshold = escapeHtml(String(process.env.SCORE_THRESHOLD ?? '7'));
    const windowSec = escapeHtml(String(process.env.EARLY_WINDOW_SECONDS ?? '120'));

    const lines = [
        `${title} — ${name}`,
        '',
        `🧬 <b>Mint:</b> <code>${mint}</code>`,
        `👤 <b>Creator:</b> <code>${creatorShort}</code>`,
        `🏁 <b>Score:</b> <code>${score}</code> (threshold ${threshold})`,
        '',
        `📊 <b>Metrics (window ${windowSec}s):</b>`,
        `• Dev / 1st buy: <b>${metrics.devFirstBuySol.toFixed(3)} SOL</b>`,
        `• Unique buyers: <b>${metrics.uniqueBuyers}</b>`,
        `• Top1 vol: <b>${metrics.topWalletVolumePct}%</b> · Top3 vol: <b>${metrics.top3WalletsVolumePct}%</b>`,
        `• Bonding curve: <b>${metrics.bondingCurveProgress}%</b>`,
        `• Creator prior grad: <b>${metrics.creatorHadPriorGraduation ? 'yes' : 'no'}</b>`,
        '',
        `🔗 <a href="https://solscan.io/tx/${escapeHtml(event.txSignature)}">View TX</a> · <a href="https://pump.fun/coin/${encodeURIComponent(mint)}">pump.fun</a>`,
    ];

    return lines.join('\n');
}
