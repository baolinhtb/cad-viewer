import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'
import type { AcDbDatabase } from '@mlightcad/data-model'

import { runTemplate } from './runTemplate'
import { assemblyCatalogue, findAssembly, runAssembly } from './assembly'
import { editTemplateRun } from './editRun'
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
      'đừng chuyển sang vẽ tay. ' +
      'CHỈ dùng để dựng bộ phận CHƯA có trong bản vẽ. Nếu người dùng bảo sửa, ' +
      'đổi, tăng, giảm một thứ đã vẽ rồi thì phải dùng sua_lan_chay — gọi lại ' +
      'công cụ này là vẽ thêm một bản nữa chồng lên bản cũ, và bản vẽ càng sửa ' +
      'càng rối. mo_ta_ban_ve cho biết bản vẽ đã có lần chạy nào.',
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
  },
  {
    name: 'ghep_bo_phan',
    description:
      'Ghép nhiều cấu kiện thành một bản vẽ hoàn chỉnh theo cách ghép đã đo từ ' +
      'bản vẽ của kỹ sư: chạy từng template đúng thứ tự và tự tính cao độ, vị ' +
      'trí cho mỗi bộ phận. ' +
      'DÙNG CÔNG CỤ NÀY khi người dùng yêu cầu cả một công trình hay cả một ' +
      'bộ phận lớn (ví dụ "dựng mố cầu"), thay vì gọi chay_template nhiều lần ' +
      'rồi tự tính cao độ — chỗ ghép sai không hiện ra trên màn hình: một tường ' +
      'đầu đặt theo cao độ ở tim thay vì góc thấp thì nhìn giữa vẫn khít mà hai ' +
      'mép hở ra. ' +
      'Chỉ truyền thông số chung cần đổi; phần còn lại lấy mặc định của bản vẽ mẫu. ' +
      'Mỗi bộ phận vẫn là một lần chạy riêng, nên sau đó sửa từng cái bằng ' +
      'sua_lan_chay được.',
    input_schema: {
      type: 'object',
      properties: {
        ma_ghep: {
          type: 'string',
          description: 'Mã cách ghép, ví dụ "mo_cau_hoan_chinh".'
        },
        thong_so: {
          type: 'object',
          description:
            'Thông số chung cần đổi, ví dụ {"B": 9000, "doDocNgang": 1.5}. ' +
            'Bỏ trống để dùng toàn bộ mặc định.',
          additionalProperties: true
        }
      },
      required: ['ma_ghep'],
      additionalProperties: false
    }
  },
  {
    name: 'sua_lan_chay',
    description:
      'Sửa một bộ phận đã dựng từ template: xoá hình cũ và dựng lại với thông ' +
      'số mới, giữ nguyên vị trí trong bản vẽ. ' +
      'DÙNG CÔNG CỤ NÀY mỗi khi người dùng bảo sửa/đổi/tăng/giảm một thứ đã có, ' +
      'thay vì gọi lại chay_template — gọi lại là vẽ chồng thêm một bản nữa, ' +
      'để lại bản cũ, và bản vẽ càng sửa càng rối. ' +
      'Lấy mã lần chạy từ mo_ta_ban_ve. ' +
      'Chỉ cần truyền những thông số THAY ĐỔI; phần còn lại giữ nguyên như lần ' +
      'dựng trước. ' +
      'Nếu thông số mới sai dải thì bị từ chối và bản vẽ giữ nguyên, không mất gì.',
    input_schema: {
      type: 'object',
      properties: {
        ma_lan_chay: {
          type: 'string',
          description:
            'Mã lần chạy cần sửa, ví dụ "r1". Lấy từ mục lanChay của mo_ta_ban_ve.'
        },
        thong_so: {
          type: 'object',
          description:
            'Chỉ những giá trị cần đổi, theo đúng khóa và đơn vị của template. ' +
            'Ví dụ {"B": 8000} để đổi mỗi bề rộng.',
          additionalProperties: true
        }
      },
      required: ['ma_lan_chay', 'thong_so'],
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
 * The assembly tool's description, with the rules written out.
 *
 * The rules go into the description rather than into a document the assistant
 * has to ask for, for the same reason the template catalogue does: a model that
 * has to make one extra call to find out how parts stack will sometimes skip it
 * and stack them itself.
 */
export function assemblyToolDescription(): string {
  const found = TEMPLATE_TOOLS.find(t => t.name === 'ghep_bo_phan')!
  return `${found.description}\n\nCách ghép có sẵn:\n${assemblyCatalogue()}`
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
  if (name === 'ghep_bo_phan') {
    return assembleTool(input, database)
  }
  if (name === 'sua_lan_chay') {
    return editRunTool(input, database)
  }
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

/**
 * Applies an edit to a run the drawing already holds.
 *
 * Kept beside `chay_template` because the two are the same decision seen from
 * either side: draw a part that is not there, or change one that is. The whole
 * reason the drawing carries run ids is so the second is possible at all.
 */
async function editRunTool(
  input: Record<string, unknown>,
  database?: AcDbDatabase
): Promise<AcApToolOutcome> {
  const runId = String(input?.ma_lan_chay ?? '').trim()
  if (!runId) {
    return {
      ok: false,
      status: 'refused',
      message:
        'Thiếu mã lần chạy. Gọi mo_ta_ban_ve để biết bản vẽ có những lần chạy nào.'
    }
  }

  const changes = (input?.thong_so ?? {}) as AcTpParamValues
  if (Object.keys(changes).length === 0) {
    return {
      ok: false,
      status: 'refused',
      message:
        `Chưa nêu thông số nào cần đổi cho lần chạy "${runId}", nên không có gì để sửa.`
    }
  }

  let result
  try {
    result = await editTemplateRun(runId, changes, database)
  } catch (error) {
    return {
      ok: false,
      status: 'refused',
      message:
        `Sửa lần chạy "${runId}" lỗi: ` +
        (error instanceof Error ? error.message : String(error))
    }
  }

  if (result.errors.length > 0) {
    // Bản vẽ chưa bị đụng tới — kiểm tra chạy trước khi xoá gì.
    return {
      ok: false,
      status: 'refused',
      message: `Thông số không hợp lệ, bản vẽ giữ nguyên:\n- ${result.errors.join('\n- ')}`
    }
  }

  const doi = Object.entries(changes)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(', ')
  return {
    ok: true,
    status: 'ready',
    message:
      `Đã sửa ${runId}: ${doi}. Xoá ${result.removed} đối tượng cũ, dựng lại ` +
      `${result.entityCount} đối tượng trên ${result.layers.length} layer.`,
    data: {
      maLanChay: result.runId,
      soDoiTuongXoa: result.removed,
      soDoiTuong: result.entityCount,
      layers: result.layers,
      thongSoSauKhiSua: result.values
    }
  }
}

/**
 * Builds a whole structure from its declared assembly.
 *
 * The placement arithmetic stays in `assembly.ts` rather than being handed to
 * the model as prose: it is exactly the part that fails silently, and a rule
 * the model retypes from a description is a rule nothing checks.
 */
async function assembleTool(
  input: Record<string, unknown>,
  database?: AcDbDatabase
): Promise<AcApToolOutcome> {
  const id = String(input?.ma_ghep ?? '').trim()
  if (!id) {
    return {
      ok: false,
      status: 'refused',
      message: 'Thiếu mã cách ghép.'
    }
  }
  if (!findAssembly(id)) {
    return {
      ok: false,
      status: 'refused',
      message: `Không có cách ghép "${id}".`
    }
  }

  const raw = (input?.thong_so ?? {}) as Record<string, unknown>
  const values: Record<string, number> = {}
  const boQua: string[] = []
  for (const [key, value] of Object.entries(raw)) {
    const num = typeof value === 'string' ? Number(value) : value
    if (typeof num === 'number' && Number.isFinite(num)) values[key] = num
    else boQua.push(key)
  }

  let result
  try {
    result = await runAssembly(id, values, database)
  } catch (error) {
    return {
      ok: false,
      status: 'refused',
      message:
        `Ghép "${id}" lỗi: ` +
        (error instanceof Error ? error.message : String(error))
    }
  }

  if (result.errors.length > 0) {
    return {
      ok: false,
      status: 'refused',
      message:
        `Ghép dừng lại vì có bước không dựng được:\n- ${result.errors.join('\n- ')}`,
      data: { buoc: result.buoc }
    }
  }

  const assembly = findAssembly(id)!
  return {
    ok: true,
    status: 'ready',
    message:
      `Đã ghép ${assembly.ten}: ${result.buoc.length} bộ phận, ` +
      `${result.entityCount} đối tượng. Mỗi bộ phận là một lần chạy riêng ` +
      `(${result.buoc.map(b => b.runId).filter(Boolean).join(', ')}), sửa từng ` +
      'cái bằng sua_lan_chay.' +
      (boQua.length ? ` Bỏ qua thông số không phải số: ${boQua.join(', ')}.` : ''),
    data: {
      maGhep: id,
      soDoiTuong: result.entityCount,
      buoc: result.buoc
    }
  }
}
