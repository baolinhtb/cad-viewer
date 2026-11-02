---
"@mlightcad/cad-template-sdk": patch
"@mlightcad/cad-agent-plugin": patch
"@mlightcad/cad-mcp-server": patch
"@mlightcad/cad-viewer": patch
"@mlightcad/cad-simple-viewer": patch
---

Integrate upstream 1.7.8 with the office template library, draft abutment dossier,
Codex proxy, saved drawings, and Vietnamese UI. Keep native dimension text
placement and preserve Unicode run metadata across DXF export and reopen.

Keep top-level model/layout entities drawable when an imported symbol record
is present in the name index but absent from the handle lookup.
