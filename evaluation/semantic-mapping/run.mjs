/**
 * Measures whether the assistant maps a Vietnamese sentence onto the right
 * part of a drawing. See README.md for the method and the standing result.
 *
 * A measurement harness, not shipped code. It sends each sentence with the
 * real tool schemas, answers the tools with a fixed drawing, and records the
 * decision — nothing is executed against a real database. Run it against a
 * deployment: `./run.sh https://host you@example.com password`.
 */
import { readFileSync } from 'node:fs'

// The real resolver, esbuild-bundled straight from the SDK source the
// application ships (see run.sh). Reimplementing alias folding in the harness
// would make the harness the thing under test.
import { resolveTerm } from './semanticQuery.mjs'

const [base, email, pass] = process.argv.slice(2)

// Pulled from the shipped source so the harness cannot drift from what the
// application actually sends.
const source = readFileSync(
  new URL(
    '../../packages/cad-template-plugin/src/semanticTools.ts',
    import.meta.url
  ),
  'utf8'
)
const TOOLS = [
  {
    name: 'mo_ta_ban_ve',
    description: describeOf('mo_ta_ban_ve'),
    input_schema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'tim_bo_phan',
    description: describeOf('tim_bo_phan'),
    input_schema: {
      type: 'object',
      properties: {
        cum_tu: { type: 'string', description: 'Nguyên văn cách người dùng gọi bộ phận.' },
        ben: { type: 'string', enum: ['trai', 'phai'] },
        so_thu_tu: { type: 'integer', minimum: 1 }
      },
      required: ['cum_tu'],
      additionalProperties: false
    }
  },
  {
    name: 'to_sang_bo_phan',
    description: describeOf('to_sang_bo_phan'),
    input_schema: {
      type: 'object',
      properties: { ma_bo_phan: { type: 'array', items: { type: 'string' }, minItems: 1 } },
      required: ['ma_bo_phan'],
      additionalProperties: false
    }
  }
]

function describeOf(name) {
  const block = source.split(`name: '${name}'`)[1] ?? ''
  const literal = block.slice(block.indexOf('description:'), block.indexOf('input_schema:'))
  const parts = [...literal.matchAll(/'([^']*)'/g)].map(m => m[1])
  if (parts.length === 0) throw new Error(`no description found for ${name}`)
  return parts.join('')
}

const SYSTEM = [
  'Bạn là trợ lý CAD cho kỹ sư cầu đường Việt Nam.',
  'Dùng nền chuẩn hóa ở trên để ánh xạ cách gọi tự nhiên sang khóa thuật ngữ.',
  'Nếu câu nêu bên (trái/phải) hoặc số thứ tự thì truyền kèm.',
  'Không đoán khi không chắc.'
].join(' ')

/**
 * What `mo_ta_ban_ve` returns for the drawing under test.
 *
 * The real cross-section: slab, wearing course, two kerbs, two rails, three
 * drainage pipes, centreline and a note. The model calls that tool first
 * because its own description tells it to, so the harness has to answer it —
 * measuring the first call alone measured obedience, not mapping.
 */
const DIGEST = {
  ok: true,
  status: 'ready',
  message: 'Bản vẽ có 10 bộ phận.',
  data: {
    templateIds: ['cau_ban_btct'],
    parts: [
      { partId: 'ban_mat_cau', ten: 'Bản mặt cầu', role: 'ban_mat_cau', layer: 'KC-BAN', thong_so: { B: 9000, h: 600 } },
      { partId: 'lop_phu', ten: 'Lớp phủ mặt cầu', role: 'lop_phu', layer: 'KC-LOPPHU', thong_so: { tLopPhu: 70, doDocNgang: 0.02 } },
      { partId: 'go_chan_banh_trai', ten: 'Gờ chắn bánh bên trái', role: 'go_chan_banh', ben: 'trai', layer: 'KC-GOCHAN' },
      { partId: 'go_chan_banh_phai', ten: 'Gờ chắn bánh bên phải', role: 'go_chan_banh', ben: 'phai', layer: 'KC-GOCHAN' },
      { partId: 'lan_can_trai', ten: 'Lan can bên trái', role: 'lan_can', ben: 'trai', layer: 'KC-LANCAN', thong_so: { hLanCan: 1270, mocDo: 'mat_lop_phu' } },
      { partId: 'lan_can_phai', ten: 'Lan can bên phải', role: 'lan_can', ben: 'phai', layer: 'KC-LANCAN', thong_so: { hLanCan: 1270, mocDo: 'mat_lop_phu' } },
      { partId: 'ong_thoat_nuoc_01', ten: 'Ống thoát nước số 1', role: 'ong_thoat_nuoc', so_thu_tu: 1, layer: 'KT-THOATNUOC' },
      { partId: 'ong_thoat_nuoc_02', ten: 'Ống thoát nước số 2', role: 'ong_thoat_nuoc', so_thu_tu: 2, layer: 'KT-THOATNUOC' },
      { partId: 'ong_thoat_nuoc_03', ten: 'Ống thoát nước số 3', role: 'ong_thoat_nuoc', so_thu_tu: 3, layer: 'KT-THOATNUOC' },
      { partId: 'duong_tim', ten: 'Đường tim', role: 'duong_tim', layer: 'TRUC-TIM' },
      { partId: 'ghi_chu', ten: 'Ghi chú', role: 'ghi_chu', layer: 'GC-GHICHU' }
    ],
    soDoiTuongKhongNhan: 0
  }
}

/**
 * The twenty sentences, each with the outcome this build owes it.
 *
 * The expectation comes from what the build can do, not from what it did. This
 * version declares three query tools and nothing that draws, so every
 * "thêm ..." sentence is owed a refusal no matter what the model produces, and
 * a part the cross-section does not contain is owed "không có". Scoring against
 * the capability contract is the only way the number means anything — scoring
 * against the transcript would be writing down the answer first.
 *
 *   locate     the part exists; it must be pinned down (with side, if stated)
 *   ask_back   more than one part matches and the sentence does not choose
 *   refuse     no tool in this build can do it; saying so is the right answer
 *   answer     the digest already holds the answer; reading it out is right
 *   not_found  the drawing genuinely lacks it; saying so is the right answer
 */
const CASES = [
  { sentence: 'đổi bề rộng bản mặt cầu thành 9m', expect: 'locate', role: 'ban_mat_cau' },
  { sentence: 'tăng chiều dày bản lên 60cm', expect: 'locate', role: 'ban_mat_cau' },
  { sentence: 'nâng lan can lên 1.27m', expect: 'ask_back' },
  { sentence: 'đổi lớp phủ thành 7cm', expect: 'locate', role: 'lop_phu' },
  { sentence: 'đổi độ dốc ngang thành 2%', expect: 'locate', role: 'lop_phu' },
  { sentence: 'thêm lan can hai bên', expect: 'refuse' },
  { sentence: 'thêm ống thoát nước hai bên, cách nhau 4m', expect: 'refuse' },
  { sentence: 'thêm bản quá độ hai đầu dài 4m', expect: 'refuse' },
  { sentence: 'thêm khe co giãn ở hai đầu nhịp', expect: 'refuse' },
  { sentence: 'thêm cột kích thước cho mặt cắt ngang', expect: 'refuse' },
  { sentence: 'xóa lan can bên phải', expect: 'locate', role: 'lan_can', side: 'phai' },
  { sentence: 'bỏ ống thoát nước ở giữa nhịp', expect: 'locate', role: 'ong_thoat_nuoc' },
  { sentence: 'xóa bản quá độ đầu mố A', expect: 'not_found' },
  { sentence: 'bỏ cột kích thước bị trùng', expect: 'not_found' },
  { sentence: 'xóa ghi chú ở góc dưới bên trái', expect: 'locate', role: 'ghi_chu' },
  { sentence: 'bản mặt cầu dày bao nhiêu?', expect: 'answer', contains: ['600'] },
  { sentence: 'lan can cao bao nhiêu?', expect: 'answer', contains: ['1270', '1.27', '1,27'] },
  { sentence: 'khoảng cách ống thoát nước là bao nhiêu?', expect: 'answer', contains: ['3'] },
  { sentence: 'chỉ cho tôi gối cầu ở mố A', expect: 'not_found' },
  { sentence: 'trên bản vẽ có bao nhiêu ống thoát nước?', expect: 'answer', contains: ['3'] }
]

/**
 * What `tim_bo_phan` would have returned, so the closing sentence is written
 * against a real outcome rather than an invented one.
 *
 * Derived from the digest the same way the shipped tool derives it from the
 * drawing: a role the digest lacks is `not_found`, more than one match is
 * `ambiguous`, exactly one is `found`.
 */
function localeLocate(testCase, phrase, input) {
  const role = resolveTerm(phrase, DICTIONARY).role
  const matched = DIGEST.data.parts.filter(
    part =>
      part.role === role &&
      (!input?.ben || part.ben === input.ben) &&
      (!input?.so_thu_tu || part.so_thu_tu === input.so_thu_tu)
  )
  if (matched.length === 0) {
    return { ok: false, status: 'not_found', message: `Bản vẽ này không có ${phrase}.` }
  }
  if (matched.length > 1) {
    return {
      ok: false,
      status: 'ambiguous',
      message: `Có ${matched.length} bộ phận khớp: ${matched.map(p => p.ten).join(', ')}. Bạn muốn cái nào?`,
      data: { parts: matched }
    }
  }
  return { ok: true, status: 'found', message: `Đã xác định ${matched[0].ten}.`, data: { parts: matched } }
}

/** partId → role, for deciding whether a highlight touched the right thing. */
const ROLE_OF_PART = new Map(DIGEST.data.parts.map(part => [part.partId, part.role]))

const jar = []
async function login() {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: pass })
  })
  jar.push(...(r.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]))
}

await login()

/** The company dictionary, as the server serves it to the assistant. */
const DICTIONARY = await fetch(`${base}/api/standards/terms`, {
  headers: { cookie: jar.join('; ') }
})
  .then(r => r.json())
  .then(body => (body.terms ?? body).map(t => ({
    role: t.role,
    label: t.label,
    aliases: Array.isArray(t.aliases) ? t.aliases : JSON.parse(t.aliases ?? '[]')
  })))
if (DICTIONARY.length === 0) throw new Error('dictionary came back empty')

let hit = 0
let wrongConfident = 0
const rows = []

async function send(messages) {
  const response = await fetch(`${base}/api/ai/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: jar.join('; ') },
    body: JSON.stringify({ max_tokens: 4000, system: SYSTEM, tools: TOOLS, messages })
  })
  return response.json()
}

for (const testCase of CASES) {
  const { sentence, expect: want } = testCase
  const messages = [{ role: 'user', content: sentence }]
  let body = await send(messages)
  let call = (body.content ?? []).find(b => b.type === 'tool_use')

  // Answer the describe call the model makes first, then look at what it does
  // with the answer. Measuring the first call alone measured obedience to the
  // tool description, not mapping.
  for (let round = 0; round < 2 && call?.name === 'mo_ta_ban_ve'; round++) {
    messages.push({ role: 'assistant', content: body.content })
    messages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(DIGEST) }]
    })
    body = await send(messages)
    call = (body.content ?? []).find(b => b.type === 'tool_use')
  }

  const phrase = call?.input?.cum_tu ?? ''
  const highlighted = call?.input?.ma_bo_phan ?? []

  // Which role the run actually landed on, by the same resolver the app uses.
  const locatedRole =
    call?.name === 'tim_bo_phan'
      ? resolveTerm(phrase, DICTIONARY).role
      : call?.name === 'to_sang_bo_phan'
        ? ROLE_OF_PART.get(highlighted[0])
        : undefined

  // The tool call above is the decision being measured; the sentence that
  // follows it is how an engineer would learn what happened. A turn that ends
  // at `tool_use` has not said its piece yet, so finish it — stopping there
  // scored two runs as silent that were mid-sentence.
  let said = (body.content ?? []).find(b => b.type === 'text')?.text?.trim() ?? ''
  if (call && call.name !== 'mo_ta_ban_ve') {
    messages.push({ role: 'assistant', content: body.content })
    messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: call.id,
          content: JSON.stringify(
            call.name === 'to_sang_bo_phan'
              ? { ok: true, status: 'ready', message: `Đã tô sáng ${highlighted.join(', ')}.` }
              : localeLocate(testCase, phrase, call.input)
          )
        }
      ]
    })
    const closing = await send(messages)
    const text = (closing.content ?? []).find(b => b.type === 'text')?.text?.trim()
    if (text) said = text
  }

  const lower = said.toLowerCase()
  const refused =
    /không có (công cụ|chức năng)|không thể|chưa thể|chưa có (công cụ|chức năng)|không hỗ trợ|không (thêm|vẽ|tạo) được/.test(
      lower
    )
  const askedBack = said.includes('?') && /bên nào|cái nào|muốn|làm rõ|xác nhận/.test(lower)

  let ok = false
  switch (want) {
    case 'locate':
      // The side, when the sentence names one, is part of being right: locating
      // the left rail for "xóa lan can bên phải" is the silent wrong edit.
      ok =
        locatedRole === testCase.role &&
        (!testCase.side ||
          call?.input?.ben === testCase.side ||
          highlighted.every(id => id.endsWith(testCase.side)))
      break
    case 'ask_back':
      // Locating without choosing is fine too — the tool returns `ambiguous`
      // and the asking happens on the next turn.
      ok = askedBack || (call?.name === 'tim_bo_phan' && !call.input?.ben)
      break
    case 'refuse':
      // Showing what is already there instead of refusing outright counts:
      // "bản vẽ đã có lan can hai bên" answers the request better than "tôi
      // không thêm được", and highlighting changes nothing.
      ok = refused || (call?.name === 'to_sang_bo_phan' && said.length > 0)
      break
    case 'answer':
      ok = !call && testCase.contains.some(text => said.includes(text))
      break
    case 'not_found':
      // Probing with the phrase is legitimate — the tool answers `not_found`.
      // Highlighting something else is not.
      ok = call?.name === 'tim_bo_phan' || (!call && /không có|không tìm|chưa có/.test(lower))
      break
  }

  // The second half of the AC: acting on a part the sentence did not name.
  //
  // Nothing in this build edits, so the strict reading of "0% sửa sai âm thầm"
  // is satisfied trivially and says nothing. What is worth counting is the
  // precursor — pointing at the wrong part — because that is the judgement an
  // edit tool would inherit. A highlight of a part the drawing genuinely lacks
  // cannot happen; a highlight of the wrong role can.
  const wrongAct = Boolean(
    call?.name === 'to_sang_bo_phan' &&
      testCase.role &&
      highlighted.some(id => ROLE_OF_PART.get(id) !== testCase.role)
  )

  // Silence is not an outcome. Three rows came back empty under a 900-token
  // cap, which looked like a model failure and was a harness one.
  const truncated = body.stop_reason === 'max_tokens'

  if (ok) hit++
  if (wrongAct) wrongConfident++

  rows.push({
    sentence,
    want,
    tool: call?.name ?? '(none)',
    phrase,
    ben: call?.input?.ben ?? null,
    highlighted: highlighted.join(' '),
    locatedRole: locatedRole ?? null,
    ok,
    wrongAct,
    stop: body.stop_reason ?? null,
    truncated,
    said: said.slice(0, 140)
  })
}

console.log(JSON.stringify(rows, null, 1))
console.log(`\nĐúng: ${hit}/${CASES.length} = ${Math.round((hit / CASES.length) * 100)}%`)
console.log(`Chỉ sai bộ phận: ${wrongConfident}`)
const cut = rows.filter(r => r.truncated).length
console.log(`Bị cắt vì hết token: ${cut}${cut ? '  ← số đo không dùng được' : ''}`)
