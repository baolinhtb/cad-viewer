// The prompt only needs the script API summary; the real package pulls in
// the whole viewer.
jest.mock('@mlightcad/cad-agent-core', () => ({
  CAD_SCRIPT_API_SUMMARY: ''
}))

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildCadAgentSystemPrompt } from '../src/agent/systemPrompt'

const prompt = buildCadAgentSystemPrompt('simple')
const skill = readFileSync(
  join(__dirname, '../../../assets/skills/mo-cau/SKILL.md'),
  'utf8'
)

describe('abutment (mố) guidance in the system prompt and the mo-cau skill', () => {
  // UI acceptance P1/M3 (X1): "tường cánh dày 600" on an empty drawing was
  // drawn with mo_mat_chinh bTai = 600 — right, but the answer must say it
  // is that template and not the dossier. Since P2/M1 the dossier takes
  // tCanh 600, so the skill's example of a value it refuses is phuLot.
  test('a template other than the 0.3.0 dossier is named, with its mapping', () => {
    expect(prompt).toContain(
      'name the template and the parameters you mapped the request to'
    )
    expect(prompt).toContain('bTai = 600')
    expect(skill).toContain('phải nêu tên template và tham số đã ánh xạ')
    expect(skill).toContain('`bTai = 600`')
    expect(skill).toContain('`phuLot = 200` vẫn bị')
    expect(skill).not.toContain('`tCanh = 600` vẫn bị')
  })

  // Plan P0–P1 2.3, decision 5: raising the seat is asked, never guessed.
  test('abutment seat vocabulary, distinct from the pier, and the (a)/(b) question', () => {
    for (const word of [
      '«xà mũ mố», «bệ kê gối» and «đỉnh thân» mean the bearing seat',
      'seat = caoDoDayBe + hBe + hThan',
      '«đỉnh tường đỉnh» and «đỉnh mố» mean seat + hDau',
      '«xà mũ» (`tru-cau`)',
      'always ask exactly one question with two choices and never pick one yourself',
      '(a) nâng cả mố — cao độ đáy bệ tăng Δ',
      '(b) giữ móng, kéo dài thân — chiều cao thân tăng Δ'
    ])
      expect(prompt).toContain(word)
    // The pier flow is untouched.
    expect(prompt).toContain(
      'Bridge piers (trụ cầu, xà mũ, thân trụ, bệ trụ, trụ T1…) are covered by the guide'
    )
  })

  // UI acceptance P1/M5, S7: after sua_ho_so_mo refused a hand-edited
  // elevation, the agent shifted 23 elevations by tx.setText instead.
  test('a generated dossier is not worked around with setText after a refusal', () => {
    for (const word of [
      'is changed only through those dossier tools',
      'stop: name the places its message lists and ask the user',
      'Never use tx.setText, execute_cad_script or any text-editing tool to shift',
      'Imported DWG/DXF drawings (not generated dossiers) are still edited directly',
      'CHỈ bằng sua_ho_so_mo; nếu bị từ chối vì sửa tay thì dừng'
    ])
      expect(prompt).toContain(word)
    for (const word of [
      'Bị từ chối vì sửa tay: dừng và hỏi, không lách.',
      '**Cấm** dùng `tx.setText`',
      'Bản vẽ DWG/DXF nhập vào (không phải hồ sơ do công cụ dựng) vẫn sửa trực tiếp'
    ])
      expect(skill).toContain(word)
    // The skill no longer sends a refused dossier edit to the script tool.
    expect(skill).not.toContain(
      'khi đó sửa trực tiếp bằng `execute_cad_script`'
    )
  })

  // UI acceptance P1/M5b, S4/S7: the agent put cells back by script, lost
  // their font, and needed two turns. One confirmation, one call, the tool
  // rewrites them.
  test('putting hand edits back: one confirmation, one call, done by the tool', () => {
    for (const word of [
      'ask the user once',
      'make ONE sua_ho_so_mo call with the same parameters and dua_ve_so_bo_sinh: true',
      'never rewrite them yourself with a script first',
      'gọi lại sua_ho_so_mo một lần với dua_ve_so_bo_sinh: true'
    ])
      expect(prompt).toContain(word)
    for (const word of [
      'hỏi người dùng **một lần**',
      '`dua_ve_so_bo_sinh: true` — công cụ tự viết lại các chỗ đó',
      'để tự đưa về thiết kế gốc'
    ])
      expect(skill).toContain(word)
  })

  // QA M5b S2: under (b) FG/FE rose by 0,300 too — right, and to be said.
  test('(b) says FG and FE rise with the seat', () => {
    expect(prompt).toContain('FG and FE (road / finished level) included')
    expect(prompt).toContain('«FG, FE cũng tăng Δ; đáy bệ, đỉnh bệ không đổi»')
    expect(skill).toContain('**kể cả FG và FE**')
  })

  // Generator 0.3.1: an older dossier the generator has moved on from is
  // unlocked by the user, in one call.
  test('the unlock path for an older dossier', () => {
    expect(prompt).toContain(
      'generator (0.3.0) whose drawing no longer matches generator 0.3.1'
    )
    expect(prompt).toContain('mo_khoa_031: true')
    expect(prompt).toContain('never replace it quietly with tao_ho_so_mo')
    expect(skill).toContain('**Hồ sơ phiên bản cũ (0.3.0) — mở khóa.**')
    expect(skill).toContain('`mo_khoa_031: true`')
  })

  // QA 0.3.1b: "Tôi sửa hồ sơ r1 … hThan = 5017 mm." before a tool that
  // then refused, and parameter keys in the prose (V2, V4–V7).
  test('intention before a tool, Vietnamese names to the user', () => {
    for (const word of [
      'Say what you will do before a tool, what was done only after it.',
      'Text written before a tool call is an intention',
      'never word it as done',
      'when it refused, say that nothing was changed',
      'Speak Vietnamese names, not parameter keys, and never name a tool or a flag.',
      '«cao độ đáy bệ», «chiều cao thân»'
    ])
      expect(prompt).toContain(word)
    // The (a)/(b) question itself is worded with the names.
    expect(prompt).not.toContain('(a) nâng cả mố — caoDoDayBe += Δ')
  })

  // QA M6: "(bMatDuong)", "(hThan 4717 → 5017 mm)", "tham số hThan",
  // "(aCocNgang = bBe − 2D)", "Tôi sẽ gọi sua_ho_so_mo…", "mo_khoa_031: true"
  // in what the user read. Keys and tool names are for the calls only.
  test('no key, tool or flag name in what the user reads', () => {
    for (const word of [
      'No parameter key in what the user reads — not alone, not in brackets, not as «tham số hThan», not in a formula',
      '«tim cọc ngang = bề rộng bệ − 2 × đường kính cọc», not aCocNgang = bBe − 2D',
      'No tool or flag name either — not «Tôi sẽ gọi sua_ho_so_mo», not cap_nhat_btkl, not mo_khoa_031: true',
      'are for making the calls only; never repeat them to the user',
      '«Tôi sẽ mở khóa hồ sơ và kéo dài thân…»'
    ])
      expect(prompt).toContain(word)
    // The old permission is gone.
    expect(prompt).not.toContain('may follow in brackets')
    expect(prompt).not.toContain('parameter caoDoDayBe')
    expect(prompt).not.toContain('«Đang gọi công cụ để…»')
    for (const word of [
      '**Không** nói khóa nội bộ',
      'kể cả trong ngoặc',
      '**Không** nói tên',
      'chỉ để gọi công'
    ])
      expect(skill).toContain(word)
    expect(skill).not.toContain('chỉ\n  để trong ngoặc khi cần đối chiếu')
    // The calls are still taught with their keys and flags.
    for (const word of [
      'in the call: caoDoDayBe',
      'in the call: hThan',
      'dua_ve_so_bo_sinh: true',
      'mo_khoa_031: true'
    ])
      expect(prompt).toContain(word)
  })

  // P2-M1b (finding B): a refused change got two proposals and «Bạn muốn
  // chọn hướng nào?» though the user had asked for none.
  test('a refusal: one short hint at most, no closing question of options', () => {
    // P2-M3 (QA P2-M2 step 3): two hints and «…chọn hướng nào thì tôi sẽ
    // sửa…» still came; now one sentence, no question.
    expect(prompt).toContain(
      'after a refusal add at most one short sentence of hint — the allowed range and at most one other way — and no question at all'
    )
    expect(prompt).toContain('chọn hướng nào thì tôi sẽ sửa…')
    expect(skill).toContain('được thêm **đúng một câu** gợi ý ngắn')
    expect(skill).toContain('**không hỏi gì**')
    expect(skill).toContain('(«Bạn muốn chọn hướng nào?», «chọn hướng nào')
  })

  test('the take-off: the wing is line 1.4, line 1.7 is the rail', () => {
    expect(skill).toContain('bê tông **tường cánh** là mục 1.4')
    expect(skill).toContain('mục 1.7 là **lan can trên tường cánh**')
    expect(skill).toContain('không gọi 1.7 là tường cánh')
  })

  // P2-M3 (QA P2-M2 step 6): after «lan can 900 mm» the agent quoted a
  // «tường phòng hộ 685–1500 mm … TCVN 11823-13:2017» it had not looked up.
  test('no standard quoted for the dossier without a source', () => {
    expect(prompt).toContain(
      '**The abutment dossier\u0027s ranges are not a standard.**'
    )
    expect(prompt).toContain('call them «khoảng cho phép», never TCVN')
    expect(prompt).toContain(
      'quote no standard, limit or clause number unless that number came from tra_cuu_tieu_chuan or from the mo-cau guide in this turn'
    )
    expect(prompt).toContain('«tường phòng hộ»')
    // It comes after the catalogue rule it overrides.
    expect(
      prompt.indexOf('dossier\u0027s ranges are not a standard')
    ).toBeGreaterThan(
      prompt.indexOf('A template\u0027s declared range is the standard')
    )
    expect(skill).toContain('**Không trích tiêu chuẩn khi không có nguồn.**')
    expect(skill).toContain('không phải TCVN')
  })

  // P2-M4 (UI P2-M3 step 1): «dày tường cánh 300 mm» was refused without
  // a question, but in three paragraphs (~5 sentences): an explanation,
  // «Nếu cần tường cánh mỏng thì chọn…», «Một cách khác là…». The whole
  // answer after a refusal is one or two sentences.
  test('a refusal: the whole answer is one or two sentences', () => {
    expect(prompt).toContain(
      "**After a refusal the whole answer is one or two sentences:** counted from the tool's answer — an intention «Tôi sẽ…» written before the call is allowed and does not count — «chưa sửa, bản vẽ giữ nguyên» with the short reason in that same sentence, then at most that one hint sentence — no paragraph of explanation, no list of ways, no «Nếu cần… thì…», no «Một cách khác là…» beyond the one hint, no question."
    )
    // The earlier rule stays, the new one follows it.
    expect(
      prompt.indexOf('whole answer is one or two sentences')
    ).toBeGreaterThan(
      prompt.indexOf('after a refusal add at most one short sentence of hint')
    )
    expect(skill).toContain('**cả câu trả lời chỉ 1–2 câu**')
    expect(skill).toContain('không thêm đoạn giải')
    expect(skill).toContain('không liệt kê nhiều hướng')
    expect(skill).toContain(
      '«Chưa sửa: dày tường cánh 300 mm nhỏ hơn khoảng cho phép, bản vẽ giữ nguyên.\n  Dày tường cánh cần từ 351 đến 999 mm.»'
    )
  })

  // P2-M4: piles are an array, like the bearings.
  test('the piles: an array in the stretch rows, said in Vietnamese', () => {
    expect(skill).toMatch(
      /\| `soCotCoc`, `soHangCoc`, `aCocNgang`, `aCocDoc` +\| Co giãn \(mảng, từ P2-M4\)/
    )
    expect(skill).toContain(
      '«số cọc mỗi hàng», «số hàng cọc», «tim cọc ngang», «tim cọc dọc»'
    )
    expect(skill).toContain('3 cọc mỗi hàng → tim cọc ngang 3350')
    expect(skill).not.toMatch(/\| Số\/bố trí cọc/)
    expect(prompt).toContain(
      'the pile count, rows and spacing are drawn as an array, like the bearings'
    )
    expect(prompt).not.toContain('pile count/layout')
    expect(prompt).not.toContain('đổi số/bố trí cọc thì bị từ chối')
    expect(prompt).toContain('«số cọc mỗi hàng», «số hàng cọc»')
  })

  test('the slopes: in the stretch rows, said in Vietnamese', () => {
    expect(skill).toMatch(/\| `docNgang`, `docDoc` +\| Co giãn \(từ P2-M3\)/)
    expect(skill).toContain('«dốc ngang», «dốc đỉnh cánh»')
  })

  // P2-M5 (c), UI P2-M4 C5b: «Tôi sẽ sửa hồ sơ… 7600 mm.» before the tool,
  // then two sentences of refusal, was counted as three. The intention
  // before the call is allowed; what follows the refusal is 1–2 sentences.
  test('a refusal after an intention: the intention does not count', () => {
    expect(prompt).toContain(
      "counted from the tool's answer — an intention «Tôi sẽ…» written before the call is allowed and does not count"
    )
    expect(skill).toContain(
      'tính phần viết sau khi\n  công cụ trả lời; câu ý định «Tôi sẽ…» viết trước khi gọi công cụ không\n  tính vào đó (được giữ)'
    )
    // Still no question and at most one hint after the refusal.
    expect(prompt).toContain('then at most that one hint sentence')
    expect(prompt).toContain('no question.')
  })

  // P2-M5: hand edits compared by the region the change redraws; an existing
  // take-off follows the dossier.
  test('hand edits outside the changed region are kept; the take-off follows', () => {
    expect(prompt).toContain(
      'objects the user added and generated lines moved by hand outside that region are kept (said in canhBao), a hand edit inside it is refused'
    )
    expect(prompt).not.toContain('but only when the drawing has no hand edits')
    expect(prompt).toContain('sua_ho_so_mo refreshes it itself')
    expect(skill).toContain('**Sửa tay: so theo vùng đổi (từ P2-M5).**')
    expect(skill).toContain('*ngoài vùng mà lần sửa vẽ lại*')
    expect(skill).toContain('*trong vùng đổi*')
    expect(skill).toContain('tự cập nhật\n  tờ BTKL (cùng mã, cùng chỗ)')
    expect(skill).toContain('gồm mục 1.4 (tường cánh), mục 1.7 (lan can) và tổng C30')
  })

  // QA P2-M5 step 7: «đưa về số bộ sinh» said to the user. «Bộ sinh» is
  // internal slang: plain words in the prompt, the skill and the questions;
  // the flag names (dua_ve_so_bo_sinh) stay for the calls only.
  test('no «bộ sinh» in what the user reads: «thiết kế gốc» / «giá trị mặc định»', () => {
    // The rule itself names the word in «»; nothing else may use it.
    const bare = (t: string) => t.replace(/«[Bb]ộ sinh»/g, '')
    expect(bare(prompt)).not.toMatch(/bộ sinh/i)
    expect(bare(skill)).not.toMatch(/bộ sinh/i)
    expect(prompt).toContain('Nor the internal word «bộ sinh»')
    expect(prompt).toContain(
      'say «thiết kế gốc» or «giá trị mặc định» (e.g. «đưa về thiết kế gốc»)'
    )
    expect(prompt).toContain(
      '«đưa về thiết kế gốc rồi làm tiếp», «giữ bản vẽ đã sửa tay»'
    )
    expect(prompt).toContain('người dùng chọn đưa về thiết kế gốc thì gọi lại')
    expect(skill).toContain('**Lời với người dùng: không nói «bộ sinh».**')
    expect(skill).toContain('«thiết kế gốc», «giá trị mặc định»')
    expect(skill.replace(/\s+/g, ' ')).toContain(
      '«đưa về thiết kế gốc rồi làm tiếp / giữ bản vẽ đã sửa tay / hủy»'
    )
    // The flags are still there, for the calls.
    expect(prompt).toContain('dua_ve_so_bo_sinh: true')
    expect(skill).toContain('`dua_ve_so_bo_sinh: true`')
  })

  // QA P2-M6 step 4: «Đổi dốc ngang thành 3 %» was not applied; the agent
  // cited TCVN (not from a tool this turn) and asked about superelevation.
  // An explicit value in the tool's range is applied at once; at most one
  // short note after the result; never a question; never a TCVN citation
  // unless a tool returned it this turn. After a successful edit that
  // changes the take-off, the reply names 1.4, 1.7 and C30.
  test('an explicit in-range cross fall is applied at once; take-off figures are reported', () => {
    expect(prompt).toContain(
      '**An explicit cross fall in the allowed range is applied at once.**'
    )
    expect(prompt).toContain(
      'call the tool immediately with the current/default sign convention (positive = left side of the alignment high, «trái tuyến cao»)'
    )
    expect(prompt).toContain(
      'Do not ask whether the abutment is in a superelevation curve, which side is high, or whether the value is acceptable, and do not wait for confirmation.'
    )
    expect(prompt).toContain(
      'at most ONE short note sentence may follow the result (e.g. that a value above 2 % is usually used in superelevation)'
    )
    expect(prompt).toContain('Never a question.')
    expect(prompt).toContain(
      'Never cite TCVN or a clause/table unless that number was returned this turn by tra_cuu_tieu_chuan or another tool'
    )
    expect(prompt).toContain(
      'This holds even if a published guide tells you to ask first or to quote clause numbers'
    )
    expect(prompt).toContain(
      'report the changed item values concisely — including line 1.4 (wing), line 1.7 (rail) and the C30 total'
    )
    expect(prompt).toContain('do not omit 1.4 or 1.7')
    expect(skill).toContain('**áp ngay** với quy ước dấu hiện tại / mặc định (dương =')
    expect(skill).toContain('trái tuyến cao')
    expect(skill).toContain(
      'Không hỏi mố có nằm trong đường cong siêu cao hay không,'
    )
    expect(skill).toContain('được thêm **đúng một câu** ghi chú ngắn sau kết')
    expect(skill).toContain('Không hỏi. Không')
    expect(skill).toContain(
      'trích TCVN hay số điều/bảng trừ khi số đó đến từ `tra_cuu_tieu_chuan` hoặc'
    )
    expect(skill).not.toContain('Hỏi người dùng xác nhận trước khi dựng')
    expect(skill).not.toMatch(/Hỏi\s+người dùng xác nhận trước khi dựng/)
    expect(skill).toContain(
      'gồm mục 1.4 (tường cánh), mục 1.7 (lan can) và tổng C30'
    )
    expect(skill).toContain('không bỏ 1.4 hay 1.7')
  })
})
