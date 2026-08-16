/**
 * Possible monitoring states for ticket availability and bot safety.
 */
export type MonitorState = 'SOLD_OUT' | 'AVAILABLE' | 'UNKNOWN' | 'BLOCKED';

/**
 * Result of a single execution check against the ticketing page.
 */
export interface CheckResult {
  state: MonitorState;
  observedPrice: string | null;
  observedRawText: string | null;
  errorMessage: string | null;
  httpStatus: number | null;
}

/**
 * Persistent state stored in state.json across executions.
 */
export interface PersistentState {
  lastState: MonitorState | null;
  lastCheckDateISO: string | null;
  observedPrice: string | null;
  observedRawText: string | null;
  alertCount: number;
  lastErrorReason: string | null;
}
