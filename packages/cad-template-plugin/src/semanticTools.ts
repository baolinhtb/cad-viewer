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

/** Current drawing, or undefined when nothing is open. */
function currentDb() {
  return AcApDocManager.instance?.curDocument?.database
}

/** Trims a part down to what the model needs to reason and to act. */
function forModel(part: AcTpPartSummary) {
  return {
    partId: part.partId,
    ten: describePart(part),
    role: part.role,
    ben: part.side,
    so_thu_tu: part.ordinal,
    layer: part.layers[0],
    so_doi_tuong: part.entityCount,
    thong_so: part.params
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

  return {
    ok: true,
    status: 'ready',
    message: `Bản vẽ có ${digest.parts.length} bộ phận.`,
    data: {
      templateIds: digest.templateIds,
      parts: digest.parts.map(forModel),
      soDoiTuongKhongNhan: digest.untaggedEntityCount
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
  dictionary: readonly AcTpTerm[]
): AcApToolOutcome {
  switch (name) {
    case 'mo_ta_ban_ve':
      return describeDrawing()
    case 'tim_bo_phan':
      return findPartsByPhrase(input as never, dictionary)
    case 'to_sang_bo_phan':
      return highlightParts(input as never)
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
