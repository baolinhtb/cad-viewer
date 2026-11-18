---
---

Guides for the assistant can now be written and edited inside Cadview: the guide library panel gets a Markdown editor whose frontmatter is generated from a form (id, title, one-line description), saving always as a draft — new guides via POST, edits via the new `PUT /api/skills/:id` (uploader only, never renames, back to draft). The assistant gains `de_xuat_huong_dan`: it drafts a guide from what it just did, the person reviews and edits it in a confirmation card in the chat, and only their confirmation saves it — as their own draft, never published, never over an existing guide.
