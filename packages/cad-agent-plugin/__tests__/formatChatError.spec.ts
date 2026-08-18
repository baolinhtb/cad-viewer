/**
 * An "Invalid prompt" has to name the field, not the message type.
 *
 * The SDK's own text says the messages "must be a ModelMessage[]" and suggests
 * `convertToModelMessages` — which the code already calls. The real fault is a
 * single value inside the converted messages, and the only record of which one
 * is a Zod error the SDK buries: it wraps it in a `TypeValidationError` before
 * attaching it as `cause`, so the issues sit at `cause.cause`. Reading one
 * level deep finds nothing and prints no hint, which reads as "there was
 * nothing more to say".
 */
import { formatChatError } from '../src/ui/formatChatError'

/** The shape the SDK actually throws: issues two levels down. */
function invalidPromptError(path: (string | number)[]) {
  const zodError = Object.assign(new Error('Invalid input'), {
    issues: [{ code: 'invalid_union', path, message: 'Invalid input' }]
  })
  const typeError = Object.assign(new Error('Type validation failed'), {
    cause: zodError
  })
  return Object.assign(
    new Error(
      'Invalid prompt: The messages must be a ModelMessage[]. If you have ' +
        'passed a UIMessage[], you can use convertToModelMessages to convert them.'
    ),
    { name: 'AI_InvalidPromptError', cause: typeError }
  )
}

describe('formatChatError', () => {
  test('names the offending path from a doubly-wrapped cause', () => {
    const message = formatChatError(
      invalidPromptError([2, 'content', 3, 'output', 'value', 'data', 'parts', 0, 'ben'])
    )
    expect(message).toContain('2.content.3.output.value.data.parts.0.ben')
  })

  test('finds issues attached directly, without the wrapper', () => {
    const zodError = Object.assign(new Error('Invalid input'), {
      issues: [{ path: ['0', 'content'], message: 'Invalid input' }]
    })
    const error = Object.assign(new Error('Invalid prompt: ...'), {
      cause: zodError
    })
    expect(formatChatError(error)).toContain('0.content')
  })

  test('keeps the original text when there is no cause to report', () => {
    const error = Object.assign(new Error('Invalid prompt: something'), {
      name: 'AI_InvalidPromptError'
    })
    expect(formatChatError(error)).toBe('Invalid prompt: something')
  })

  test('leaves unrelated errors alone', () => {
    expect(formatChatError(new Error('rate limit exceeded'))).toBe(
      'rate limit exceeded'
    )
  })

  test('does not loop forever on a self-referencing cause', () => {
    const error: Error & { cause?: unknown } = new Error('Invalid prompt: x')
    error.cause = error
    expect(() => formatChatError(error)).not.toThrow()
  })
})
