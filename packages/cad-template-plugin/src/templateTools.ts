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
      'ƯU TIÊN dùng công cụ này trước khi nghĩ tới các lệnh vẽ: template đã mã hóa sẵn ' +
      'kích thước theo TCVN dưới dạng dải cho phép, nên không cần tra cứu tiêu chuẩn ' +
      'cho những kích thước nó đã quản. ' +
      'Danh mục template và tham số của từng cái nằm trong phần "Template đã công bố" ' +
      'ở đầu hội thoại. Tham số không truyền sẽ lấy giá trị mặc định của template. ' +
      'Giá trị ngoài dải cho phép sẽ bị từ chối kèm dải đúng — hãy sửa số rồi gọi lại, ' +
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
  return {
    ok: true,
    status: 'ready',
    message:
      `Đã dựng "${templateName}" (${templateId} v${version}): ` +
      `${result.entityCount} đối tượng trên layer ${result.layers.join(', ')}. ` +
      'Kích thước đã nằm trong dải TCVN mà template quản.',
    // Only what a later step needs to act on. The message already says the
    // rest, and a tool result is re-sent on every remaining step of the turn.
    data: { partIds: [templateId], soDoiTuong: result.entityCount }
  }
}
