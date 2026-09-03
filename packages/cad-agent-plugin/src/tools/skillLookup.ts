import type { AcApToolOutcome } from '@mlightcad/cad-template-plugin'

/** One file of a guide, as the server stores it. */
interface GuideFile {
  path: string
  content: string
}

/** A guide with its files, as `/api/skills/:id` returns it. */
interface GuideRecord {
  skillId: string
  title: string
  description: string
  status: 'draft' | 'published'
  paths: string[]
  files: GuideFile[]
}

/** Where the guide library is served from; same origin, behind the cookie. */
const SKILLS_URL = '/api/skills'

/** The main file of a guide, whose body is what "open the guide" returns. */
const MAIN_FILE = 'SKILL.md'

/** Same shape the server accepts for a guide name. */
const GUIDE_ID = /^[a-z0-9][a-z0-9_-]*$/

/**
 * Opens a guide the office wrote for the assistant, or one file of it.
 *
 * This is the second tier of how a guide is loaded. The first tier is the
 * one-line description of every published guide, which the server puts in
 * the cached standards block on every call; that is enough to know *whether*
 * a guide applies. The body is fetched only when one does, because a tool
 * result stays in the conversation for the rest of the turn and is paid for
 * on every later step of it.
 *
 * Failure is reported as an outcome, never thrown — the same rule as the
 * standards lookup, for the same reason: a thrown error looks like a
 * transport problem to the agent loop, which retries it and then carries on
 * without ever telling the engineer the guide was not read.
 *
 * @param ten - The guide's id, as listed in the standards block.
 * @param tep - Optional path of one reference file the guide names.
 */
export async function readGuide(
  ten: string,
  tep?: string
): Promise<AcApToolOutcome> {
  const id = ten?.trim() ?? ''
  if (!GUIDE_ID.test(id)) {
    return {
      ok: false,
      status: 'refused',
      message:
        'Cần mã hướng dẫn đúng như ghi trong mục "Hướng dẫn chuyên môn đã công bố", ví dụ "mo-cau".'
    }
  }

  let response: Response
  try {
    response = await fetch(`${SKILLS_URL}/${encodeURIComponent(id)}`, {
      credentials: 'same-origin'
    })
  } catch {
    return {
      ok: false,
      status: 'refused',
      message:
        'Không kết nối được tới máy chủ để mở hướng dẫn. Hãy nói rõ với người dùng là hướng dẫn chưa được đọc.'
    }
  }

  if (response.status === 401) {
    return {
      ok: false,
      status: 'refused',
      message: 'Phiên đăng nhập đã hết hạn nên không mở được hướng dẫn.'
    }
  }
  if (response.status === 404) {
    return {
      ok: false,
      status: 'refused',
      message:
        `Không có hướng dẫn nào tên "${id}". Chỉ mở được những hướng dẫn liệt kê trong mục ` +
        '"Hướng dẫn chuyên môn đã công bố"; kiểm lại mã ở đó.'
    }
  }
  if (!response.ok) {
    const detail = await readError(response)
    return {
      ok: false,
      status: 'refused',
      message: `Không mở được hướng dẫn: ${detail}`
    }
  }

  const guide = ((await response.json()) as { skill?: GuideRecord }).skill
  if (!guide) {
    return {
      ok: false,
      status: 'refused',
      message: 'Máy chủ trả về hướng dẫn rỗng.'
    }
  }

  const references = guide.files
    .map(file => file.path)
    .filter(path => path !== MAIN_FILE)

  if (tep) {
    const wanted = tep.trim()
    const file = guide.files.find(entry => entry.path === wanted)
    if (!file || wanted === MAIN_FILE) {
      return {
        ok: false,
        status: 'refused',
        message: references.length
          ? `Hướng dẫn "${id}" không có tệp "${wanted}". Các tệp kèm theo: ${references.join(', ')}.`
          : `Hướng dẫn "${id}" không có tệp kèm theo nào.`
      }
    }
    // Only `message`, never `data`: a copy in `data` is re-sent on every later
    // step of the turn, and nothing reads it — the model reads the message.
    return {
      ok: true,
      status: 'ready',
      message: `[${guide.skillId} / ${file.path}]\n\n${file.content.trim()}`
    }
  }

  const main = guide.files.find(file => file.path === MAIN_FILE)
  if (!main) {
    return {
      ok: false,
      status: 'refused',
      message: `Hướng dẫn "${id}" thiếu SKILL.md.`
    }
  }

  const footer = references.length
    ? `\n\n---\nTệp kèm theo, đọc bằng cách gọi lại với tep=<đường dẫn> — chỉ khi hướng dẫn bảo cần: ${references.join(', ')}`
    : ''

  return {
    ok: true,
    status: 'ready',
    message: `[Hướng dẫn ${guide.skillId} — ${guide.title}]\n\n${stripFrontmatter(main.content)}${footer}`
  }
}

/**
 * Drops the frontmatter block from a `SKILL.md`.
 *
 * The model already has the description from the standards block; sending
 * the header again spends tokens on a repeat, and a `name:` line inside the
 * body reads like an instruction to a model that has just been told to
 * address guides by name.
 */
export function stripFrontmatter(text: string): string {
  const match = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(
    text
  )
  return (match ? match[1] : text).trim()
}

/** Reads the server's message, falling back to the status line. */
async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    if (body?.error) return body.error
  } catch {
    // A non-JSON body is still a failure; the status says enough.
  }
  return `máy chủ trả về ${response.status}`
}
