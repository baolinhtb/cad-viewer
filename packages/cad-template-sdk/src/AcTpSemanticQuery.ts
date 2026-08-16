import { AcDbDatabase } from '@mlightcad/data-model'

import {
  AcTpDrawingDigest,
  AcTpPartSummary,
  findParts,
  readDrawingDigest
} from './AcTpDrawingDigest'
import { AcTpSide } from './AcTpPartId'

/**
 * The query layer an assistant reasons through.
 *
 * Two rules shape everything here, and both exist because the failure they
 * prevent is silent.
 *
 * **Never guess.** A wrong edit that looks like a right one is the worst
 * outcome this system can produce: the engineer moves on, and the mistake
 * reaches a drawing set. So every answer is one of a small set of explicit
 * outcomes, and "I am not sure" is one of them.
 *
 * **Never confuse "no tags" with "not found".** A drawing imported from DWG
 * carries no semantic tags at all. Answering "there is no railing here" about
 * a drawing that is entirely railing is worse than answering nothing, because
 * it sounds like knowledge.
 */

/** What a query concluded. */
export type AcTpQueryStatus =
  /** Exactly what was asked for. */
  | 'found'
  /** The drawing supports tags and has no part matching this. */
  | 'not_found'
  /** More than one part matches; the caller must ask rather than pick. */
  | 'ambiguous'
  /** The drawing carries no semantic tags — the question cannot be asked. */
  | 'unsupported'
  /** The word does not map to any role in the dictionary. */
  | 'unknown_term'

export interface AcTpQueryResult {
  status: AcTpQueryStatus
  parts: AcTpPartSummary[]
  /** Roles worth trying, when the term was not understood. */
  suggestions?: { role: string; label: string; reason: string }[]
  /** Plain-language explanation, safe to show an engineer as-is. */
  message: string
}

/** One dictionary entry as the standardisation layer serves it. */
export interface AcTpTerm {
  role: string
  label: string
  aliases: string[]
  layer?: string | null
}

/** Comparison form: case, spacing and Vietnamese tone marks all removed. */
export function normalizeTerm(value: string): string {
  return (
    String(value ?? '')
      .normalize('NFD')
      // Strip combining tone marks, then fold đ/Đ, which NFD does not decompose.
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** Edit distance, capped: past a few edits the words are simply different. */
function editDistance(a: string, b: string, cap = 4): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    previous = current
  }
  return previous[b.length]
}

/**
 * Maps what an engineer said onto a role.
 *
 * Tone marks are ignored on both sides, because an engineer typing quickly
 * writes "lan can" as often as "làn can", and refusing the unaccented form
 * would make the assistant look broken over a keyboard habit.
 *
 * Returns suggestions rather than a best guess when nothing matches. Acting on
 * a near-miss is how "xóa lan can" becomes "xóa lan can bên trái".
 */
export function resolveTerm(
  phrase: string,
  dictionary: readonly AcTpTerm[]
): {
  role?: string
  suggestions: { role: string; label: string; reason: string }[]
} {
  const needle = normalizeTerm(phrase)
  if (!needle) return { suggestions: [] }

  for (const term of dictionary) {
    const forms = [term.role, term.label, ...term.aliases].map(normalizeTerm)
    if (forms.includes(needle)) return { role: term.role, suggestions: [] }
  }

  // Containment before edit distance: "lan can bên phải" contains "lan can",
  // and that is a stronger signal than any number of character edits.
  const contained = dictionary.filter(term =>
    [term.label, ...term.aliases].some(form => {
      const other = normalizeTerm(form)
      return (
        other.length > 2 && (needle.includes(other) || other.includes(needle))
      )
    })
  )
  if (contained.length === 1) {
    return { role: contained[0].role, suggestions: [] }
  }

  const scored = dictionary
    .map(term => ({
      term,
      distance: Math.min(
        ...[term.label, ...term.aliases, term.role].map(form =>
          editDistance(needle, normalizeTerm(form))
        )
      )
    }))
    .filter(entry => entry.distance <= 3)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)

  return {
    suggestions: [
      ...contained.map(term => ({
        role: term.role,
        label: term.label,
        reason: 'chứa cụm từ tương tự'
      })),
      ...scored
        .filter(entry => !contained.includes(entry.term))
        .map(entry => ({
          role: entry.term.role,
          label: entry.term.label,
          reason: `gần giống (khác ${entry.distance} ký tự)`
        }))
    ].slice(0, 3)
  }
}

/** Names a part the way an engineer would say it back. */
export function describePart(part: AcTpPartSummary): string {
  const side =
    part.side === 'trai' ? ' bên trái' : part.side === 'phai' ? ' bên phải' : ''
  const ordinal = part.ordinal !== undefined ? ` số ${part.ordinal}` : ''
  return `${part.roleLabel ?? part.role}${side}${ordinal}`
}

/**
 * Locates the parts a phrase refers to.
 *
 * @param db - Drawing to search.
 * @param phrase - What the engineer said, unmodified.
 * @param dictionary - The company's terms, from the standardisation layer.
 * @param qualifier - Side and ordinal already extracted by the caller.
 */
export function locateParts(
  db: AcDbDatabase,
  phrase: string,
  dictionary: readonly AcTpTerm[],
  qualifier: { side?: AcTpSide; ordinal?: number } = {},
  digest: AcTpDrawingDigest = readDrawingDigest(db)
): AcTpQueryResult {
  if (digest.status !== 'tagged') {
    // Checked before the term is even resolved: on a drawing with no tags the
    // answer is the same whatever was asked, and resolving first would let a
    // "not found" escape for the wrong reason.
    return {
      status: 'unsupported',
      parts: [],
      message:
        digest.status === 'untagged'
          ? 'Bản vẽ này không mang nhãn ngữ nghĩa (thường là bản vẽ nhập từ DWG), nên không xác định được bộ phận theo tên. Không thể sửa tự động.'
          : 'Bản vẽ mang nhãn theo lược đồ khác, bản dựng này chưa đọc được. Không thể sửa tự động.'
    }
  }

  const { role, suggestions } = resolveTerm(phrase, dictionary)
  if (!role) {
    return {
      status: 'unknown_term',
      parts: [],
      suggestions,
      message: suggestions.length
        ? `Chưa hiểu "${phrase}". Ý bạn là: ${suggestions.map(s => s.label).join(', ')}?`
        : `Chưa hiểu "${phrase}", và không có thuật ngữ nào gần giống trong từ điển.`
    }
  }

  const matches = findParts(digest, { role, ...qualifier })

  if (matches.length === 0) {
    return {
      status: 'not_found',
      parts: [],
      message: `Bản vẽ này không có ${phrase}.`
    }
  }

  if (matches.length > 1) {
    return {
      status: 'ambiguous',
      parts: matches,
      message: `Có ${matches.length} bộ phận khớp: ${matches
        .map(describePart)
        .join(', ')}. Bạn muốn cái nào?`
    }
  }

  return {
    status: 'found',
    parts: matches,
    message: `Đã xác định ${describePart(matches[0])}.`
  }
}

/**
 * Whether a drawing may be edited by the assistant at all.
 *
 * Separated from locating so a caller can refuse before spending a model call
 * on a drawing nothing can be done to.
 */
export function canEditSemantically(
  db: AcDbDatabase,
  digest: AcTpDrawingDigest = readDrawingDigest(db)
): { allowed: boolean; reason?: string } {
  if (digest.status === 'tagged') return { allowed: true }
  return {
    allowed: false,
    reason:
      digest.status === 'untagged'
        ? 'Bản vẽ không mang nhãn ngữ nghĩa nên trợ lý không sửa được. Hãy sinh bản vẽ từ template, hoặc chỉnh bằng tay.'
        : 'Nhãn trong bản vẽ thuộc lược đồ khác, bản dựng này chưa đọc được.'
  }
}
