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

/** `**bold**` (on one line, not empty, not padded) as `<strong>`, on escaped text. */
const bold = (escaped: string) =>
  escaped.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '<strong>$1</strong>')

/** The cells of a GFM table row (`| a | b |`), or undefined if it is not one. */
function tableCells(line: string): string[] | undefined {
  const t = line.trim()
  if (t.length < 3 || !t.startsWith('|') || !t.endsWith('|')) return undefined
  const cells = t
    .slice(1, -1)
    .split('|')
    .map(c => c.trim())
  return cells.length >= 1 ? cells : undefined
}
const isSeparator = (cells: string[]) => cells.every(c => /^:?-{3,}:?$/.test(c))

/** A GFM table as HTML: a header when its second row is `| --- |`. */
function tableHtml(rows: string[][]): string {
  const cell = (tag: string, c: string) =>
    `<${tag}>${bold(acapEscapeHtml(c))}</${tag}>`
  const row = (cells: string[], tag: string) =>
    `<tr>${cells.map(c => cell(tag, c)).join('')}</tr>`
  const header = rows.length > 1 && isSeparator(rows[1])
  const body = header ? rows.slice(2) : rows
  return (
    '<table class="cad-agent-msg-table">' +
    (header ? `<thead>${row(rows[0], 'th')}</thead>` : '') +
    `<tbody>${body.map(r => row(r, 'td')).join('')}</tbody></table>`
  )
}

/**
 * HTML for a message: everything escaped, then only `**bold**` (on one line,
 * not empty, not padded with spaces) turned into `<strong>`, and GFM tables
 * — two or more consecutive `| … |` rows, a `| --- |` second row making the
 * first the header — into `<table>` (QA P1/M6: `| Dài bệ | 6000 mm |` showed
 * as bare pipes). A lone asterisk stays an asterisk; a lone `| … |` line is
 * not a table; line breaks stay text (the palette keeps them with
 * `white-space: pre-wrap`).
 */
export function acapChatMessageHtml(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let prose: string[] = []
  const flush = () => {
    if (prose.length) out.push(bold(acapEscapeHtml(prose.join('\n'))))
    prose = []
  }
  for (let i = 0; i < lines.length; ) {
    const rows: string[][] = []
    let j = i
    for (let cells = tableCells(lines[j] ?? ''); cells; ) {
      rows.push(cells)
      j += 1
      cells = j < lines.length ? tableCells(lines[j]) : undefined
    }
    const body =
      rows.length > 1 && isSeparator(rows[1]) ? rows.length - 2 : rows.length
    if (rows.length >= 2 && body >= 1) {
      // The line break before the table belongs to it, not to the prose.
      if (prose.length && prose[prose.length - 1] === '') prose.pop()
      flush()
      out.push(tableHtml(rows))
      i = j
      // …and so does the one after it.
      if (lines[i] === '') i += 1
      continue
    }
    prose.push(lines[i])
    i += 1
  }
  flush()
  return out.join('')
}
