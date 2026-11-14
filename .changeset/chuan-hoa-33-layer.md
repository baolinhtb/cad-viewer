---
'@mlightcad/cad-template-sdk': minor
'@mlightcad/cad-template-plugin': minor
'@mlightcad/cad-agent-plugin': patch
---

One `_33_*` layer catalogue for every role. `SEED_CATALOG` in the template SDK is the single place for role labels, `_33_` layers, colours and old layer names; `KC-*`, `KT-*`, `GC-*`, `TRUC-TIM` and `_Matduong_BTN` are kept only to recognise old drawings (`gan_nhan_tu_layer`). A template that still names an old layer draws on its `_33_` layer and reports a warning. Server migration v10 moves untouched seed terms to `_33_`, adds missing `_33_` layers and terms, and marks old names `legacy_of` without deleting or rewriting anything a person entered; `server/auth/dry-run-v10.mjs` prints the plan for a copy of a database without writing.
