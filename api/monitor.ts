import type { VercelRequest, VercelResponse } from '@vercel/node';
import { executeBrowserCheck } from '../src/browser.js';
import { loadState, saveState, updateStateWithResult, shouldSendAlert } from '../src/state.js';
import { sendDiscordNotification } from '../src/notifier.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[VERCEL] TicketScout Serverless Handler Invoked');

  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && req.query.secret !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized: Invalid CRON_SECRET' });
  }

  try {
    const previousState = loadState();
    const force = req.query.force === 'true';

    // Safety lock check
    if (previousState.lastState === 'BLOCKED' && !force) {
      console.warn('[SAFETY LOCK] Activated: previous state was BLOCKED.');
      return res.status(423).json({
        error: 'Safety lock activated: previous execution ended in BLOCKED status. Use ?force=true to override.',
        state: 'BLOCKED',
      });
    }

    const { result, screenshotPath } = await executeBrowserCheck();
    const didAlertConditionMet = shouldSendAlert(previousState, result.state);
    let alertSent = false;

    if (didAlertConditionMet) {
      alertSent = await sendDiscordNotification(result, previousState.lastState, screenshotPath);
    }

    const updatedState = updateStateWithResult(previousState, result, alertSent);
    saveState(updatedState);

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      state: result.state,
      observedPrice: result.observedPrice,
      rawText: result.observedRawText,
      alertTriggered: didAlertConditionMet,
      alertSent,
      error: result.errorMessage,
    });
  } catch (err: any) {
    console.error('[FATAL] Vercel handler execution error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
