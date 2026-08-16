import fs from 'fs';
import path from 'path';
import { PersistentState, MonitorState, CheckResult } from './types.js';
import { config } from './config.js';

const DEFAULT_STATE: PersistentState = {
  lastState: null,
  lastCheckDateISO: null,
  observedPrice: null,
  observedRawText: null,
  alertCount: 0,
  lastErrorReason: null,
};

/**
 * Loads persistent state from state.json.
 */
export function loadState(): PersistentState {
  try {
    if (!fs.existsSync(config.stateFile)) {
      return { ...DEFAULT_STATE };
    }
    const raw = fs.readFileSync(config.stateFile, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      lastState: parsed.lastState ?? null,
      lastCheckDateISO: parsed.lastCheckDateISO ?? null,
      observedPrice: parsed.observedPrice ?? null,
      observedRawText: parsed.observedRawText ?? null,
      alertCount: typeof parsed.alertCount === 'number' ? parsed.alertCount : 0,
      lastErrorReason: parsed.lastErrorReason ?? null,
    };
  } catch (err) {
    console.warn('⚠️ Unable to read state file, using initial default state.', err);
    return { ...DEFAULT_STATE };
  }
}

/**
 * Persists updated state into state.json.
 */
export function saveState(state: PersistentState): void {
  const dir = path.dirname(config.stateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Combines current persistent state with execution result.
 */
export function updateStateWithResult(
  currentState: PersistentState,
  result: CheckResult,
  didAlert: boolean
): PersistentState {
  return {
    lastState: result.state,
    lastCheckDateISO: new Date().toISOString(),
    observedPrice: result.observedPrice,
    observedRawText: result.observedRawText,
    alertCount: didAlert ? currentState.alertCount + 1 : currentState.alertCount,
    lastErrorReason: result.errorMessage,
  };
}

/**
 * Evaluates whether an alert should be dispatched based on state transitions.
 * 
 * Alerts are dispatched ONLY IF:
 * 1. State transitions to AVAILABLE
 * 2. State transitions to BLOCKED (single technical notification)
 * 3. State transitions to UNKNOWN from a previously valid state (SOLD_OUT or AVAILABLE)
 */
export function shouldSendAlert(previousState: PersistentState, newState: MonitorState): boolean {
  const prev = previousState.lastState;

  // 1. Transition to AVAILABLE
  if (newState === 'AVAILABLE' && prev !== 'AVAILABLE') {
    return true;
  }

  // 2. Transition to BLOCKED (only send once when becoming BLOCKED)
  if (newState === 'BLOCKED' && prev !== 'BLOCKED') {
    return true;
  }

  // 3. Transition to UNKNOWN from a previously valid state (SOLD_OUT or AVAILABLE)
  if (newState === 'UNKNOWN' && (prev === 'SOLD_OUT' || prev === 'AVAILABLE')) {
    return true;
  }

  return false;
}
