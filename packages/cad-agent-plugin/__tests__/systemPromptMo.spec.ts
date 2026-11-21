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
})
