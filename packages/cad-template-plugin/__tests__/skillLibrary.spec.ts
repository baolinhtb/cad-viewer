import {
  type AcApSkillFetch,
  AcApSkillLibraryError,
  deleteSkill,
  listSkills,
  packSkillFolder,
  publishSkill,
  readSkill,
  uploadSkillFiles
} from '../src/skillLibrary'

/** Records every request and answers from a URL → body map. */
function fetchOf(
  routes: Record<string, unknown>,
  failures: Record<string, { status: number; body: unknown }> = {}
) {
  const calls: { url: string; init?: Parameters<AcApSkillFetch>[1] }[] = []
  const fetchImpl: AcApSkillFetch = async (url, init) => {
    calls.push({ url, init })
    const key = `${init?.method ?? 'GET'} ${url}`
    if (failures[key]) {
      return {
        ok: false,
        status: failures[key].status,
        json: async () => failures[key].body
      }
    }
    return { ok: true, status: 200, json: async () => routes[key] ?? {} }
  }
  return { fetchImpl, calls }
}

const SUMMARY = {
  skillId: 'mo-cau',
  title: 'Dựng mố cầu',
  description: 'Dựng và sửa mố cầu.',
  paths: ['SKILL.md', 'references/tham-so.md'],
  contentHash: 'abc',
  status: 'draft',
  uploadedBy: 1,
  createdAt: '2026-09-03 10:00:00',
  updatedAt: '2026-09-03 10:00:00',
  verifiedAt: null
}

describe('talking to the library', () => {
  test('every call carries the session cookie and hits the documented route', async () => {
    const { fetchImpl, calls } = fetchOf({
      'GET /api/skills': { skills: [SUMMARY] },
      'GET /api/skills/mo-cau': { skill: { ...SUMMARY, files: [] } },
      'POST /api/skills': { skill: { ...SUMMARY, files: [] }, changed: true },
      'POST /api/skills/mo-cau/publish': {
        skill: { ...SUMMARY, status: 'published' }
      },
      'DELETE /api/skills/mo-cau': { message: 'ok' }
    })

    expect(await listSkills(fetchImpl)).toEqual([SUMMARY])
    expect((await readSkill('mo-cau', fetchImpl)).skillId).toBe('mo-cau')
    const uploaded = await uploadSkillFiles(
      [{ path: 'SKILL.md', content: '---\nname: mo-cau\n---\nx' }],
      fetchImpl
    )
    expect(uploaded.changed).toBe(true)
    expect((await publishSkill('mo-cau', fetchImpl)).status).toBe('published')
    await deleteSkill('mo-cau', fetchImpl)

    // Without the cookie every route answers 401.
    for (const { init } of calls) expect(init?.credentials).toBe('same-origin')
    const upload = calls.find(
      c => c.init?.method === 'POST' && c.url === '/api/skills'
    )!
    expect(upload.init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(upload.init!.body!)).toEqual({
      files: [{ path: 'SKILL.md', content: '---\nname: mo-cau\n---\nx' }]
    })
  })

  test('an identical re-upload is reported as unchanged, not as new', async () => {
    const { fetchImpl } = fetchOf({
      'POST /api/skills': { skill: { ...SUMMARY, files: [] }, changed: false }
    })
    const { changed } = await uploadSkillFiles([], fetchImpl)
    expect(changed).toBe(false)
  })

  test('the reason the server gives reaches the caller, with its code', async () => {
    const { fetchImpl } = fetchOf(
      {},
      {
        'POST /api/skills': {
          status: 400,
          body: {
            error: 'Không nạp được hướng dẫn.',
            code: 'skill_invalid',
            detail: { reason: 'Thiếu SKILL.md.' }
          }
        }
      }
    )
    await expect(uploadSkillFiles([], fetchImpl)).rejects.toMatchObject({
      message: 'Thiếu SKILL.md.',
      code: 'skill_invalid',
      status: 400
    })
  })

  test('a failure without a reason still says something a person can read', async () => {
    const { fetchImpl } = fetchOf(
      {},
      { 'GET /api/skills': { status: 503, body: {} } }
    )
    await expect(listSkills(fetchImpl)).rejects.toThrow(/HTTP 503/)

    const dead: AcApSkillFetch = async () => {
      throw new TypeError('Failed to fetch')
    }
    await expect(listSkills(dead)).rejects.toBeInstanceOf(AcApSkillLibraryError)
  })

  test('guide ids are URL-encoded on the way out', async () => {
    const { fetchImpl, calls } = fetchOf({
      'GET /api/skills/a%2Fb': { skill: {} }
    })
    await readSkill('a/b', fetchImpl)
    expect(calls[0].url).toBe('/api/skills/a%2Fb')
  })
})

describe('packing what the file picker returns', () => {
  test('a picked folder keeps SKILL.md at the root and references under it', () => {
    const { files, ignored } = packSkillFolder([
      {
        name: 'tham-so.md',
        relativePath: 'mo-cau/references/tham-so.md',
        content: 'a'
      },
      { name: 'SKILL.md', relativePath: 'mo-cau/SKILL.md', content: 'main' },
      {
        name: 'notes.txt',
        relativePath: 'mo-cau/references/notes.txt',
        content: 'n'
      },
      { name: 'README.md', relativePath: 'mo-cau/README.md', content: 'r' },
      {
        name: 'deep.md',
        relativePath: 'mo-cau/references/sub/deep.md',
        content: 'd'
      }
    ])
    expect(files).toEqual([
      { path: 'SKILL.md', content: 'main' },
      { path: 'references/tham-so.md', content: 'a' },
      // A markdown file beside SKILL.md is a reference the author forgot to
      // put in the folder; it is taken along rather than refused.
      { path: 'references/README.md', content: 'r' }
    ])
    // Not silently: the author is told what did not go.
    expect(ignored).toEqual([
      'mo-cau/references/notes.txt',
      'mo-cau/references/sub/deep.md'
    ])
  })

  test('picked files without paths become SKILL.md plus references', () => {
    const { files, ignored } = packSkillFolder([
      { name: 'tcvn-check.md', content: 'c' },
      { name: 'SKILL.md', content: 'main' },
      { name: 'photo.png', content: 'p' }
    ])
    expect(files.map(f => f.path)).toEqual([
      'SKILL.md',
      'references/tcvn-check.md'
    ])
    expect(ignored).toEqual(['photo.png'])
  })

  test('a Windows path and a differently-cased SKILL.md are understood', () => {
    const { files } = packSkillFolder([
      { name: 'skill.md', relativePath: 'guide\\skill.md', content: 'main' },
      { name: 'a.md', relativePath: 'guide\\references\\a.md', content: 'a' }
    ])
    expect(files.map(f => f.path)).toEqual(['SKILL.md', 'references/a.md'])
  })

  test('a folder from a different guide is not folded in', () => {
    // Two folders picked at once: files outside the root of SKILL.md are
    // not references of this guide.
    const { files, ignored } = packSkillFolder([
      { name: 'SKILL.md', relativePath: 'mo-cau/SKILL.md', content: 'main' },
      { name: 'x.md', relativePath: 'tru-cau/references/x.md', content: 'x' }
    ])
    expect(files.map(f => f.path)).toEqual(['SKILL.md'])
    expect(ignored).toEqual(['tru-cau/references/x.md'])
  })

  test('no SKILL.md is refused with a sentence, not an empty upload', () => {
    expect(() => packSkillFolder([{ name: 'a.md', content: 'a' }])).toThrow(
      /Thiếu SKILL\.md/
    )
  })
})
