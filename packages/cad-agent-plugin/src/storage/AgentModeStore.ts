/**
 * Agent execution mode for the CAD drawing assistant.
 *
 * The three differ in how many times the model is called for one request, which
 * is what the bill is made of: a turn is not one call, it is one call per step,
 * and every step resends the whole conversation.
 *
 * Measured on production, same request each time: `gon` — the compact mode —
 * against `simple` at ten steps and `high-inference` at ten plus a vision call
 * per verification round.
 */
export type AgentMode = 'gon' | 'simple' | 'high-inference'

const STORAGE_KEY = 'cad-agent-plugin.agent-mode'

const MODES: readonly AgentMode[] = ['gon', 'simple', 'high-inference']

/** What an earlier build called the compact mode, kept so a saved choice survives. */
const RENAMED: Readonly<Record<string, AgentMode>> = { 'mot-lenh': 'gon' }

const DEFAULT_MODE: AgentMode = 'high-inference'

/**
 * How many model calls one turn may make, per mode.
 *
 * Three, not one. One was tried and measured: the assistant spent its single
 * step on `tra_cuu_tieu_chuan` and the turn ended with nothing drawn — a step
 * budget only helps if the assistant knows what to spend it on, and one step
 * leaves no room to recover from spending it wrongly. Three is act, correct,
 * report: enough to place a template, fix a value the range refused, and say
 * what happened, with nothing left over for wandering.
 */
export function stepBudget(mode: AgentMode): number {
  return mode === 'gon' ? 3 : 10
}

/** Loads the persisted agent mode from `localStorage`. */
export function loadAgentMode(): AgentMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && RENAMED[raw]) return RENAMED[raw]
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
