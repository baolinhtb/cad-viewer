import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import type {
  AcTpPartSummary,
  AcTpQueryResult,
  AcTpTerm
} from '@mlightcad/cad-template-sdk'
import {
  canEditSemantically,
  describePart,
  locateParts,
  readDrawingDigest
} from '@mlightcad/cad-template-sdk'

import { listRuns } from './runIdentity'
import { tagDrawingFromLayers } from './tagFromLayers'
import { roleLayers } from './templateRegistry'

/**
 * The tools an assistant is given, and the one place they are executed.
 *
 * The schemas are declared here rather than assembled where they are sent, so
 * that what the model is told a tool does and what the tool actually does
 * cannot drift apart — they are the same file.
 *
 * Only the query group is implemented. Modifying and drawing arrive with the
 * stories that own undo grouping and confirmation; declaring their schemas now
 * and leaving them unimplemented would tell the model it can do things this
 * build cannot, which is a worse failure than not offering them.
 */

/** A tool declaration in the shape the Messages API expects. */
export interface AcApToolSchema {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties: false
  }
}

/**
 * What a tool call produced.
 *
 * `ok: false` is an ordinary outcome, not an exception. The assistant has to
 * see a refusal in the same channel as a result, or it will treat a thrown
 * error as a transport problem and retry something it should not.
 */
export interface AcApToolOutcome {
  ok: boolean
  status: AcTpQueryResult['status'] | 'ready' | 'refused'
  message: string
  data?: unknown
}

/** Side words an engineer uses, in the tool's own vocabulary. */
const SIDE_VALUES = ['trai', 'phai'] as const

export const SEMANTIC_TOOLS: AcApToolSchema[] = [
  {
    name: 'mo_ta_ban_ve',
    description:
      'Liệt kê các bộ phận có trong bản vẽ hiện tại kèm thông số đã ghi. ' +
      'Gọi trước khi định vị hay sửa bất cứ thứ gì, để biết bản vẽ có gì. ' +
      'Trả về trạng thái "untagged" nếu bản vẽ không mang nhãn ngữ nghĩa — ' +
      'khi đó không được sửa bất cứ thứ gì.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'tim_bo_phan',
    description:
      'Tìm bộ phận mà người dùng nhắc tới, theo tên gọi tự nhiên. ' +
      'Trả về "ambiguous" khi có nhiều hơn một bộ phận khớp — khi đó phải hỏi ' +
      'lại người dùng, tuyệt đối không tự chọn. Trả về "unknown_term" kèm gợi ý ' +
      'khi không hiểu từ; khi đó hỏi lại chứ không đoán.',
    input_schema: {
      type: 'object',
      properties: {
        cum_tu: {
          type: 'string',
          description:
            'Nguyên văn cách người dùng gọi bộ phận, ví dụ "lan can".'
        },
        ben: {
          type: 'string',
          enum: [...SIDE_VALUES],
          description:
            'Bên trái hoặc phải theo hướng lý trình tăng dần, nếu có.'
        },
        so_thu_tu: {
          type: 'integer',
          minimum: 1,
          description: 'Số thứ tự dọc cầu, nếu người dùng nêu.'
        }
      },
      required: ['cum_tu'],
      additionalProperties: false
    }
  },
  {
    name: 'to_sang_bo_phan',
    description:
      'Tô sáng các bộ phận đã tìm được lên bản vẽ để người dùng nhìn thấy. ' +
      'Dùng cho câu hỏi định vị ("chỉ cho tôi..."). Không thay đổi bản vẽ.',
    input_schema: {
      type: 'object',
      properties: {
        ma_bo_phan: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Danh sách partId lấy từ tim_bo_phan.'
        }
      },
      required: ['ma_bo_phan'],
      additionalProperties: false
    }
  }
]


/**
 * Declared apart from the three query tools because it writes.
 *
 * The others read; this one changes every entity it recognises. Keeping it in
 * the same array would have made "the read-only group" a claim the code no
 * longer supported.
 */
export const TAG_TOOL: AcApToolSchema = {
  name: 'gan_nhan_tu_layer',
  description:
    'Gán nhãn ngữ nghĩa cho bản vẽ chưa có nhãn, dựa trên tên layer đã khai ' +
    'trong nền chuẩn hóa. Dùng khi mo_ta_ban_ve báo "untagged" — sau khi gán ' +
    'thì tim_bo_phan và các lệnh sửa mới làm việc được. Chỉ suy ra vai trò từ ' +
    'layer, không suy ra bên trái/phải hay số thứ tự vì layer không nói điều ' +
    'đó. Đối tượng đã có nhãn thì giữ nguyên. Báo lại những layer chưa khai ' +
    'để người dùng bổ sung vào nền chuẩn hóa, đừng tự đoán.',
  input_schema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  }
}

/** Current drawing, or undefined when nothing is open. */
function currentDb() {
  return AcApDocManager.instance?.curDocument?.database
}

/** Trims a part down to what the model needs to reason and to act. */
/**
 * Shapes a part for the model, leaving out what it has none of.
 *
 * The omissions are load-bearing, not tidiness. A tool result travels into the
 * chat history as a live object, and on the next message that history is
 * validated as a prompt — where `undefined` is not a JSON value and the whole
 * turn dies with "Invalid prompt: The messages must be a ModelMessage[]",
 * naming the message type rather than the field. `JSON.stringify` drops
 * `undefined` silently, so the request on the wire and every log of it look
 * perfectly well-formed while the copy kept in memory is the one that fails.
 *
 * That is exactly how a reported session went: the bridge drew, and "bổ sung
 * thêm chân cầu" was refused, because `ban_mat_cau` has no side and no ordinal
 * and this function said so with `undefined` instead of by saying nothing.
 */
function forModel(part: AcTpPartSummary) {
  return {
    partId: part.partId,
    ten: describePart(part),
    role: part.role,
    ...(part.side !== undefined ? { ben: part.side } : {}),
    ...(part.ordinal !== undefined ? { so_thu_tu: part.ordinal } : {}),
    ...(part.layers[0] !== undefined ? { layer: part.layers[0] } : {}),
    so_doi_tuong: part.entityCount,
    ...(part.params !== undefined ? { thong_so: part.params } : {})
  }
}

/** Lists what the drawing contains. */
export function describeDrawing(): AcApToolOutcome {
  const db = currentDb()
  if (!db) {
    return { ok: false, status: 'refused', message: 'Chưa mở bản vẽ nào.' }
  }

  const digest = readDrawingDigest(db)
  if (digest.status !== 'tagged') {
    const verdict = canEditSemantically(db, digest)
    return {
      ok: false,
      status: 'unsupported',
      message: verdict.reason ?? 'Bản vẽ không mang nhãn ngữ nghĩa.',
      data: {
        status: digest.status,
        untaggedEntityCount: digest.untaggedEntityCount
      }
    }
  }

  // Các lần chạy template, kèm thông số của từng lần. Không có mục này thì trợ
  // lý không biết bản vẽ đã có sẵn cái gì do template dựng, nên "sửa bề rộng
  // mố" chỉ còn cách chạy lại template — và thế là bản vẽ có hai cái mố chồng
  // nhau. Đây là chỗ nó nhìn thấy có thứ để sửa.
  const lanChay = listRuns(db).map(run => ({
    ma: run.id,
    template: run.templateId,
    phienBan: run.version,
    thongSo: run.values,
    soDoiTuong: run.entityCount
  }))

  return {
    ok: true,
    status: 'ready',
    message:
      `Bản vẽ có ${digest.parts.length} bộ phận` +
      (lanChay.length
        ? `, ${lanChay.length} lần chạy template sửa được: ${lanChay
            .map(r => `${r.ma} (${r.template})`)
            .join(', ')}.`
        : '.'),
    data: {
      templateIds: digest.templateIds,
      parts: digest.parts.map(forModel),
      lanChay,
      soDoiTuongKhongNhan: digest.untaggedEntityCount
    }
  }
}


/**
 * Tags an untagged drawing from its layer names.
 *
 * No undo group is opened here. The agent turn already runs inside one — see
 * `withTurnUndoMark` — so the whole tagging pass collapses into the single mark
 * that turn owns, and opening a second one inside it would split what the user
 * thinks of as one action across two presses of Ctrl+Z.
 */
export function tagFromLayers(): AcApToolOutcome {
  const db = currentDb()
  if (!db) {
    return { ok: false, status: 'refused', message: 'Chưa mở bản vẽ nào.' }
  }

  const result = tagDrawingFromLayers(db, roleLayers())

  if (result.tagged === 0) {
    return {
      ok: false,
      status: 'refused',
      message:
        result.daCoNhan > 0
          ? `Bản vẽ đã có nhãn sẵn (${result.daCoNhan} đối tượng), không cần gán lại.`
          : 'Không layer nào trong bản vẽ khớp với nền chuẩn hóa, chưa gán được gì. ' +
            `Các layer đang có: ${result.layerChuaNhanDien
              .slice(0, 12)
              .map(item => item.layer)
              .join(', ')}.`,
      data: {
        layerChuaNhanDien: result.layerChuaNhanDien
      }
    }
  }

  return {
    ok: true,
    status: 'ready',
    message:
      `Đã gán nhãn cho ${result.tagged} đối tượng thuộc ` +
      `${result.theoVaiTro.length} bộ phận.` +
      (result.layerChuaNhanDien.length > 0
        ? ` Còn ${result.layerChuaNhanDien.length} layer chưa khai trong nền chuẩn hóa.`
        : ''),
    data: {
      soDoiTuong: result.tagged,
      daCoNhan: result.daCoNhan,
      boPhan: result.theoVaiTro,
      layerChuaNhanDien: result.layerChuaNhanDien
    }
  }
}

/** Locates the parts a phrase refers to. */
export function findPartsByPhrase(
  input: { cum_tu: string; ben?: 'trai' | 'phai'; so_thu_tu?: number },
  dictionary: readonly AcTpTerm[]
): AcApToolOutcome {
  const db = currentDb()
  if (!db) {
    return { ok: false, status: 'refused', message: 'Chưa mở bản vẽ nào.' }
  }

  const result = locateParts(db, input.cum_tu, dictionary, {
    side: input.ben,
    ordinal: input.so_thu_tu
  })

  return {
    // Only an exact single match counts as success. Ambiguity reaching the
    // model as `ok: true` is how it ends up picking one.
    ok: result.status === 'found',
    status: result.status,
    message: result.message,
    data: {
      parts: result.parts.map(forModel),
      ...(result.suggestions ? { goiY: result.suggestions } : {})
    }
  }
}

/**
 * Selects parts on the canvas.
 *
 * Selection, deliberately, rather than a colour of its own: DESIGN.md gives
 * the accent to "the AI is working" and blue to "this is selected", and a
 * highlight that borrowed the accent would make locating something look like
 * changing it.
 */
export function highlightParts(input: {
  ma_bo_phan: string[]
}): AcApToolOutcome {
  const db = currentDb()
  if (!db) {
    return { ok: false, status: 'refused', message: 'Chưa mở bản vẽ nào.' }
  }

  const digest = readDrawingDigest(db)
  const wanted = new Set(input.ma_bo_phan ?? [])
  const parts = digest.parts.filter(part => wanted.has(part.partId))

  if (parts.length === 0) {
    return {
      ok: false,
      status: 'not_found',
      message: 'Không có bộ phận nào khớp với mã đã cho.'
    }
  }

  const view = AcApDocManager.instance?.curView
  const ids = parts.flatMap(part => part.objectIds)
  if (view && ids.length > 0) {
    view.selectionSet.clear()
    view.selectionSet.add(ids)
  }

  return {
    ok: true,
    status: 'ready',
    message: `Đã tô sáng ${parts.map(describePart).join(', ')}.`,
    data: { partIds: parts.map(part => part.partId), soDoiTuong: ids.length }
  }
}

/** Runs one tool call by name. */
export function runSemanticTool(
  name: string,
  input: Record<string, unknown>,
  // Passed in rather than read from the registry here: this file is the one
  // place the tool contract lives, and reaching for the registry would drag
  // the built-in template — and everything it imports — into every context
  // that only wants to run a query.
  dictionary: readonly AcTpTerm[]
): AcApToolOutcome {
  switch (name) {
    case 'mo_ta_ban_ve':
      return describeDrawing()
    case 'tim_bo_phan':
      return findPartsByPhrase(input as never, dictionary)
    case 'to_sang_bo_phan':
      return highlightParts(input as never)
    case 'gan_nhan_tu_layer':
      return tagFromLayers()
    default:
      // Naming the tool matters: a model that invented a name needs to see
      // which one, or it will invent the same one again.
      return {
        ok: false,
        status: 'refused',
        message: `Không có công cụ tên "${name}".`
      }
  }
}
