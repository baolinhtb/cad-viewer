/**
 * Display text of an agent message in the chat palette.
 *
 * A message is streamed as several text parts — the sentence before a tool
 * call, then the one after its result. Joined end to end they ran together
 * ("…đỉnh bệ giữ nguyên.Chưa kéo dài được…", UI acceptance 0.3.1b), and the
 * model's `**bold**` showed its asterisks.
 */

/**
 * The message's text parts as one text, each part its own paragraph. Empty
 * parts are dropped; a part that already ends with a line break gets only
 * what is missing for a paragraph break.
 */
export function acapJoinTextParts(parts: readonly string[]): string {
  let out = ''
  for (const part of parts) {
    if (!part.trim()) continue
    if (out) {
      const breaks = /\n*$/.exec(out)![0].length
      const lead = /^\n*/.exec(part)![0].length
      out += '\n'.repeat(Math.max(0, 2 - breaks - lead))
    }
    out += part
  }
  return out
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\u0027': '&#39;'
}

/** Text made safe to put in HTML. */
export function acapEscapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => ESCAPES[c])
}

/**
 * HTML for a message: everything escaped, then only `**bold**` (on one line,
 * not empty, not padded with spaces) turned into `<strong>`. A lone asterisk
 * stays an asterisk; line breaks stay text (the palette keeps them with
 * `white-space: pre-wrap`).
 */
export function acapChatMessageHtml(text: string): string {
  return acapEscapeHtml(text).replace(
    /\*\*(?=\S)([^*\n]*?\S)\*\*/g,
    '<strong>$1</strong>'
  )
}
