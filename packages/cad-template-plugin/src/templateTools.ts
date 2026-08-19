import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'
import type { AcDbDatabase } from '@mlightcad/data-model'

import { runTemplate } from './runTemplate'
import { findTemplate, listTemplates } from './templateRegistry'
import { defaultValues } from './templateValues'
import type { AcApToolOutcome, AcApToolSchema } from './semanticTools'

/**
 * The tool that lets the assistant draw a part by naming it instead of by
 * placing every line of it.
 *
 * Drawing a bridge cross-section stroke by stroke costs seventy tool calls and
 * makes the assistant responsible for every coordinate and every regulated
 * dimension — measured at 16.795 tokens for one section, of which the standard
 * lookups were a third. The same section named as a template and six numbers is
 * 238 tokens, and the numbers are checked against declared ranges before
 * anything is drawn.
 *
 * The accuracy argument is the one that matters. A looked-up dimension depends
 * on the assistant remembering to look it up, querying for the right thing,
 * reading the clause correctly and applying it correctly — four judgements, on
 * every drawing. A template's `min`/`max` is TCVN written down once by an
 * engineer, reviewed, versioned, and enforced by `validateParamValues` rather
 * than by good intentions.
 *
 * This lives apart from `semanticTools.ts` on purpose: that file is queries
 * only and states plainly that it will not reach for the registry, because
 * doing so drags every registered template into contexts that only wanted to
 * read the drawing. Drawing belongs here, with the registry it needs.
 */
export const TEMPLATE_TOOLS: AcApToolSchema[] = [
  {
    name: 'chay_template',
    description:
      'Dựng một bộ phận công trình từ template đã công bố, thay vì vẽ từng nét. ' +
      'GỌI NGAY công cụ này khi yêu cầu khớp một template trong danh mục dưới đây — ' +
      'không cần bước tìm hiểu nào trước đó. ' +
      'ĐỪNG gọi tra_cuu_tieu_chuan cho những kích thước template đã quản: ' +
      'dải giá trị ghi trong danh mục CHÍNH LÀ tiêu chuẩn, đã được kỹ sư đối chiếu ' +
      'và ghi kèm số hiệu điều khoản trong dấu «...». Trích dẫn số hiệu đó thẳng ' +
      'trong câu trả lời; tra cứu lại chỉ tốn thêm một lượt mà ra cùng con số. ' +
      'Tham số không truyền sẽ lấy giá trị mặc định. ' +
      'Giá trị ngoài dải sẽ bị từ chối kèm dải đúng — sửa số rồi gọi lại, ' +
      'đừng chuyển sang vẽ tay.',
    input_schema: {
      type: 'object',
      properties: {
        ma_template: {
          type: 'string',
          description:
            'Mã template, ví dụ "cau_ban_btct". Lấy từ danh mục ở đầu hội thoại.'
        },
        thong_so: {
          type: 'object',
          description:
            'Giá trị cho các tham số của template, theo đúng khóa và đơn vị đã khai ' +
            'trong danh mục. Ví dụ {"B": 8, "h": 50, "hLanCan": 1.1}. ' +
            'Bỏ trống để dùng toàn bộ giá trị mặc định.',
          additionalProperties: true
        }
      },
      required: ['ma_template'],
      additionalProperties: false
    }
  }
]

/** Ids the assistant may pick from, for when it picked one that does not exist. */
function catalogue(): string {
  const ids = listTemplates().map(t => `${t.meta.id} (${t.meta.name})`)
  return ids.length ? ids.join(', ') : '(chưa có template nào được công bố)'
}

/**
 * One line per template: what it is called, and what it accepts.
 *
 * The catalogue has to travel with the tool rather than with the system prompt.
 * The prompt's "Template đã công bố" section is built on the server from the
 * uploaded-library table, which knows nothing about the templates compiled into
 * this build — so on a deployment with an empty library the assistant was told
 * there were none, and went back to drawing stroke by stroke with the tool
 * sitting right there unused. That was measured, not guessed: a turn that
 * should have been one template call spent eleven model calls and $0.35.
 *
 * Ranges are included because they are the standard: an assistant that can see
 * `hLanCan=Chiều cao lan can (0.8–1.5 m)` does not need to look that up.
 */
function catalogueDetail(): string {
  const lines = listTemplates().map(template => {
    const params = template.params
      .map(spec => {
        const range =
          spec.min !== undefined && spec.max !== undefined
            ? ` (${spec.min}–${spec.max}${spec.unit ? ' ' + spec.unit : ''})`
            : spec.choices
              ? ` (${spec.choices.map(c => c.value).join('|')})`
              : ''
        // The clause the range came from, carried here rather than left in the
        // template's own hint. Without it the assistant sees a bound with no
        // provenance and goes and looks the standard up — measured on
        // production: it spent its whole turn on `tra_cuu_tieu_chuan` and drew
        // nothing. A citation it can already read is a lookup it does not make,
        // and it can quote the clause number in its answer either way.
        const source = citedStandard(spec.hint)
        return `${spec.key}=${spec.label}${range}${source ? ` «${source}»` : ''}`
      })
      .join(', ')
    return `- ${template.meta.id}: ${template.meta.name}${params ? ` [${params}]` : ''}`
  })
  return lines.length
    ? lines.join('\n')
    : '(bản dựng này chưa có template nào)'
}

/**
 * The standard a parameter's bound came from, if its author named one.
 *
 * Only hints that actually cite a standard travel into the catalogue. The rest
 * are drafting conventions ("dương là về phía phải") — useful in a form, noise
 * in a description that rides on every request.
 */
function citedStandard(hint?: string): string | undefined {
  if (!hint) return undefined
  return /TCVN|AASHTO|ISO|QCVN/.test(hint)
    ? hint.replace(/\.$/, '')
    : undefined
}

/**
 * The description handed to the model, catalogue included.
 *
 * Built on demand rather than frozen into {@link TEMPLATE_TOOLS}: templates
 * arrive from the library after this module loads, and a catalogue captured at
 * import time would be permanently empty.
 */
export function templateToolDescription(): string {
  return `${TEMPLATE_TOOLS[0].description}\n\nTemplate dùng được ngay:\n${catalogueDetail()}`
}

/**
 * Runs one template by id.
 *
 * Every failure is an outcome rather than an exception. A refusal that says
 * which range was violated is something the assistant can act on; a thrown
 * error reads as a transport fault and gets retried unchanged.
 */
export async function runTemplateTool(
  name: string,
  input: Record<string, unknown>,
  // Mirrors `runTemplate`: the agent never passes one, but a spec that had to
  // stand up a document manager to check a range message would be testing the
  // viewer instead of the tool.
  database?: AcDbDatabase
): Promise<AcApToolOutcome> {
  if (name !== 'chay_template') {
    return {
      ok: false,
      status: 'refused',
      message: `Không có công cụ tên "${name}".`
    }
  }

  const id = String(input?.ma_template ?? '').trim()
  if (!id) {
    return {
      ok: false,
      status: 'refused',
      message: `Thiếu mã template. Có thể dùng: ${catalogue()}.`
    }
  }

  const template = findTemplate(id)
  if (!template) {
    // Naming the alternatives matters: a model that invented an id will invent
    // the same one again unless it is shown the real list.
    return {
      ok: false,
      status: 'refused',
      message: `Không có template "${id}". Có thể dùng: ${catalogue()}.`
    }
  }

  // Declared defaults first, caller's values on top: a template asked for by
  // name with two numbers should draw, not complain about the other six.
  const supplied = (input?.thong_so ?? {}) as AcTpParamValues
  const values: AcTpParamValues = { ...defaultValues(template), ...supplied }

  let result
  try {
    result = await runTemplate(template, values, database)
  } catch (error) {
    return {
      ok: false,
      status: 'refused',
      message:
        `Template "${id}" lỗi khi dựng hình: ` +
        (error instanceof Error ? error.message : String(error))
    }
  }

  if (result.errors.length > 0) {
    // This is the standard talking. The ranges come from the template's own
    // declarations, so the message already says what TCVN allows.
    return {
      ok: false,
      status: 'refused',
      message:
        `Thông số không hợp lệ, chưa vẽ gì:\n- ${result.errors.join('\n- ')}`
    }
  }

  if (result.entityCount === 0) {
    return {
      ok: false,
      status: 'refused',
      message: `Template "${id}" chạy xong nhưng không vẽ đối tượng nào.`
    }
  }

  const { id: templateId, version, name: templateName } = template.meta

  // Only claim a standard when this template actually cites one. Most do —
  // their ranges come straight from a clause — but not all: TCVN 11823-11:2017
  // governs abutments without giving any dimension for a conventional concrete
  // one, so `mo_cau_btct`'s bounds are the designer's calculation and nothing
  // else. A fixed sentence saying "within the TCVN range" would put a standard
  // behind those numbers that no standard stands behind, which is the exact
  // failure the templates are written to prevent.
  const citesStandard = template.params.some(param =>
    /TCVN|AASHTO|ISO|QCVN/.test(param.hint ?? '')
  )

  return {
    ok: true,
    status: 'ready',
    message:
      `Đã dựng "${templateName}" (${templateId} v${version}): ` +
      `${result.entityCount} đối tượng trên layer ${result.layers.join(', ')}. ` +
      (citesStandard
        ? 'Kích thước đã nằm trong dải TCVN mà template quản.'
        : 'Kích thước nằm trong dải template quản; template này không viện dẫn ' +
          'tiêu chuẩn nào cho trị số, các trị số do tính toán quyết định.'),
    // Only what a later step needs to act on. The message already says the
    // rest, and a tool result is re-sent on every remaining step of the turn.
    data: { partIds: [templateId], soDoiTuong: result.entityCount }
  }
}
