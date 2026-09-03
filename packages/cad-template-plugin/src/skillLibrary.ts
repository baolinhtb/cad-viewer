/**
 * The guide library, as the editor talks to it.
 *
 * A guide ("skill" in Claude Code's vocabulary) is a folder of markdown an
 * author uploads for the assistant: `SKILL.md`, with a `name` and a
 * `description` in its frontmatter, plus `references/*.md`. The server keeps
 * it, gates who may add one, and puts every published guide's description in
 * the assistant's system block; the assistant reads the body on demand. This
 * module is the client half: list, read, upload, publish, delete — and the one
 * piece of logic worth testing, turning what a browser file picker hands back
 * into the folder shape the server accepts.
 */

/** One file of a guide, by the path the guide uses for it. */
export interface AcApSkillFile {
  path: string
  content: string
}

/** A guide as the library lists it, without contents. */
export interface AcApSkillSummary {
  skillId: string
  title: string
  description: string
  paths: string[]
  contentHash: string
  status: 'draft' | 'published'
  uploadedBy: number | null
  createdAt: string
  updatedAt: string
  verifiedAt: string | null
}

/** A guide with every file. */
export interface AcApSkill extends AcApSkillSummary {
  files: AcApSkillFile[]
}

/** Fetch signature, injected so tests need no network. */
export type AcApSkillFetch = (
  url: string,
  init?: {
    method?: string
    credentials?: 'same-origin'
    headers?: Record<string, string>
    body?: string
  }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export class AcApSkillLibraryError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number
  ) {
    super(message)
  }
}

const DEFAULT_BASE = '/api/skills'
const MAIN_FILE = 'SKILL.md'

const defaultFetch = () => fetch as unknown as AcApSkillFetch

/**
 * One round trip, with the server's own reason surfaced on failure.
 *
 * The routes answer `{ error, code, detail: { reason } }`; the reason is the
 * sentence written for the person uploading ("Thiếu SKILL.md."), so it is what
 * the dialog should show.
 */
async function call(
  fetchImpl: AcApSkillFetch,
  url: string,
  init: Parameters<AcApSkillFetch>[1],
  fallback: string
): Promise<Record<string, unknown>> {
  let response: Awaited<ReturnType<AcApSkillFetch>>
  try {
    response = await fetchImpl(url, { credentials: 'same-origin', ...init })
  } catch {
    throw new AcApSkillLibraryError(
      'Không kết nối được tới máy chủ thư viện hướng dẫn.'
    )
  }
  const body = (await response.json().catch(() => ({}))) as {
    error?: string
    code?: string
    detail?: { reason?: string }
  } & Record<string, unknown>

  if (!response.ok) {
    throw new AcApSkillLibraryError(
      body.detail?.reason ??
        body.error ??
        `${fallback} (HTTP ${response.status})`,
      body.code,
      response.status
    )
  }
  return body
}

/** Every guide this member may see: published ones, and their own drafts. */
export async function listSkills(
  fetchImpl: AcApSkillFetch = defaultFetch(),
  baseUrl = DEFAULT_BASE
): Promise<AcApSkillSummary[]> {
  const body = await call(
    fetchImpl,
    baseUrl,
    {},
    'Không tải được thư viện hướng dẫn'
  )
  return (body.skills as AcApSkillSummary[] | undefined) ?? []
}

/** One guide with its files. */
export async function readSkill(
  skillId: string,
  fetchImpl: AcApSkillFetch = defaultFetch(),
  baseUrl = DEFAULT_BASE
): Promise<AcApSkill> {
  const body = await call(
    fetchImpl,
    `${baseUrl}/${encodeURIComponent(skillId)}`,
    {},
    'Không đọc được hướng dẫn'
  )
  return body.skill as AcApSkill
}

/**
 * Uploads a guide as a draft.
 *
 * @returns The stored guide, and whether anything changed — an identical
 * re-upload is reported rather than pretended to be new.
 */
export async function uploadSkillFiles(
  files: AcApSkillFile[],
  fetchImpl: AcApSkillFetch = defaultFetch(),
  baseUrl = DEFAULT_BASE
): Promise<{ skill: AcApSkill; changed: boolean }> {
  const body = await call(
    fetchImpl,
    baseUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files })
    },
    'Không nạp được hướng dẫn'
  )
  return { skill: body.skill as AcApSkill, changed: body.changed === true }
}

/** Publishes a draft, which only its uploader may do. */
export async function publishSkill(
  skillId: string,
  fetchImpl: AcApSkillFetch = defaultFetch(),
  baseUrl = DEFAULT_BASE
): Promise<AcApSkill> {
  const body = await call(
    fetchImpl,
    `${baseUrl}/${encodeURIComponent(skillId)}/publish`,
    { method: 'POST' },
    'Không công bố được hướng dẫn'
  )
  return body.skill as AcApSkill
}

export async function deleteSkill(
  skillId: string,
  fetchImpl: AcApSkillFetch = defaultFetch(),
  baseUrl = DEFAULT_BASE
): Promise<void> {
  await call(
    fetchImpl,
    `${baseUrl}/${encodeURIComponent(skillId)}`,
    { method: 'DELETE' },
    'Không xoá được hướng dẫn'
  )
}

/** What a browser file picker hands back, reduced to what packing needs. */
export interface AcApPickedFile {
  name: string
  /** `webkitRelativePath` when a folder was picked; empty otherwise. */
  relativePath?: string
  content: string
}

/**
 * Turns picked files into the folder shape the server accepts.
 *
 * Two ways of picking are supported, because browsers offer two. A folder
 * pick gives every file a relative path, so the folder that holds `SKILL.md`
 * is the root and `references/` is read from under it. A multi-file pick
 * gives bare names, so every `.md` that is not `SKILL.md` is taken as a
 * reference — that is the only place the server lets it live anyway.
 *
 * Anything else is skipped and named, not silently dropped: a folder tends to
 * carry a README or a stray note, and the author should see what did not go.
 *
 * @throws {AcApSkillLibraryError} when no `SKILL.md` was picked.
 */
export function packSkillFolder(picked: AcApPickedFile[]): {
  files: AcApSkillFile[]
  ignored: string[]
} {
  const entries = picked.map(file => ({
    path: (file.relativePath || file.name).replace(/\\/g, '/'),
    content: file.content
  }))

  const main = entries.find(
    entry =>
      entry.path.split('/').pop()?.toLowerCase() === MAIN_FILE.toLowerCase()
  )
  if (!main) {
    throw new AcApSkillLibraryError(
      'Thiếu SKILL.md. Chọn thư mục hướng dẫn, hoặc chọn SKILL.md cùng các file references.'
    )
  }

  const root = main.path.slice(
    0,
    main.path.length - main.path.split('/').pop()!.length
  )
  const files: AcApSkillFile[] = [{ path: MAIN_FILE, content: main.content }]
  const ignored: string[] = []

  for (const entry of entries) {
    if (entry === main) continue
    const relative = entry.path.startsWith(root)
      ? entry.path.slice(root.length)
      : null
    const name = entry.path.split('/').pop() ?? ''
    const isMarkdown = /\.md$/i.test(name)

    if (
      relative !== null &&
      /^references\/[^/]+$/.test(relative) &&
      isMarkdown
    ) {
      files.push({ path: `references/${name}`, content: entry.content })
    } else if (relative !== null && !relative.includes('/') && isMarkdown) {
      // A bare pick, or a reference left beside SKILL.md: both belong under
      // references/, and putting them there is what the author meant.
      files.push({ path: `references/${name}`, content: entry.content })
    } else {
      ignored.push(entry.path)
    }
  }

  return { files, ignored }
}
