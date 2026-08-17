/**
 * The standards lookup is the assistant's only way to tell a number it read
 * from a number it remembers, so its failure modes matter as much as its happy
 * path.
 *
 * Every failure here has to arrive as an *outcome* the model can act on. A
 * thrown error reads to the agent loop as a transport problem, and the loop
 * retries it — quietly, several times, and then draws the remembered number
 * anyway without ever telling the engineer the standards were never consulted.
 */
import { lookupTcvn } from '../src/tools/tcvnLookup'

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

const CLAUSE = {
  standard: 'TCVN 11823-13:2017',
  title: 'Thiết kế cầu đường bộ - Phần 13: Lan can',
  clause: '7 LAN CAN ĐƯỜNG Ô TÔ › 7.3.2.1 Chiều cao',
  text: 'Chiều cao lan can phải nhỏ nhất 810mm đối với cấp thử nghiệm TL-4.',
  truncated: false,
  score: 32.2
}

test('a question reaches the corpus with the session cookie attached', async () => {
  const fetchMock = mockFetch(
    jest.fn().mockResolvedValue(jsonResponse({ results: [CLAUSE] }))
  )

  await lookupTcvn('chiều cao lan can TL-4', 3)

  const [url, init] = fetchMock.mock.calls[0]
  // Parsed rather than string-matched: the question is Vietnamese, and how a
  // space or a diacritic happens to be escaped is not what this test is about.
  const request = new URL(url as string, 'http://localhost')
  expect(request.pathname).toBe('/api/tcvn/search')
  expect(request.searchParams.get('q')).toBe('chiều cao lan can TL-4')
  expect(request.searchParams.get('limit')).toBe('3')
  // Without the cookie the route answers 401 and the assistant silently loses
  // its only source of real numbers.
  expect(init).toEqual({ credentials: 'same-origin' })
})

test('the clause comes back with the standard that makes it citable', async () => {
  mockFetch(jest.fn().mockResolvedValue(jsonResponse({ results: [CLAUSE] })))

  const outcome = await lookupTcvn('chiều cao lan can TL-4')

  expect(outcome.ok).toBe(true)
  expect(outcome.message).toContain('TCVN 11823-13:2017')
  expect(outcome.message).toContain('810mm')
  // Deliberately no `data`: carrying the clauses a second time doubled a tool
  // result that then sat in the conversation and was re-sent on every later
  // call — measured at 96% of one turn's history for four lookups.
  expect(outcome.data).toBeUndefined()
})

test('an empty question is refused without calling the server', async () => {
  const fetchMock = mockFetch(jest.fn())

  const outcome = await lookupTcvn('   ')

  expect(outcome.ok).toBe(false)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('finding nothing is a result, not a failure', async () => {
  // `ok: false` would tell the agent the tool broke and invite a retry. It did
  // not break; the corpus simply has no clause for that question, and the
  // assistant needs to say so rather than try again.
  mockFetch(jest.fn().mockResolvedValue(jsonResponse({ results: [] })))

  const outcome = await lookupTcvn('màu sơn ưa thích của kỹ sư')

  expect(outcome.ok).toBe(true)
  expect(outcome.message).toMatch(/không/i)
})

test('a corpus the deployment never installed says so instead of throwing', async () => {
  mockFetch(
    jest
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { error: 'Bộ tiêu chuẩn chưa được cài đặt trên máy chủ.' },
          503
        )
      )
  )

  const outcome = await lookupTcvn('chiều cao lan can')

  expect(outcome.ok).toBe(false)
  expect(outcome.status).toBe('refused')
  expect(outcome.message).toContain('chưa được cài đặt')
})

test('an expired session is named, so the answer is not silently unchecked', async () => {
  mockFetch(jest.fn().mockResolvedValue(jsonResponse({}, 401)))

  const outcome = await lookupTcvn('bề rộng làn xe')

  expect(outcome.ok).toBe(false)
  expect(outcome.message).toMatch(/đăng nhập/i)
})

test('a network failure is an outcome, not a thrown error', async () => {
  mockFetch(jest.fn().mockRejectedValue(new Error('offline')))

  const outcome = await lookupTcvn('bề rộng làn xe')

  expect(outcome.ok).toBe(false)
  expect(outcome.message).toMatch(/TCVN/)
})
