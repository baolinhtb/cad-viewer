import {
  dictionary,
  runSemanticTool,
  runTemplateTool,
  SEMANTIC_TOOLS,
  TEMPLATE_TOOLS,
  templateToolDescription
} from '@mlightcad/cad-template-plugin'
import { tool } from 'ai'
// `zod/v4`, not `zod`. The AI SDK's `tool()` is typed against zod v4 core, and
// handing it a v3-classic schema makes the checker relate the two model
// hierarchies for every schema in this file: `tsc --noEmit` reached three
// million types and died at 4 GB of heap, on an empty `z.object({})`. The v4
// entry point is the same API and the same package — zod 3.25 ships both.
import { z } from 'zod/v4'

import { cadActionExecutor } from './CadActionExecutor'
import { lookupTcvn } from './tcvnLookup'

/**
 * The description the model reads for a semantic tool, taken from the tool
 * itself.
 *
 * Restating it here would let the two drift, and the drift is invisible: the
 * model would be told one rule ("ambiguous means ask") while the code enforced
 * another. Throwing on a missing name is deliberate — a tool silently
 * described as `undefined` is worse than a build that stops.
 */
function semanticDescription(name: string): string {
  const found = SEMANTIC_TOOLS.find(t => t.name === name)
  if (!found) throw new Error(`semantic tool "${name}" is not declared`)
  return found.description
}

/**
 * Same rule for the template group, whose declarations live beside it.
 *
 * The catalogue is appended by the plugin rather than read from the system
 * prompt: that section is built on the server from the uploaded-library table
 * and does not know about templates compiled into this build. On a deployment
 * with an empty library the model was told there were none and went back to
 * drawing stroke by stroke, with the tool sitting right there unused.
 */
function templateDescription(name: string): string {
  const found = TEMPLATE_TOOLS.find(t => t.name === name)
  if (!found) throw new Error(`template tool "${name}" is not declared`)
  return name === 'chay_template' ? templateToolDescription() : found.description
}

/** Zod schema for 2D WCS points in agent tool arguments. */
const pointSchema = z.object({
  x: z.number(),
  y: z.number()
})

/**
 * Creates the tool set exposed to the CAD agent LLM.
 *
 * Each tool delegates to {@link cadActionExecutor} and returns a {@link ToolResult}.
 *
 * @returns AI SDK tool definitions keyed by tool name.
 */
/**
 * Makes a tool result carry only what JSON can carry.
 *
 * A tool result is kept twice: serialised into the request, and live in the
 * chat history. `JSON.stringify` drops `undefined` and writes `NaN` and
 * `Infinity` as `null`, so the wire is always well-formed — but the object left
 * in the history is not, and on the next message that history is validated as a
 * prompt. It fails with "Invalid prompt: The messages must be a
 * ModelMessage[]", which names the message type rather than the field, and the
 * conversation cannot continue. The first message worked; every correction
 * after it was refused.
 *
 * This has now happened twice from different fields — `NaN` extents on an empty
 * drawing, then `undefined` for a part with no side or ordinal — so the guard
 * belongs at the boundary rather than at each site. Round-tripping through JSON
 * is deliberate: it produces exactly what the request already sends, so the
 * history and the wire agree by construction instead of by vigilance.
 */
function toJsonSafe<T>(value: T, toolName: string): T {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as T
  } catch (error) {
    // Circular or otherwise unserialisable. Returning it unchanged is no worse
    // than before this guard existed, and the name is what the next
    // investigation will need.
    console.error(
      `[cad-agent] tool "${toolName}" returned a result JSON cannot carry`,
      error
    )
    return value
  }
}

/**
 * Applies {@link toJsonSafe} to every tool's result.
 *
 * Wraps in place so the inferred tool-map type — which `CadTools` and the
 * agent's own typing depend on — is preserved exactly.
 */
function withJsonSafeResults<T extends Record<string, unknown>>(tools: T): T {
  for (const [name, entry] of Object.entries(tools)) {
    const holder = entry as { execute?: (...args: unknown[]) => unknown }
    const original = holder.execute
    if (typeof original !== 'function') continue
    holder.execute = async (...args: unknown[]) =>
      toJsonSafe(await original(...args), name)
  }
  return tools
}

export function createCadTools() {
  return withJsonSafeResults({
    // The semantic group comes first because it is what the model should reach
    // for first: the geometry tools below act on coordinates and object ids,
    // and arriving at either without having located a part by name is how an
    // assistant edits the wrong railing.
    mo_ta_ban_ve: tool({
      description: semanticDescription('mo_ta_ban_ve'),
      inputSchema: z.object({}),
      execute: async () => runSemanticTool('mo_ta_ban_ve', {}, dictionary())
    }),
    tim_bo_phan: tool({
      description: semanticDescription('tim_bo_phan'),
      inputSchema: z.object({
        cum_tu: z
          .string()
          .min(1)
          .describe('Nguyên văn cách người dùng gọi bộ phận, ví dụ "lan can".'),
        ben: z
          .enum(['trai', 'phai'])
          .optional()
          .describe('Bên trái hoặc phải theo hướng lý trình tăng dần, nếu có.'),
        so_thu_tu: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Số thứ tự dọc cầu, nếu người dùng nêu.')
      }),
      execute: async input =>
        runSemanticTool('tim_bo_phan', input, dictionary())
    }),
    to_sang_bo_phan: tool({
      description: semanticDescription('to_sang_bo_phan'),
      inputSchema: z.object({
        ma_bo_phan: z
          .array(z.string().min(1))
          .min(1)
          .describe('Danh sách partId lấy từ tim_bo_phan.')
      }),
      execute: async input =>
        runSemanticTool('to_sang_bo_phan', input, dictionary())
    }),
    // Templates before strokes. A part named and parameterised is one call
    // whose numbers are checked against declared ranges; the same part drawn
    // stroke by stroke is seventy calls, and every regulated dimension in it
    // rests on the model having looked the standard up and read it right.
    chay_template: tool({
      description: templateDescription('chay_template'),
      inputSchema: z.object({
        ma_template: z
          .string()
          .min(1)
          .describe('Mã template, ví dụ "cau_ban_btct".'),
        thong_so: z
          .record(z.string(), z.union([z.number(), z.string(), z.boolean()]))
          .optional()
          .describe(
            'Giá trị tham số theo đúng khóa và đơn vị đã khai trong danh mục. Bỏ trống để dùng mặc định.'
          )
      }),
      execute: async input =>
        runTemplateTool('chay_template', {
          ma_template: input.ma_template,
          thong_so: input.thong_so ?? {}
        })
    }),
    // Reference before geometry: nearly every dimension in a bridge or road
    // drawing is already decided by a standard, and a number the model
    // remembers is indistinguishable, on screen, from one it read.
    tra_cuu_tieu_chuan: tool({
      description:
        'Tra cứu điều khoản trong bộ tiêu chuẩn TCVN về cầu đường (TCVN 11823 các phần, TCVN 4054, TCVN 13592) đã cài trên máy chủ. ' +
        'Gọi trước khi chọn bất kỳ kích thước nào mà tiêu chuẩn quy định: bề rộng làn, chiều cao lan can, chiều dày bản mặt cầu, tĩnh không, tải trọng thiết kế. ' +
        'Trả về nguyên văn điều khoản kèm số hiệu tiêu chuẩn để trích dẫn. ' +
        'Hỏi bằng tiếng Việt có dấu, nêu rõ đối tượng và điều kiện, ví dụ "chiều cao lan can cấp thử nghiệm TL-4".',
      inputSchema: z.object({
        cau_hoi: z
          .string()
          .min(1)
          .describe(
            'Câu hỏi tra cứu bằng tiếng Việt có dấu, càng cụ thể càng tốt.'
          ),
        so_ket_qua: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe('Số điều khoản muốn lấy về, mặc định 4.')
      }),
      execute: async input => lookupTcvn(input.cau_hoi, input.so_ket_qua)
    }),
    get_drawing_context: tool({
      description:
        'Đọc bản vẽ hiện tại: đơn vị, layer, số đối tượng trên từng layer, phạm vi, ' +
        'và danh sách bộ phận đã mang nhãn ngữ nghĩa (kèm thông số đã ghi). ' +
        'Gọi ở đầu mỗi lượt: đây là thứ cho biết bản vẽ đang có gì, thay vì phải nhớ lại từ hội thoại.',
      inputSchema: z.object({}),
      execute: async () => cadActionExecutor.getDrawingContext()
    }),
    // Declared before drawing, not after: a tag written onto geometry is what
    // makes the geometry addressable later. Without it the next request about
    // "lan can" has nothing to match, and the assistant is back to guessing
    // from coordinates.
    dat_bo_phan_hien_tai: tool({
      description:
        'Khai báo bộ phận sắp vẽ. Mọi đối tượng vẽ sau lệnh này sẽ mang nhãn đó cho tới khi khai báo lại — giống như layer hiện hành. ' +
        'Bắt buộc gọi trước khi vẽ bất kỳ bộ phận nào có tên gọi trong nghề (bản mặt cầu, lan can, dầm, gờ chắn, ống thoát nước...). ' +
        'Nhờ nhãn này mà lượt sau người dùng nói "nâng lan can lên" thì tìm được đúng đối tượng, kể cả sau khi tải lại bản vẽ. ' +
        'Gọi không kèm tham số để quay lại vẽ hình học không nhãn (đường gióng, nháp).',
      inputSchema: z.object({
        bo_phan: z
          .string()
          .regex(/^[a-z0-9_]+$/)
          .optional()
          .describe(
            'Khóa ngữ nghĩa không dấu theo danh mục công ty, ví dụ "lan_can", "ban_mat_cau", "dam_chu". Bỏ trống để thôi gắn nhãn.'
          ),
        ben: z
          .enum(['trai', 'phai'])
          .optional()
          .describe(
            'Bên trái/phải theo hướng lý trình tăng dần, nếu bộ phận có hai bên.'
          ),
        so_thu_tu: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Số thứ tự khi có nhiều cái cùng loại, ví dụ dầm thứ 3.'),
        thong_so: z
          .record(z.string(), z.union([z.number(), z.string(), z.boolean()]))
          .optional()
          .describe(
            'Các số định nghĩa bộ phận, ví dụ {"chieu_cao": 810, "be_rong": 250}. Ghi vào bản vẽ để lượt sau đọc lại được thay vì đo lại.'
          )
      }),
      execute: async input =>
        cadActionExecutor.setCurrentPart(
          input.bo_phan
            ? {
                role: input.bo_phan,
                side: input.ben,
                ordinal: input.so_thu_tu,
                params: input.thong_so
              }
            : undefined
        )
    }),
    draw_line: tool({
      description: 'Draw a straight line segment in model space',
      inputSchema: z.object({
        start: pointSchema,
        end: pointSchema,
        layer: z.string().optional()
      }),
      execute: async input => cadActionExecutor.drawLine(input)
    }),
    draw_circle: tool({
      description: 'Draw a circle by center and radius',
      inputSchema: z.object({
        center: pointSchema,
        radius: z.number().positive(),
        layer: z.string().optional()
      }),
      execute: async input => cadActionExecutor.drawCircle(input)
    }),
    draw_arc: tool({
      description:
        'Draw an arc by center, radius, and start/end angles in degrees',
      inputSchema: z.object({
        center: pointSchema,
        radius: z.number().positive(),
        startAngleDeg: z.number(),
        endAngleDeg: z.number(),
        layer: z.string().optional()
      }),
      execute: async input => cadActionExecutor.drawArc(input)
    }),
    draw_rectangle: tool({
      description: 'Draw a rectangle from two opposite corners',
      inputSchema: z.object({
        corner1: pointSchema,
        corner2: pointSchema,
        layer: z.string().optional()
      }),
      execute: async input => cadActionExecutor.drawRectangle(input)
    }),
    draw_polyline: tool({
      description: 'Draw a polyline through a list of points',
      inputSchema: z.object({
        points: z.array(pointSchema).min(2),
        closed: z.boolean().optional(),
        layer: z.string().optional()
      }),
      execute: async input => cadActionExecutor.drawPolyline(input)
    }),
    draw_ellipse: tool({
      description:
        'Draw an ellipse or elliptical arc by center, major/minor radii, optional rotation (degrees), and optional start/end angles (degrees)',
      inputSchema: z.object({
        center: pointSchema,
        majorRadius: z.number().positive(),
        minorRadius: z.number().positive(),
        rotationDeg: z.number().optional(),
        startAngleDeg: z.number().optional(),
        endAngleDeg: z.number().optional(),
        layer: z.string().optional()
      }),
      execute: async input => cadActionExecutor.drawEllipse(input)
    }),
    draw_hatch: tool({
      description:
        'Draw a hatch fill inside a closed polygon boundary. Use patternName "SOLID" for solid fill, or a predefined pattern name such as ANSI31',
      inputSchema: z.object({
        boundary: z.array(pointSchema).min(3),
        patternName: z.string().optional(),
        patternScale: z.number().positive().optional(),
        patternAngleDeg: z.number().optional(),
        layer: z.string().optional()
      }),
      execute: async input => cadActionExecutor.drawHatch(input)
    }),
    draw_point: tool({
      description: 'Draw a point entity at a position',
      inputSchema: z.object({
        position: pointSchema,
        layer: z.string().optional()
      }),
      execute: async input => cadActionExecutor.drawPoint(input)
    }),
    draw_ray: tool({
      description:
        'Draw a ray (half-line) from a start point through another point',
      inputSchema: z.object({
        start: pointSchema,
        through: pointSchema,
        layer: z.string().optional()
      }),
      execute: async input => cadActionExecutor.drawRay(input)
    }),
    draw_xline: tool({
      description:
        'Draw a construction line (xline) through two points, extending infinitely both ways',
      inputSchema: z.object({
        start: pointSchema,
        through: pointSchema,
        layer: z.string().optional()
      }),
      execute: async input => cadActionExecutor.drawXline(input)
    }),
    draw_spline: tool({
      description: 'Draw a smooth spline curve through a list of fit points',
      inputSchema: z.object({
        points: z.array(pointSchema).min(2),
        closed: z.boolean().optional(),
        layer: z.string().optional()
      }),
      execute: async input => cadActionExecutor.drawSpline(input)
    }),
    draw_text: tool({
      description: 'Draw single-line MTEXT at a position',
      inputSchema: z.object({
        position: pointSchema,
        text: z.string().min(1),
        height: z.number().positive().optional(),
        layer: z.string().optional()
      }),
      execute: async input => cadActionExecutor.drawText(input)
    }),
    draw_dimension: tool({
      description:
        'Draw a linear dimension between two points. `huong` is the axis being ' +
        'measured, not the direction between the points: use "ngang" for a ' +
        'horizontal chain, "dung" for a vertical one, and "nghieng" only when ' +
        'the measurement is genuinely skew. `offset` is how far the dimension ' +
        'line sits from the measured points, in drawing units; negative puts it ' +
        'on the other side. Leave `text` unset so the real distance is measured ' +
        'and formatted — an engineering drawing without dimensions is not a ' +
        'drawing that can be issued, so dimension what you draw.',
      inputSchema: z.object({
        start: pointSchema,
        end: pointSchema,
        offset: z.number(),
        huong: z.enum(['ngang', 'dung', 'nghieng']).optional(),
        text: z.string().optional(),
        layer: z.string().optional()
      }),
      execute: async input => cadActionExecutor.drawDimension(input)
    }),
    list_blocks: tool({
      description:
        "List the blocks this drawing defines and the attribute tags each one " +
        "expects. Call it before insert_block: a block can only be placed by a " +
        "name the drawing already has, and those names belong to the office " +
        "that drew it. Anonymous blocks (names starting with '*') are omitted " +
        'because they are dimension and layout internals, not things to insert.',
      inputSchema: z.object({}),
      execute: async () => cadActionExecutor.listBlocks()
    }),
    insert_block: tool({
      description:
        'Insert a block the drawing already defines, at a point. Supply ' +
        '`attributes` as tag → value for the tags list_blocks reported; a tag ' +
        'left out stays empty rather than being filled with a blank. Rotation ' +
        'is in degrees. Use this for repeated standard details — level ' +
        'callouts, section marks, symbols — instead of redrawing them stroke ' +
        'by stroke, which loses the office\'s own symbol and costs far more.',
      inputSchema: z.object({
        blockName: z.string().min(1),
        position: pointSchema,
        rotation: z.number().optional(),
        scale: z.number().positive().optional(),
        layer: z.string().optional(),
        attributes: z.record(z.string(), z.string()).optional()
      }),
      execute: async input => cadActionExecutor.insertBlock(input)
    }),
    set_current_layer: tool({
      description: 'Set the current drawing layer (CLAYER)',
      inputSchema: z.object({
        layerName: z.string().min(1)
      }),
      execute: async input => cadActionExecutor.setCurrentLayer(input.layerName)
    }),
    create_layer: tool({
      description: 'Create a new layer if it does not exist',
      inputSchema: z.object({
        layerName: z.string().min(1)
      }),
      execute: async input => cadActionExecutor.createLayer(input.layerName)
    }),
    delete_entities: tool({
      description:
        'Delete one or more entities by object id. Use entityIds returned from previous drawing tool calls to remove incorrect geometry before redrawing.',
      inputSchema: z.object({
        entityIds: z.array(z.string().min(1)).min(1)
      }),
      execute: async input => cadActionExecutor.deleteEntities(input)
    }),
    zoom_extents: tool({
      description: 'Zoom the view to show the full drawing extents',
      inputSchema: z.object({}),
      execute: async () => cadActionExecutor.zoomExtents()
    })
  })
}

/** Inferred tool map type returned by {@link createCadTools}. */
export type CadTools = ReturnType<typeof createCadTools>
