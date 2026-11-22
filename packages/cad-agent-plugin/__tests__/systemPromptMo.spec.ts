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
  // is that template and not the dossier, which still refuses tCanh 600.
  test('a template other than the 0.3.0 dossier is named, with its mapping', () => {
    expect(prompt).toContain(
      'name the template and the parameters you mapped the request to'
    )
    expect(prompt).toContain('bTai = 600')
    expect(skill).toContain('phải nêu tên template và tham số đã ánh xạ')
    expect(skill).toContain('`bTai = 600`')
    expect(skill).toContain('`tCanh = 600` vẫn bị')
  })

  // Plan P0–P1 2.3, decision 5: raising the seat is asked, never guessed.
  test('abutment seat vocabulary, distinct from the pier, and the (a)/(b) question', () => {
    for (const word of [
      '«xà mũ mố», «bệ kê gối» and «đỉnh thân» mean the bearing seat',
      'seat = caoDoDayBe + hBe + hThan',
      '«đỉnh tường đỉnh» and «đỉnh mố» mean seat + hDau',
      '«xà mũ» (`tru-cau`)',
      'always ask exactly one question with two choices and never pick one yourself',
      '(a) nâng cả mố — caoDoDayBe += Δ',
      '(b) giữ móng, kéo dài thân — hThan += Δ'
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
      'Bản vẽ DWG/DXF nhập vào (không phải hồ sơ bộ sinh) vẫn sửa trực tiếp'
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
      'để tự đưa về số bộ sinh'
    ])
      expect(skill).toContain(word)
  })
})
