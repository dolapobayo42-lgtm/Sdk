import 'dotenv/config';

import { Bot } from 'grammy';
import { loadConfig } from './config.js';
import { log } from './logger.js';
import type { TokenLaunchEvent } from './types.js';

async function main() {
  const config = loadConfig();

  const apiOnly = process.env.API_ONLY === 'true' || !config.telegramToken;

  let bot: Bot | null = null;
  if (!apiOnly) {
    try {
      bot = new Bot(config.telegramToken);
      log.info('Telegram bot instantiated');
    } catch (err) {
      log.error('Failed to create Telegram bot:', err);
      bot = null;
    }
  } else {
    log.info('Running in API_ONLY mode (no Telegram)');
  }

  // Try to load TokenLaunchMonitor and wire it to the EarlyActivityScorer.
  try {
    const monitorModule = await import('./token-launch-monitor.js');
    const TokenLaunchMonitor = monitorModule?.TokenLaunchMonitor;
    if (!TokenLaunchMonitor) {
      log.info('TokenLaunchMonitor not exported from token-launch-monitor.js');
    } else {
      // Try to load the EarlyActivityScorer (optional)
      let EarlyActivityScorerModule: any = null;
      try {
        EarlyActivityScorerModule = await import('./early-activity-scorer.js');
        log.info('EarlyActivityScorer loaded');
      } catch (err) {
        log.info('EarlyActivityScorer not available; will skip scored broadcasts');
      }

      const monitor = new TokenLaunchMonitor(config, async (event: TokenLaunchEvent) => {
        try {
          if (EarlyActivityScorerModule && bot) {
            const Scorer = EarlyActivityScorerModule.EarlyActivityScorer;
            const scorer = new Scorer({ bot, config });
            void scorer.observeLaunch(event);
            log.info('Started EarlyActivityScorer for %s', event.mintAddress?.slice(0, 8) ?? '<unknown>');
          } else {
            // Per new behavior: do not immediate-broadcast; log only
            log.info('Launch detected for %s but scorer unavailable — skipping immediate broadcast', event.mintAddress?.slice(0, 8) ?? '<unknown>');
          }
        } catch (err) {
          log.error('Error in launch callback:', err);
        }
      });

      log.info('TokenLaunchMonitor started');
    }
  } catch (err) {
    log.info('TokenLaunchMonitor not present or failed to load:', err);
  }

  if (bot) {
    try {
      // Minimal / no-op handlers so the bot can start and receive commands if present elsewhere
      bot.command('ping', async (ctx) => ctx.reply('pong'));

      // Start the bot (will keep process alive)
      await bot.start();
    } catch (err) {
      log.error('Failed to start Telegram bot:', err);
    }
  } else {
    log.info('Bot not started (API_ONLY or failed to instantiate)');
  }
}

main().catch((err) => {
  console.error('Fatal error in bot startup:', err);
  process.exit(1);
});
