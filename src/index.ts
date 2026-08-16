import { loadState, saveState, updateStateWithResult, shouldSendAlert } from './state.js';
import { executeBrowserCheck } from './browser.js';
import { sendDiscordNotification } from './notifier.js';

async function main() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const reset = args.includes('--reset');

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
  console.log(`Duration: ${durationMs} ms`);
  console.log(`Alerts Sent Total: ${updatedState.alertCount}`);
  if (result.errorMessage) {
    console.log(`Reason / Error: ${result.errorMessage}`);
  }
}

main().catch(err => {
  console.error('💥 Unhandled CLI exception:', err);
  process.exit(1);
});
