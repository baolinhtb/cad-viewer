/**
 * Agent execution mode for the CAD drawing assistant.
 *
 * The three differ in how many times the model is called for one request, which
 * is what the bill is made of: a turn is not one call, it is one call per step.
 * Measured on a bridge cross-section — `mot-lenh` 1, `simple` 6, and
 * `high-inference` those plus a vision call per verification round.
 */
export type AgentMode = 'mot-lenh' | 'simple' | 'high-inference'

const STORAGE_KEY = 'cad-agent-plugin.agent-mode'

const MODES: readonly AgentMode[] = ['mot-lenh', 'simple', 'high-inference']

const DEFAULT_MODE: AgentMode = 'high-inference'

/**
 * How many model calls one turn may make, per mode.
 *
 * One is the floor, not a tuning choice: after the tools run, the model has to
 * be called again before it can say anything about what happened. A turn capped
 * at one call therefore never gets to report, so `mot-lenh` surfaces the tools'
 * own outcomes instead — which is why those outcomes are written in Vietnamese
 * an engineer can read, rather than as machine status.
 */
export function stepBudget(mode: AgentMode): number {
  return mode === 'mot-lenh' ? 1 : 10
}

/** Loads the persisted agent mode from `localStorage`. */
export function loadAgentMode(): AgentMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (MODES.includes(raw as AgentMode)) {
      return raw as AgentMode
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_MODE
}

/** Persists the selected agent mode to `localStorage`. */
export function saveAgentMode(mode: AgentMode): void {
  localStorage.setItem(STORAGE_KEY, mode)
}
