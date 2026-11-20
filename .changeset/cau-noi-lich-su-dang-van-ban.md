---
---

Stop the Claude CLI bridge from teaching the model the one calling style the CLI forbids. The browser's history reached the CLI as Anthropic JSON, so every step showed the model 15–20 native `tool_use` blocks in its own voice; it copied them, the CLI refused them mid-run, and each refusal cost an extra model call (16 of 27 steps on 17/11/2026). The history is now rendered as a record — `#n GỌI <tool> <input>` / `#n KẾT QUẢ: …` — with images still attached as base64 blocks, and `tool.name` in the structured-output schema is an enum of exactly the tools the browser sent.
