/**
 * Early activity scorer for token launches.
 *
 * Starts a short observation window after a TokenLaunchEvent and computes
 * a simple score from on-chain metrics. Sends a Telegram alert only when
 * score >= configured threshold.
 */

import { log } from './logger.js';
import type { BotConfig, TokenLaunchEvent } from './types.js';
import type { Bot } from 'grammy';
import {
    fetchTokenTrades,
    fetchTopHolders,
    fetchPoolLiquidity,
    fetchCreatorProfile,
} from './pump-client.js';
import { formatEarlyActivityAlert } from './formatters.js';
import { getActiveMonitors } from './launch-store.js';

export interface EarlyActivityMetrics {
    devFirstBuySol: number;
    uniqueBuyers: number;
    topWalletVolumePct: number;
    top3WalletsVolumePct: number;
    volumeSol: number;
    bondingCurveProgress: number;
    creatorHadPriorGraduation: boolean;
}

export interface EarlyActivityScorerOptions {
    bot: Bot;
    config: BotConfig;
}

const activeScorers = new Set<string>();

export class EarlyActivityScorer {
    private bot: Bot;
    private config: BotConfig;
    private windowSeconds: number;
    private scoreThreshold: number;
    private weights: {
        devBuyWeight: number;
        uniqueBuyersWeight: number;
        topConcentrationWeight: number;
        curveProgressWeight: number;
        creatorHistoryWeight: number;
    };

    constructor(opts: EarlyActivityScorerOptions) {
        this.bot = opts.bot;
        this.config = opts.config;
        this.windowSeconds = Number(process.env.EARLY_WINDOW_SECONDS ?? String(this.config.earlyWindowSeconds ?? 120));
        this.scoreThreshold = Number(process.env.SCORE_THRESHOLD ?? String(this.config.scoreThreshold ?? 7));
        this.weights = {
            devBuyWeight: Number(process.env.WEIGHT_DEV_BUY ?? String(this.config.weights?.devBuyWeight ?? 1)),
            uniqueBuyersWeight: Number(process.env.WEIGHT_UNIQUE_BUYERS ?? String(this.config.weights?.uniqueBuyersWeight ?? 1)),
            topConcentrationWeight: Number(process.env.WEIGHT_TOP_CONCENTRATION ?? String(this.config.weights?.topConcentrationWeight ?? 1)),
            curveProgressWeight: Number(process.env.WEIGHT_CURVE_PROGRESS ?? String(this.config.weights?.curveProgressWeight ?? 1)),
            creatorHistoryWeight: Number(process.env.WEIGHT_CREATOR_HISTORY ?? String(this.config.weights?.creatorHistoryWeight ?? 1)),
        };
    }

    async observeLaunch(event: TokenLaunchEvent): Promise<void> {
        if (!event?.mintAddress) return;
        const mint = event.mintAddress;

        if (activeScorers.has(mint)) {
            log.debug('Scorer already active for %s — skipping', mint);
            return;
        }
        activeScorers.add(mint);

        log.info('Observing launch %s (%s) for %ds', event.name || 'unknown', mint.slice(0, 8), this.windowSeconds);

        try {
            const pollIntervalMs = 4_000;
            const deadline = Date.now() + this.windowSeconds * 1000;

            let totalVolumeSol = 0;
            const walletVolumes = new Map<string, number>();
            let devFirstBuySol = 0;
            let firstBuyRecorded = false;

            while (Date.now() < deadline) {
                try {
                    const trades = await fetchTokenTrades(mint);
                    const sampleVolume = (trades as any)?.recentVolumeSol ?? 0;
                    totalVolumeSol = Math.max(totalVolumeSol, sampleVolume);

                    if ((trades as any)?.trades && Array.isArray((trades as any).trades)) {
                        const detailed = (trades as any).trades as Array<Record<string, any>>;
                        const buyers = new Set<string>();
                        for (const t of detailed) {
                            if (!t) continue;
                            const buyer = t.buyer ? String(t.buyer) : null;
                            const isBuy = Boolean(t.is_buy);
                            const sol = Number(t.sol_amount ?? 0) / 1_000_000_000;
                            if (buyer) {
                                buyers.add(buyer);
                                walletVolumes.set(buyer, (walletVolumes.get(buyer) ?? 0) + sol);
                            }
                            if (!firstBuyRecorded && isBuy) {
                                devFirstBuySol = sol;
                                firstBuyRecorded = true;
                            }
                        }
                        walletVolumes.set('__unique_buyers', buyers.size);
                    } else {
                        walletVolumes.set('__unique_buyers', Math.max(0, (trades as any)?.buyCount ?? 0));
                        if (!firstBuyRecorded && ((trades as any)?.buyCount ?? 0) > 0) {
                            const avg = ((trades as any)?.recentVolumeSol && ((trades as any).recentTradeCount > 0)) ? ((trades as any).recentVolumeSol / Math.max(1, (trades as any).recentTradeCount)) : 0;
                            devFirstBuySol = avg;
                            firstBuyRecorded = true;
                        }
                    }

                    const holders = await fetchTopHolders(mint);
                    if (holders && holders.length > 0) {
                        const totalHolderTokens = holders.reduce((s, h) => s + (Number(h.tokenAmount ?? 0)), 0);
                        if (totalHolderTokens > 0) {
                            const top1 = Number(holders[0].tokenAmount ?? 0);
                            const top3 = holders.slice(0, 3).reduce((s, h) => s + (Number(h.tokenAmount ?? 0)), 0);
                            walletVolumes.set('__top1_pct', (top1 / totalHolderTokens) * 100);
                            walletVolumes.set('__top3_pct', (top3 / totalHolderTokens) * 100);
                        }
                    }

                    const provisional = this.computeScoreFromSnapshot({
                        devFirstBuySol,
                        uniqueBuyers: Number(walletVolumes.get('__unique_buyers') ?? 0),
                        topWalletPct: Number(walletVolumes.get('__top1_pct') ?? 0),
                        top3Pct: Number(walletVolumes.get('__top3_pct') ?? 0),
                        volumeSol: totalVolumeSol,
                        curveProgress: 0,
                        creatorHadPriorGraduation: false,
                    });
                    if (provisional >= this.scoreThreshold) {
                        log.debug('Provisional score %d >= threshold %d — ending early', provisional, this.scoreThreshold);
                        break;
                    }
                } catch (err) {
                    log.debug('Scorer sample error for %s: %s', mint, err instanceof Error ? err.message : String(err));
                }
                await new Promise((r) => setTimeout(r, pollIntervalMs));
            }

            const uniqueBuyers = Number(walletVolumes.get('__unique_buyers') ?? 0);
            const perWalletVolumes: Array<{ wallet: string; vol: number }> = [];
            for (const [k, v] of walletVolumes.entries()) {
                if (k.startsWith('__')) continue;
                perWalletVolumes.push({ wallet: k, vol: v });
            }
            let top1Pct = Number(walletVolumes.get('__top1_pct') ?? 0);
            let top3Pct = Number(walletVolumes.get('__top3_pct') ?? 0);
            if (perWalletVolumes.length > 0 && totalVolumeSol > 0) {
                perWalletVolumes.sort((a, b) => b.vol - a.vol);
                const top1 = perWalletVolumes[0].vol;
                const top3 = perWalletVolumes.slice(0, 3).reduce((s, x) => s + x.vol, 0);
                top1Pct = (top1 / totalVolumeSol) * 100;
                top3Pct = (top3 / totalVolumeSol) * 100;
            }

            const liquidity = await fetchPoolLiquidity(mint);
            const curveProgress = liquidity?.curveProgress ?? 0;

            let creatorHadPriorGraduation = false;
            try {
                if (event.creatorWallet) {
                    const profile = await fetchCreatorProfile(event.creatorWallet);
                    if (profile && (Array.isArray(profile.recentGraduations) ? profile.recentGraduations.length > 0 : (profile.totalGraduations ?? 0) > 0)) {
                        creatorHadPriorGraduation = true;
                    }
                }
            } catch {
                // ignore
            }

            const metrics: EarlyActivityMetrics = {
                devFirstBuySol: Math.round(devFirstBuySol * 1000000) / 1000000,
                uniqueBuyers,
                topWalletVolumePct: Math.round(top1Pct * 100) / 100,
                top3WalletsVolumePct: Math.round(top3Pct * 100) / 100,
                volumeSol: Math.round(totalVolumeSol * 1000000) / 1000000,
                bondingCurveProgress: Math.round(curveProgress * 100) / 100,
                creatorHadPriorGraduation,
            };

            const score = this.computeScore(metrics);

            log.info('EarlyActivityScorer result for %s score=%d metrics=%o', mint.slice(0, 8), score, metrics);

            if (score >= this.scoreThreshold) {
                await this.broadcastAlert(event, metrics, score);
            } else {
                log.debug('Score %d below threshold %d — not alerting', score, this.scoreThreshold);
            }
        } catch (err) {
            log.error('EarlyActivityScorer error for %s: %s', mint, err);
        } finally {
            activeScorers.delete(mint);
        }
    }

    private computeScore(metrics: EarlyActivityMetrics): number {
        let score = 0;
        const w = this.weights;

        if (metrics.devFirstBuySol >= 10) score += 3 * w.devBuyWeight;
        else if (metrics.devFirstBuySol >= 2) score += 1.5 * w.devBuyWeight;
        else if (metrics.devFirstBuySol >= 0.2) score += 0.5 * w.devBuyWeight;

        if (metrics.uniqueBuyers >= 20) score += 3 * w.uniqueBuyersWeight;
        else if (metrics.uniqueBuyers >= 5) score += 1.5 * w.uniqueBuyersWeight;
        else if (metrics.uniqueBuyers >= 2) score += 0.5 * w.uniqueBuyersWeight;

        const top1 = metrics.topWalletVolumePct;
        if (top1 <= 10) score += 3 * w.topConcentrationWeight;
        else if (top1 <= 25) score += 1.5 * w.topConcentrationWeight;
        else if (top1 <= 40) score += 0.5 * w.topConcentrationWeight;

        const cp = metrics.bondingCurveProgress;
        if (cp >= 60) score += 3 * w.curveProgressWeight;
        else if (cp >= 30) score += 1.5 * w.curveProgressWeight;
        else if (cp >= 10) score += 0.5 * w.curveProgressWeight;

        if (metrics.creatorHadPriorGraduation) score += 1 * w.creatorHistoryWeight;

        return Math.round(score * 100) / 100;
    }

    private computeScoreFromSnapshot(snapshot: {
        devFirstBuySol: number;
        uniqueBuyers: number;
        topWalletPct: number;
        top3Pct: number;
        volumeSol: number;
        curveProgress: number;
        creatorHadPriorGraduation: boolean;
    }): number {
        const metrics: EarlyActivityMetrics = {
            devFirstBuySol: snapshot.devFirstBuySol,
            uniqueBuyers: snapshot.uniqueBuyers,
            topWalletVolumePct: snapshot.topWalletPct,
            top3WalletsVolumePct: snapshot.top3Pct,
            volumeSol: snapshot.volumeSol,
            bondingCurveProgress: snapshot.curveProgress,
            creatorHadPriorGraduation: snapshot.creatorHadPriorGraduation,
        };
        return this.computeScore(metrics);
    }

    private async broadcastAlert(event: TokenLaunchEvent, metrics: EarlyActivityMetrics, score: number): Promise<void> {
        try {
            const monitors = getActiveMonitors();
            if (!monitors || monitors.length === 0) {
                log.debug('No monitors active — skip broadcast for %s', event.mintAddress);
                return;
            }
            const message = formatEarlyActivityAlert(event, metrics, score);
            for (const entry of monitors) {
                if (!entry.alerts || !entry.alerts.launches) continue;
                if (entry.githubOnly && !event.hasGithub) continue;
                try {
                    await this.bot.api.sendMessage(entry.chatId, message, {
                        parse_mode: 'HTML',
                        link_preview_options: { is_disabled: true },
                    });
                } catch (err) {
                    log.error('Failed to send early-activity alert to chat %d: %s', entry.chatId, err);
                }
            }
        } catch (err) {
            log.error('broadcastAlert error:', err);
        }
    }
}
