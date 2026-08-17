import type { AcApToolOutcome } from '@mlightcad/cad-template-plugin'

/** One clause as the server ranked it, citable on its own. */
export interface TcvnClause {
  /** The standard's number, e.g. `TCVN 11823-13:2017`. */
  standard: string
  /** The standard's title, as printed. */
  title: string
  /** Heading path down to the clause, e.g. `7 LAN CAN › 7.3 THIẾT KẾ …`. */
  clause: string
  /** The clause verbatim, possibly cut short. */
  text: string
  /** True when the clause was longer than the caller's budget. */
  truncated: boolean
  score: number
}

/** Where the corpus is served from; same origin, behind the session cookie. */
const SEARCH_URL = '/api/tcvn/search'

/**
 * Asks the deployment's TCVN corpus for the clauses that answer a question.
 *
 * The assistant has to pick real dimensions — lane width by road class,
 * railing height by test level, deck thickness — and a model left to its own
 * memory produces numbers that look right to everyone except the engineer who
 * has to sign the drawing. This returns the clause itself, with the number of
 * the standard it came from, so the answer can be checked.
 *
 * Failure is reported as an outcome, never thrown: the assistant must see "the
 * corpus is not installed" as an answer it can act on, not as a transport
 * error it will retry.
 */
export async function lookupTcvn(
  question: string,
  limit?: number
): Promise<AcApToolOutcome> {
  const trimmed = question?.trim() ?? ''
  if (!trimmed) {
    return {
      ok: false,
      status: 'refused',
      message: 'Cần một câu hỏi cụ thể để tra cứu tiêu chuẩn.'
    }
  }

  const params = new URLSearchParams({ q: trimmed })
  if (limit) params.set('limit', String(limit))

  let response: Response
  try {
    response = await fetch(`${SEARCH_URL}?${params}`, {
      credentials: 'same-origin'
    })
  } catch {
    return {
      ok: false,
      status: 'refused',
      message:
        'Không kết nối được tới máy chủ để tra cứu tiêu chuẩn. Hãy nói rõ với người dùng là số liệu chưa được đối chiếu với TCVN.'
    }
  }

  if (response.status === 401) {
    return {
      ok: false,
      status: 'refused',
      message: 'Phiên đăng nhập đã hết hạn nên không tra cứu được tiêu chuẩn.'
    }
  }
  if (!response.ok) {
    // 503 is the deployment saying the corpus was not installed. Either way
    // the assistant needs to know it is drawing without the standards, not
    // that a lookup happened to come back empty.
    const detail = await readError(response)
    return {
      ok: false,
      status: 'refused',
      message: `Không tra cứu được tiêu chuẩn: ${detail}`
    }
  }

  const results = ((await response.json()) as { results?: TcvnClause[] })
    .results

  if (!results?.length) {
    return {
      ok: true,
      status: 'ready',
      message:
        'Không có điều khoản nào khớp. Hãy hỏi lại bằng từ khoá khác, hoặc nói rõ là số liệu đang dùng không lấy từ TCVN.'
    }
  }

  // Only `message`. Returning the clauses in `data` as well sent every one of
  // them twice — measured at 5.655 tokens for a single lookup, of which 2.872
  // were the duplicate — and a tool result stays in the conversation, so the
  // copy was re-sent on every later call of the turn. Four lookups filled 96%
  // of the history. Nothing read `data`; the model reads the message.
  return {
    ok: true,
    status: 'ready',
    message: results.map(formatClause).join('\n\n---\n\n')
  }
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

/**
 * Renders a clause the way it should be cited.
 *
 * The standard number leads, because a number quoted without it is worth no
 * more than one the model made up.
 */
function formatClause(clause: TcvnClause): string {
  const heading = clause.clause ? `\n${clause.clause}` : ''
  return `[${clause.standard}]${heading}\n\n${clause.text}`
}
