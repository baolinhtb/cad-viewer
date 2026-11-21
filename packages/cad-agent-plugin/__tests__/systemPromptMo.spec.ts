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
})
