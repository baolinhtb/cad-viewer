---
---

Cut the Claude CLI bridge's per-step token cost. The tool list now travels in the system prompt, fixed for the session so the CLI can cache the ~50k-token prefix, instead of in a user message rebuilt every step; `$schema` is dropped from tool schemas and `chay_template` (13 KB of template catalogue) is not offered in an abutment-dossier conversation unless it was already used (`CAD_AGENT_TRIM_TOOLS=0` keeps it). Tool results older than the last four are cut to 400 characters and lose their screenshots. Usage reports cache reads and writes separately, so `ai_calls` finally records them.
