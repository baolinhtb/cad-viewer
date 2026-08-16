import { AcTpDrawContext } from './AcTpDrawContext'

/** Kind of value a template parameter accepts. */
export type AcTpParamType = 'number' | 'integer' | 'text' | 'choice' | 'boolean'

/**
 * Declaration of one input a template needs.
 *
 * The input form and the Excel batch sheet are both generated from these
 * declarations, which is what keeps "add a template" from meaning "write more
 * UI code". A parameter that is not declared here cannot be asked for.
 */
export interface AcTpParamSpec {
  /** Machine key: ASCII slug, used as the Excel column and the JSON key. */
  key: string
  /** Label shown to the engineer, in Vietnamese. */
  label: string
  type: AcTpParamType
  /**
   * Unit shown next to the field (`m`, `cm`, `%`, …). Required for numeric
   * inputs: an unlabelled number is the single easiest way to get a drawing
   * wrong by a factor of ten.
   */
  unit?: string
  /** Inclusive lower bound for numeric inputs. */
  min?: number
  /** Inclusive upper bound for numeric inputs. */
  max?: number
  /** Allowed values when `type` is `'choice'`. */
  choices?: readonly { value: string; label: string }[]
  /** Prefilled value. */
  default?: number | string | boolean
  /** Groups fields into wizard steps; fields sharing a group appear together. */
  group?: string
  /** Extra guidance shown under the field. */
  hint?: string
}

/** Identity and description of a template. */
export interface AcTpTemplateMeta {
  /**
   * Author-declared identifier, stable across versions. The server rejects a
   * re-upload of the same `(id, version)` with different content, so this is
   * what makes a saved drawing's "regenerate" reproducible.
   */
  id: string
  /** Author-declared version. Pinned into every drawing this template makes. */
  version: string
  name: string
  /**
   * Structure family, used for filtering in the template library.
   *
   * A label an engineer reads, not a machine key — it is shown verbatim on
   * the filter chips and on every card. `role` slugs are matched by machine
   * and stay unaccented; this one is only ever displayed, so "Cầu bản" beats
   * "cau_ban" on a screen a Vietnamese engineer is looking at.
   */
  category: string
  description?: string
}

/** Values entered by the engineer, keyed by {@link AcTpParamSpec.key}. */
export type AcTpParamValues = Record<string, number | string | boolean>

/**
 * The contract every template module must satisfy.
 *
 * A template is a plain module — no class to extend, no registration call. It
 * declares what it needs and how to draw it; everything else (form, Excel
 * sheet, validation, undo grouping, semantic tagging) is the platform's job.
 *
 * @example
 * ```ts
 * const template: AcTpTemplate = {
 *   meta: { id: 'cau_ban_btct', version: '1.0.0', name: 'Cầu bản BTCT', category: 'Cầu bản' },
 *   params: [
 *     { key: 'L', label: 'Chiều dài nhịp', type: 'number', unit: 'm', min: 6, max: 24, default: 12 }
 *   ],
 *   generate(ctx, values) {
 *     ctx.line({ role: 'ban_mat_cau', partId: 'bmc', start: ..., end: ... })
 *   }
 * }
 * export default template
 * ```
 */
export interface AcTpTemplate {
  meta: AcTpTemplateMeta
  params: readonly AcTpParamSpec[]
  /**
   * Draws the whole thing. May be asynchronous; the platform wraps the entire
   * call in a single undo mark, so a template never has to think about undo.
   */
  generate(ctx: AcTpDrawContext, values: AcTpParamValues): void | Promise<void>
}

/**
 * Validates values against a template's declarations.
 *
 * Runs before `generate` so a bad number is reported against the field the
 * engineer typed it into, rather than surfacing later as broken geometry.
 *
 * @returns One message per offending field; empty when everything passes.
 */
export function validateParamValues(
  params: readonly AcTpParamSpec[],
  values: AcTpParamValues
): string[] {
  const errors: string[] = []

  for (const spec of params) {
    const raw = values[spec.key]

    if (raw === undefined || raw === '') {
      if (spec.default === undefined) {
        errors.push(`${spec.label}: chưa nhập giá trị.`)
      }
      continue
    }

    if (spec.type === 'number' || spec.type === 'integer') {
      const value = Number(raw)
      if (!Number.isFinite(value)) {
        errors.push(`${spec.label}: phải là một số.`)
        continue
      }
      if (spec.type === 'integer' && !Number.isInteger(value)) {
        errors.push(`${spec.label}: phải là số nguyên.`)
        continue
      }
      const unit = spec.unit ? ` ${spec.unit}` : ''
      if (spec.min !== undefined && value < spec.min) {
        errors.push(
          `${spec.label}: phải từ ${spec.min}${unit} trở lên (đang nhập ${value}${unit}).`
        )
      }
      if (spec.max !== undefined && value > spec.max) {
        errors.push(
          `${spec.label}: không được quá ${spec.max}${unit} (đang nhập ${value}${unit}).`
        )
      }
      continue
    }

    if (spec.type === 'choice') {
      const allowed = (spec.choices ?? []).map(c => c.value)
      if (!allowed.includes(String(raw))) {
        errors.push(
          `${spec.label}: giá trị không hợp lệ. Chọn một trong: ${allowed.join(', ')}.`
        )
      }
    }
  }

  return errors
}
