import { loadState, saveState, updateStateWithResult, shouldSendAlert } from './state.js';
import { executeBrowserCheck } from './browser.js';
import { sendDiscordNotification } from './notifier.js';
import { config } from './config.js';

/**
 * Calculates a Gaussian / Standard Deviation random delay within [0, maxSeconds].
 * Uses Box-Muller transform for realistic natural variance around mean.
 */
function getRandomJitterSeconds(maxSeconds: number): number {
  if (maxSeconds <= 0) return 0;
  
  // Box-Muller transform for normal distribution
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  
  // Normalize mean to maxSeconds / 2 with standard deviation maxSeconds / 6
  const mean = maxSeconds / 2;
  const stdDev = maxSeconds / 6;
  let result = Math.round(mean + num * stdDev);
  
  // Clamp within [0, maxSeconds]
  return Math.max(0, Math.min(maxSeconds, result));
}

async function main() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const reset = args.includes('--reset');
  const applyJitterFlag = args.includes('--jitter');

  console.log('🎫 === TicketScout - Ticket Availability Monitor ===');
  console.log(`Execution Time: ${new Date().toISOString()}`);

  if (reset) {
    console.log('🔄 Resetting persistent state file...');
    saveState({
      lastState: null,
      lastCheckDateISO: null,
      observedPrice: null,
      observedRawText: null,
      alertCount: 0,
      lastErrorReason: null,
    });
    console.log('✅ State reset successfully.');
    return;
  }

  // Calculate random schedule jitter if configured or requested via flag
  const effectiveMaxJitter = applyJitterFlag ? (config.maxJitterSeconds || 3600) : config.maxJitterSeconds;
  if (effectiveMaxJitter > 0) {
    const jitterSec = getRandomJitterSeconds(effectiveMaxJitter);
    const jitterMin = (jitterSec / 60).toFixed(1);
    console.log(`🎲 Applying random schedule jitter: sleeping for ${jitterSec}s (~${jitterMin} min) before check...`);
    await new Promise(resolve => setTimeout(resolve, jitterSec * 1000));
  }

  const previousState = loadState();
  console.log(`📌 Previous State: [${previousState.lastState || 'NONE'}] | Last Check: ${previousState.lastCheckDateISO || 'Never'}`);

  // Safety lock: if state is BLOCKED, refuse to re-run without --force
  if (previousState.lastState === 'BLOCKED' && !force) {
    console.error('⛔ SAFETY LOCK ACTIVATED: The previous execution ended in state BLOCKED.');
    console.error('⛔ Automated execution halted to protect VPS IP from anti-bot bans.');
    console.error('💡 Run with `--force` or `--reset` to override the safety lock after manual verification.');
    process.exit(1);
  }

  const { result, screenshotPath } = await executeBrowserCheck();

  const didAlertConditionMet = shouldSendAlert(previousState, result.state);
  let alertSent = false;

  if (didAlertConditionMet) {
    console.log(`🔔 Alert condition triggered for state transition: ${previousState.lastState || 'NONE'} ➡️ ${result.state}`);
    if (dryRun) {
      console.log('🧪 --dry-run mode enabled: Discord webhook suppressed.');
    } else {
      alertSent = await sendDiscordNotification(result, previousState.lastState, screenshotPath);
    }
  } else {
    console.log(`ℹ️ State unchanged or no alert required (${previousState.lastState} ➡️ ${result.state}). No notification sent.`);
  }

  const updatedState = updateStateWithResult(previousState, result, alertSent);
  saveState(updatedState);

  const durationMs = Date.now() - startTime;
  console.log(`\n=== TicketScout Check Finished ===`);
  console.log(`Status: [${result.state}]`);
  console.log(`Observed Price: ${result.observedPrice || 'N/A'}`);
  console.log(`Raw Text: ${result.observedRawText || 'N/A'}`);
  console.log(`Total Duration (including jitter): ${(durationMs / 1000).toFixed(1)} s`);
  console.log(`Alerts Sent Total: ${updatedState.alertCount}`);
  if (result.errorMessage) {
    console.log(`Reason / Error: ${result.errorMessage}`);
  }
}

main().catch(err => {
  console.error('💥 Unhandled CLI exception:', err);
  process.exit(1);
});
