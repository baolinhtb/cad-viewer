/**
 * Naming convention for {@link AcTpSemanticTag.partId}.
 *
 * `role` says what a thing is; `partId` says *which one*. Without a convention
 * for the second half, "lan can bên phải" is unaddressable — both rails carry
 * `role: 'lan_can'` and nothing distinguishes them. Leaving each template to
 * invent its own scheme is how that ends up discovered at query time, long
 * after drawings have been generated with ids nobody can parse.
 *
 * The form is `role[_side][_ordinal]`:
 *
 * - `ban_mat_cau` — a part there is only one of
 * - `lan_can_trai` — one per side
 * - `ong_thoat_nuoc_03` — one of a numbered run
 * - `goi_cau_phai_02` — both
 *
 * The role is repeated inside the id on purpose. It costs a few characters and
 * buys two things: ids are unique across the whole drawing without a registry,
 * and an id read out of a file is self-describing when the tag is not at hand.
 */

/** Which side of the centreline a part sits on. */
export type AcTpSide = 'trai' | 'phai'

/**
 * Sides are named by looking along increasing chainage (chiều lý trình tăng
 * dần), the convention Vietnamese road drawings use. Any other reading — screen
 * left, or left as drawn — flips when the section is mirrored.
 */
export const SIDES: readonly AcTpSide[] = ['trai', 'phai']

export interface AcTpPartIdParts {
  role: string
  side?: AcTpSide
  /** 1-based position along the structure. Formatted with two digits. */
  ordinal?: number
}

const ORDINAL_PATTERN = /^(\d{2,})$/

/**
 * Builds a partId from its pieces.
 *
 * @throws when `ordinal` is not a positive integer — a zero or fractional
 * ordinal reads as a bug in the template rather than a part that exists.
 */
export function formatPartId(parts: AcTpPartIdParts): string {
  const { role, side, ordinal } = parts
  const segments: string[] = [role]
  if (side) segments.push(side)
  if (ordinal !== undefined) {
    if (!Number.isInteger(ordinal) || ordinal < 1) {
      throw new Error(
        `Số thứ tự của bộ phận phải là số nguyên dương. Nhận được: ${ordinal}`
      )
    }
    segments.push(String(ordinal).padStart(2, '0'))
  }
  return segments.join('_')
}

/**
 * Splits a partId back into its pieces.
 *
 * Returns `undefined` when the id does not start with the role it claims to
 * belong to — that mismatch means the tag and the id disagree, which is worth
 * surfacing rather than silently reading as "no side, no ordinal".
 */
export function parsePartId(
  partId: string,
  role: string
): AcTpPartIdParts | undefined {
  if (partId === role) return { role }
  if (!partId.startsWith(`${role}_`)) return undefined

  const rest = partId.slice(role.length + 1).split('_')
  const parts: AcTpPartIdParts = { role }

  let index = 0
  if (SIDES.includes(rest[index] as AcTpSide)) {
    parts.side = rest[index] as AcTpSide
    index++
  }
  if (index < rest.length) {
    const match = ORDINAL_PATTERN.exec(rest[index])
    if (!match) return undefined
    parts.ordinal = Number(match[1])
    index++
  }
  // Anything left over is an id built to a different scheme.
  return index === rest.length ? parts : undefined
}
