jest.mock('@mlightcad/cad-template-plugin', () => ({
  listSkills: jest.fn(),
  saveSkillDraft: jest.fn()
}))

import type {
  AcApSkill,
  AcApSkillDraft,
  AcApSkillSummary
} from '@mlightcad/cad-template-plugin'

import {
  AcApGuideProposalStore,
  proposeGuide
} from '../src/tools/guideProposal'

/**
 * `de_xuat_huong_dan` (phase 1, e GĐ3): the assistant may propose a guide,
 * but only the person saves it — after reading and editing it — and only as
 * their own draft. Never published, never over an existing guide, never
 * saved when there is nobody to ask.
 */
const DRAFT: AcApSkillDraft = {
  skillId: 'mo-cau-doi-chieu-cao-be',
  title: 'Đổi chiều cao bệ mố',
  description: 'Khi người dùng đổi hBe của hồ sơ mố.',
  body: '1. sua_ho_so_mo { hBe }\n2. cap_nhat_btkl'
}

function setup(existing: string[] = []) {
  const store = new AcApGuideProposalStore()
  const saved: AcApSkillDraft[] = []
  const save = jest.fn(async (draft: AcApSkillDraft) => {
    saved.push(draft)
    return {
      skill: { skillId: draft.skillId, status: 'draft' } as AcApSkill,
      changed: true
    }
  })
  const list = jest.fn(
    async () =>
      existing.map(skillId => ({ skillId })) as unknown as AcApSkillSummary[]
  )
  /** A panel on screen: records what it was shown, answers with `reply`. */
  const panel = (reply: (shown: AcApSkillDraft) => AcApSkillDraft | null) => {
    const shown: AcApSkillDraft[] = []
    store.subscribe(proposal => {
      if (!proposal) return
      shown.push(proposal.draft)
      // Answer on the next tick, as a person clicking would.
      setTimeout(() => store.answer(reply(proposal.draft)), 0)
    })
    return shown
  }
  return { store, save, list, saved, panel }
}

test('with nobody to ask, nothing is saved', async () => {
  const { store, save, list } = setup()
  const outcome = await proposeGuide(DRAFT, { store, save, list })
  expect(outcome.ok).toBe(false)
  expect(outcome.message).toMatch(/chưa lưu gì/)
  expect(save).not.toHaveBeenCalled()
})

test('the person is shown the draft and saves what they edited, as a draft', async () => {
  const { store, save, list, saved, panel } = setup()
  const shown = panel(draft => ({
    ...draft,
    body: `${draft.body}\n3. Kiểm lan can hai bên.`
  }))
  const outcome = await proposeGuide(DRAFT, { store, save, list })
  expect(shown).toEqual([DRAFT])
  expect(saved).toEqual([
    { ...DRAFT, body: `${DRAFT.body}\n3. Kiểm lan can hai bên.` }
  ])
  // A new guide: no existing one passed, so it is created, never replaced.
  expect(save.mock.calls[0]).toHaveLength(1)
  expect(outcome).toMatchObject({
    ok: true,
    data: { daLuu: true, maHuongDan: DRAFT.skillId, trangThai: 'draft' }
  })
  expect(outcome.message).toMatch(/chỉ người dùng thấy/)
  expect(outcome.message).toMatch(/trợ lý không công bố/)
  expect(store.current).toBeNull()
})

test('declining saves nothing', async () => {
  const { store, save, list, panel } = setup()
  panel(() => null)
  const outcome = await proposeGuide(DRAFT, { store, save, list })
  expect(outcome).toMatchObject({ ok: true, data: { daLuu: false } })
  expect(save).not.toHaveBeenCalled()
})

test('an id already in the library is refused, never overwritten', async () => {
  const { store, save, list, panel } = setup(['mo-cau-doi-chieu-cao-be'])
  panel(draft => draft)
  const outcome = await proposeGuide(DRAFT, { store, save, list })
  expect(outcome.ok).toBe(false)
  expect(outcome.message).toMatch(/không ghi đè/)
  expect(save).not.toHaveBeenCalled()
})

test('an id the person broke while editing is refused before saving', async () => {
  const { store, save, list, panel } = setup()
  panel(draft => ({ ...draft, skillId: 'Mố cầu' }))
  const outcome = await proposeGuide(DRAFT, { store, save, list })
  expect(outcome.ok).toBe(false)
  expect(save).not.toHaveBeenCalled()
})

test('the server’s refusal (e.g. not an author) reaches the assistant', async () => {
  const { store, list, panel } = setup()
  panel(draft => draft)
  const save = jest.fn(async () => {
    throw new Error('Chỉ tác giả mới nạp được hướng dẫn.')
  })
  const outcome = await proposeGuide(DRAFT, { store, save, list })
  expect(outcome).toMatchObject({ ok: false })
  expect(outcome.message).toContain('Chỉ tác giả mới nạp được hướng dẫn.')
})

test('a newer proposal declines the one still open', async () => {
  const store = new AcApGuideProposalStore()
  store.subscribe(() => {})
  const first = store.ask(DRAFT)
  const second = store.ask({ ...DRAFT, skillId: 'khac' })
  await expect(first).resolves.toBeNull()
  expect(store.current?.draft.skillId).toBe('khac')
  store.answer(null)
  await expect(second).resolves.toBeNull()
})
