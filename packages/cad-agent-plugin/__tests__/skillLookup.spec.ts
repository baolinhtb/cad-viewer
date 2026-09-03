/**
 * Opening a guide is how the office's own instructions reach the assistant,
 * so what comes back — and what does not — is the whole point.
 *
 * As with the standards lookup, every failure has to arrive as an outcome the
 * model can act on. A thrown error reads to the agent loop as a transport
 * problem, which it retries and then proceeds past, and the engineer is never
 * told the guide was not read.
 */
import { readGuide, stripFrontmatter } from '../src/tools/skillLookup'

const originalFetch = global.fetch

function mockFetch(impl: jest.Mock) {
  global.fetch = impl as unknown as typeof fetch
  return impl
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  }
}

afterEach(() => {
  global.fetch = originalFetch
})

const MAIN =
  '---\nname: mo-cau\ndescription: Sinh và sửa bản vẽ mố cầu.\n---\n' +
  '# Sinh & sửa mố cầu\n\nGọi `ghep_bo_phan` với `mo_cau_hoan_chinh`.\n'

const GUIDE = {
  skill: {
    skillId: 'mo-cau',
    title: 'Sinh & sửa mố cầu',
    description: 'Sinh và sửa bản vẽ mố cầu.',
    status: 'published',
    paths: ['SKILL.md', 'references/tham-so.md', 'references/tcvn-check.md'],
    files: [
      { path: 'SKILL.md', content: MAIN },
      { path: 'references/tham-so.md', content: '# Tham số\n\nB_MO → B.\n' },
      { path: 'references/tcvn-check.md', content: '# Kiểm TCVN\n' }
    ]
  }
}

test('the guide is fetched by id, with the session cookie attached', async () => {
  const fetchMock = mockFetch(jest.fn().mockResolvedValue(jsonResponse(GUIDE)))

  await readGuide('mo-cau')

  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/skills/mo-cau')
  // Without the cookie the route answers 401 and the assistant silently
  // proceeds without the guide.
  expect(init).toEqual({ credentials: 'same-origin' })
})

test('opening a guide returns its body without the frontmatter, and names its references', async () => {
  mockFetch(jest.fn().mockResolvedValue(jsonResponse(GUIDE)))

  const outcome = await readGuide('mo-cau')

  expect(outcome.ok).toBe(true)
  expect(outcome.message).toContain('[Hướng dẫn mo-cau — Sinh & sửa mố cầu]')
  expect(outcome.message).toContain('Gọi `ghep_bo_phan`')
  // The header is metadata the model already has; a `name:` line in the body
  // would read as an instruction.
  expect(outcome.message).not.toContain('name: mo-cau')
  expect(outcome.message).not.toContain('description:')
  // The references are listed so the model can ask for one by path, and only
  // listed: their contents are not sent until asked for.
  expect(outcome.message).toContain(
    'references/tham-so.md, references/tcvn-check.md'
  )
  expect(outcome.message).not.toContain('B_MO → B')
  // Deliberately no `data`: a copy there is re-sent on every later step.
  expect(outcome.data).toBeUndefined()
})

test('a reference file comes back on its own when asked for by path', async () => {
  mockFetch(jest.fn().mockResolvedValue(jsonResponse(GUIDE)))

  const outcome = await readGuide('mo-cau', 'references/tham-so.md')

  expect(outcome.ok).toBe(true)
  expect(outcome.message).toContain('[mo-cau / references/tham-so.md]')
  expect(outcome.message).toContain('B_MO → B')
  expect(outcome.message).not.toContain('Gọi `ghep_bo_phan`')
})

test('asking for a file the guide does not have lists the ones it does', async () => {
  mockFetch(jest.fn().mockResolvedValue(jsonResponse(GUIDE)))

  const outcome = await readGuide('mo-cau', 'references/khong-co.md')

  expect(outcome.ok).toBe(false)
  expect(outcome.message).toContain('references/khong-co.md')
  expect(outcome.message).toContain('references/tham-so.md')
  // SKILL.md is what the bare call returns; naming it as `tep` is a mistake
  // the model should be steered away from, not silently rewarded.
  expect((await readGuide('mo-cau', 'SKILL.md')).ok).toBe(false)
})

test('a guide with no references says so instead of listing nothing', async () => {
  mockFetch(
    jest.fn().mockResolvedValue(
      jsonResponse({
        skill: {
          ...GUIDE.skill,
          paths: ['SKILL.md'],
          files: [GUIDE.skill.files[0]]
        }
      })
    )
  )

  const opened = await readGuide('mo-cau')
  expect(opened.ok).toBe(true)
  expect(opened.message).not.toContain('Tệp kèm theo')

  const missing = await readGuide('mo-cau', 'references/x.md')
  expect(missing.ok).toBe(false)
  expect(missing.message).toContain('không có tệp kèm theo nào')
})

test('an id that could not be a guide name is refused without calling the server', async () => {
  const fetchMock = mockFetch(jest.fn())

  for (const bad of ['', '  ', 'Mố cầu', '../etc', 'mo cau']) {
    const outcome = await readGuide(bad)
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('refused')
  }
  expect(fetchMock).not.toHaveBeenCalled()
})

test('an unknown guide is refused with a pointer to the published list', async () => {
  mockFetch(
    jest.fn().mockResolvedValue(jsonResponse({ error: 'Không tìm thấy' }, 404))
  )

  const outcome = await readGuide('khong-co')

  expect(outcome.ok).toBe(false)
  expect(outcome.message).toContain('khong-co')
  expect(outcome.message).toContain('Hướng dẫn chuyên môn đã công bố')
})

test('an expired session and a dead server are reported, not thrown', async () => {
  mockFetch(jest.fn().mockResolvedValue(jsonResponse({}, 401)))
  const expired = await readGuide('mo-cau')
  expect(expired.ok).toBe(false)
  expect(expired.message).toContain('đăng nhập')

  mockFetch(jest.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  const dead = await readGuide('mo-cau')
  expect(dead.ok).toBe(false)
  expect(dead.message).toContain('chưa được đọc')

  mockFetch(
    jest.fn().mockResolvedValue(jsonResponse({ error: 'Lỗi nội bộ' }, 500))
  )
  const failed = await readGuide('mo-cau')
  expect(failed.ok).toBe(false)
  expect(failed.message).toContain('Lỗi nội bộ')
})

test('stripFrontmatter leaves text without a header untouched and tolerates CRLF and a BOM', () => {
  expect(stripFrontmatter('# Chỉ thân\n')).toBe('# Chỉ thân')
  expect(stripFrontmatter('﻿---\r\nname: a\r\n---\r\nThân.\r\n')).toBe('Thân.')
  expect(stripFrontmatter('---\nname: a\n---')).toBe('')
})
