import {
  type AcApSkillDraft,
  type AcApSkillSummary,
  type AcApToolOutcome,
  listSkills,
  saveSkillDraft
} from '@mlightcad/cad-template-plugin'

/** Same shape the server accepts for a guide name. */
const GUIDE_ID = /^[a-z0-9][a-z0-9_-]*$/

/** A guide the assistant proposes, waiting for the person to answer. */
export interface AcApGuideProposal {
  draft: AcApSkillDraft
}

type Listener = (proposal: AcApGuideProposal | null) => void

/**
 * The proposal on screen, between the tool that asked and the panel that
 * shows it.
 *
 * Framework-free so the tool can be tested without a UI: the chat panel
 * subscribes and renders the card; the tool awaits the person's answer. With
 * no panel subscribed there is nobody to ask, and the tool says so rather
 * than saving anything unseen.
 */
export class AcApGuideProposalStore {
  private listeners = new Set<Listener>()
  private pending:
    | {
        proposal: AcApGuideProposal
        answer: (d: AcApSkillDraft | null) => void
      }
    | undefined

  /** Whether a panel is listening, i.e. whether the person can be asked. */
  get canAsk(): boolean {
    return this.listeners.size > 0
  }

  get current(): AcApGuideProposal | null {
    return this.pending?.proposal ?? null
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.current)
    return () => this.listeners.delete(listener)
  }

  /**
   * Shows `draft` and waits. Resolves with the draft as the person left it,
   * or `null` when they declined. A new proposal declines an older one.
   */
  ask(draft: AcApSkillDraft): Promise<AcApSkillDraft | null> {
    this.answer(null)
    return new Promise(resolve => {
      this.pending = { proposal: { draft: { ...draft } }, answer: resolve }
      this.emit()
    })
  }

  /** The person's answer: the (edited) draft to save, or `null`. */
  answer(draft: AcApSkillDraft | null): void {
    const pending = this.pending
    if (!pending) return
    this.pending = undefined
    pending.answer(draft)
    this.emit()
  }

  private emit() {
    for (const listener of this.listeners) listener(this.current)
  }
}

/** The store the chat panel renders. */
export const guideProposals = new AcApGuideProposalStore()

/** What {@link proposeGuide} needs from the outside, injected by tests. */
export interface AcApGuideProposalDeps {
  store?: AcApGuideProposalStore
  list?: () => Promise<AcApSkillSummary[]>
  save?: typeof saveSkillDraft
}

/**
 * `de_xuat_huong_dan`: the assistant drafts a guide from what it just did;
 * the person reads and edits it in a card, and only their confirmation saves
 * it — always as a new **draft**, which the library shows to its author
 * alone. The assistant never publishes and never overwrites a guide: an id
 * already in the library is refused, so a colleague's (or the person's own
 * published) guide cannot be replaced by a proposal.
 */
export async function proposeGuide(
  draft: AcApSkillDraft,
  deps: AcApGuideProposalDeps = {}
): Promise<AcApToolOutcome> {
  const store = deps.store ?? guideProposals
  const list = deps.list ?? (() => listSkills())
  const save = deps.save ?? saveSkillDraft

  if (!store.canAsk)
    return {
      ok: false,
      status: 'refused',
      message:
        'Không có khung chat để người dùng xác nhận, nên chưa lưu gì. Không lưu hướng dẫn khi người dùng chưa xem.'
    }

  const answered = await store.ask(draft)
  if (!answered)
    return {
      ok: true,
      status: 'ready',
      message:
        'Người dùng chọn không lưu hướng dẫn. Không đề xuất lại trong lượt này.',
      data: { daLuu: false }
    }

  const skillId = answered.skillId.trim()
  if (!GUIDE_ID.test(skillId))
    return {
      ok: false,
      status: 'refused',
      message: `Mã "${skillId}" không hợp lệ: cần slug ASCII không dấu (a-z, 0-9, _ hoặc -). Chưa lưu gì.`
    }

  try {
    if ((await list()).some(skill => skill.skillId === skillId))
      return {
        ok: false,
        status: 'refused',
        message: `Thư viện đã có hướng dẫn "${skillId}"; đề xuất không ghi đè hướng dẫn có sẵn. Đề xuất lại với mã khác, hoặc để người dùng tự sửa trong Thư viện hướng dẫn. Chưa lưu gì.`
      }
    const { skill } = await save({ ...answered, skillId })
    return {
      ok: true,
      status: 'ready',
      message: `Đã lưu nháp "${skill.skillId}" — chỉ người dùng thấy, trợ lý của người khác chưa dùng. Muốn dùng chung thì người dùng tự thử rồi công bố trong Thư viện hướng dẫn; trợ lý không công bố.`,
      data: { daLuu: true, maHuongDan: skill.skillId, trangThai: skill.status }
    }
  } catch (cause) {
    return {
      ok: false,
      status: 'refused',
      message: `Không lưu được hướng dẫn: ${cause instanceof Error ? cause.message : String(cause)}`
    }
  }
}
