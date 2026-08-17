import {
  type ChatTransport,
  convertToModelMessages,
  Experimental_Agent as Agent,
  generateId,
  type InferUIMessageChunk,
  stepCountIs,
  type UIMessage,
  validateUIMessages
} from 'ai'

import { agentT } from '../i18n'
import type { AgentMode } from '../storage/AgentModeStore'
import type { LlmSettings } from '../storage/LlmSettingsStore'
import { createCadTools } from '../tools/cadTools'
import { formatChatError } from '../ui/formatChatError'
import { withTurnUndoMark } from './agentTurnEdit'
import { extractConversationContext } from './conversationContext'
import { createModelFromSettings } from './createModel'
import { captureDrawingPreview } from './drawingPreviewCapture'
import {
  buildVerificationFeedbackMessage,
  MAX_VERIFICATION_ATTEMPTS,
  verifyDrawing
} from './drawingVerifier'
import { CAD_AGENT_SYSTEM_PROMPT } from './systemPrompt'
import {
  appendAssistantText,
  appendVerificationReview,
  type UIMessageChunkWriter
} from './uiMessageStreamHelpers'

function wasAborted(
  abortSignal: AbortSignal | undefined,
  error?: unknown
): boolean {
  if (abortSignal?.aborted) return true
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * Output budget for one model step.
 *
 * A drawing step is long: reasoning, then a dozen tool calls carrying
 * coordinates. Left at the SDK default the response is cut off partway
 * through emitting them, and a truncated tool call is never executed — so the
 * engineer watches it work and ends up with an empty drawing and no error.
 * Matches the ceiling the deployment's proxy enforces.
 */
const MAX_OUTPUT_TOKENS = 16_000

/** Runtime options that affect agent behavior beyond LLM settings. */
export interface AgentChatOptions {
  /** When `high-inference`, screenshot verification runs after each drawing round. */
  agentMode: AgentMode
}

/** The agent {@link createCadAgent} builds, tools and all. */
export type CadAgent = ReturnType<typeof createCadAgent>

/** The shape `validateUIMessages` will accept for a plain {@link UIMessage}. */
type ValidateUIMessagesTools = Parameters<typeof validateUIMessages>[0]['tools']

/**
 * Builds an AI SDK agent configured for CAD drawing with tool calling.
 *
 * @param settings - LLM provider credentials and model selection.
 * @param steps - How many model calls one turn may make. Every step is a whole
 * request carrying the entire conversation, so this number is the largest
 * single factor in what a drawing costs — see {@link stepBudget}.
 * @returns An agent that streams responses and can invoke {@link createCadTools}.
 */
export function createCadAgent(settings: LlmSettings, steps = 10) {
  return new Agent({
    model: createModelFromSettings(settings),
    system: CAD_AGENT_SYSTEM_PROMPT,
    tools: createCadTools(),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    stopWhen: stepCountIs(Math.max(1, steps))
  })
}

/**
 * Streams one agent round and returns the updated UI messages when finished.
 */
async function streamAgentRound(options: {
  agent: CadAgent
  workingMessages: UIMessage[]
  abortSignal: AbortSignal | undefined
  write: UIMessageChunkWriter
}): Promise<UIMessage[]> {
  const { agent, workingMessages, abortSignal, write } = options
  const modelMessages = await convertToModelMessages(workingMessages, {
    tools: agent.tools
  })
  // The SDK types `Agent.stream` as taking only a `Prompt`, but its body is
  // `streamText({ ...this.settings, ...options })` — so `abortSignal` does
  // reach the request, and dropping it to satisfy the type would quietly break
  // the stop button. Cast to the SDK's own parameter type rather than removing
  // a live argument.
  const result = agent.stream({
    prompt: modelMessages,
    abortSignal
  } as Parameters<CadAgent['stream']>[0])

  let finishedMessages = workingMessages
  const uiStream = result.toUIMessageStream({
    originalMessages: workingMessages,
    onFinish: ({ messages }) => {
      finishedMessages = messages
    },
    onError: error =>
      error instanceof Error ? formatChatError(error) : String(error)
  })

  for await (const chunk of uiStream) {
    write(chunk)
  }

  // A step cut off by the output limit stops mid-way through emitting its tool
  // calls, and a truncated tool call is never executed. Silence here is how a
  // turn ends up looking like it worked and drawing nothing, so say it.
  try {
    const finishReason = await result.finishReason
    if (finishReason === 'length') {
      appendAssistantText(write, `\n${agentT('outputTruncated')}`)
    }
  } catch {
    // The reason is a convenience, not the result. An aborted or failed
    // stream has already been reported through the stream itself.
  }

  return finishedMessages
}

/**
 * Says what the tools did, without spending a model call to say it.
 *
 * A turn capped at one call never gets a second one, and the second is where
 * the model would normally read the tool results and report them. Left alone,
 * a refused template would be silent: the assistant's text says it drew the
 * section, because that text was written before the tool ran.
 *
 * So the outcomes are read straight out of the finished message and written
 * into the answer. This is only possible because the tools already speak to
 * engineers — a refusal from `chay_template` names the field and the allowed
 * range — so relaying one verbatim reads as an answer rather than as a log
 * line leaking into the chat.
 *
 * @param messages - Messages the round finished with.
 * @returns Text to append, or empty when every tool succeeded quietly.
 */
export function reportToolOutcomes(messages: UIMessage[]): string {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') return ''

  const lines: string[] = []
  for (const part of last.parts ?? []) {
    const type = (part as { type?: string }).type ?? ''
    if (!type.startsWith('tool-')) continue

    const output = (part as { output?: unknown }).output as
      | { ok?: boolean; message?: string }
      | undefined

    // A tool that threw, or one the step was cut off before finishing, has no
    // outcome to relay — but silence there is exactly the failure this exists
    // to prevent, so it is named.
    if (!output || typeof output.message !== 'string') {
      const state = (part as { state?: string }).state
      if (state === 'output-error') {
        lines.push(`⚠ ${type.slice(5)}: ${agentT('toolFailed')}`)
      }
      continue
    }

    lines.push(output.ok === false ? `⚠ ${output.message}` : output.message)
  }

  return lines.length ? lines.join('\n\n') : ''
}

/**
 * Creates a {@link ChatTransport} that runs the agent in-process (no HTTP server).
 *
 * In high-inference mode, captures a drawing screenshot after each agent round
 * and loops until verification passes or {@link MAX_VERIFICATION_ATTEMPTS} is reached.
 */
export function createAgentChatTransport(
  getAgent: () => CadAgent,
  getSettings: () => LlmSettings,
  getOptions: () => AgentChatOptions
): ChatTransport<UIMessage> {
  return {
    sendMessages: async ({ messages, abortSignal }) => {
      const agent = getAgent()
      // `validateUIMessages` types `tools` against the message type's own tool
      // map, which for a plain `UIMessage` is `unknown`-shaped; `Tool` is
      // invariant in its input, so the concrete map is not assignable. These
      // are the very tools the messages were produced with, so widen rather
      // than drop the argument — without it, tool parts go unvalidated.
      const validatedMessages = await validateUIMessages({
        messages,
        tools: agent.tools as unknown as ValidateUIMessagesTools
      })
      // Read before the turn starts: the user's own words label the turn's one
      // undo mark, and that mark is opened in both modes — not just the
      // high-inference branch that also wants the reference images.
      const { userRequest, referenceImages } =
        extractConversationContext(validatedMessages)

      return new ReadableStream<InferUIMessageChunk<UIMessage>>({
        async start(controller) {
          const write: UIMessageChunkWriter = chunk => {
            controller.enqueue(chunk)
          }

          try {
            // One turn, one undo mark — every round of it, in both modes.
            // Inside the existing `try` so the mark is closed before the catch
            // below turns a failure into an error chunk.
            await withTurnUndoMark(userRequest, async () => {
              let workingMessages = validatedMessages
              const { agentMode } = getOptions()

              // One model call, and no second one to narrate it. The tools'
              // own outcomes carry the report instead — see
              // {@link reportToolOutcomes}.
              if (agentMode === 'mot-lenh') {
                const finished = await streamAgentRound({
                  agent,
                  workingMessages,
                  abortSignal,
                  write
                })
                const report = reportToolOutcomes(finished)
                if (report) appendAssistantText(write, `\n\n${report}`)
                return
              }

              if (agentMode === 'simple') {
                await streamAgentRound({
                  agent,
                  workingMessages,
                  abortSignal,
                  write
                })
                return
              }

              const settings = getSettings()
              let verificationAttempts = 0

              while (!abortSignal?.aborted) {
                workingMessages = await streamAgentRound({
                  agent,
                  workingMessages,
                  abortSignal,
                  write
                })

                if (abortSignal?.aborted) break

                const preview = await captureDrawingPreview()

                // Nothing was drawn. That is a normal way for a turn to end —
                // the assistant asked which kind of bridge, or answered a
                // question — and there is no drawing to check against the
                // request. Saying "verification skipped: no-entities" over the
                // top of a perfectly good question tells the engineer that
                // something failed, which is both wrong and the last thing to
                // read under an answer they are supposed to reply to.
                if (!preview.ok && preview.reason === 'no-entities') break

                verificationAttempts += 1

                if (!preview.ok) {
                  appendVerificationReview(write, {
                    title: agentT('verificationTitle'),
                    attempt: verificationAttempts,
                    maxAttempts: MAX_VERIFICATION_ATTEMPTS,
                    statusText: `${agentT('verificationSkipped')}: ${preview.reason}`,
                    referenceImages,
                    referenceLabel: agentT('referenceImages'),
                    drawingLabel: agentT('drawingScreenshot')
                  })
                  break
                }

                appendVerificationReview(write, {
                  title: agentT('verificationTitle'),
                  attempt: verificationAttempts,
                  maxAttempts: MAX_VERIFICATION_ATTEMPTS,
                  statusText: agentT('verifying'),
                  referenceImages,
                  referenceLabel: agentT('referenceImages'),
                  drawingLabel: agentT('drawingScreenshot'),
                  drawingDataUrl: preview.dataUrl
                })

                let verification
                try {
                  verification = await verifyDrawing(
                    settings,
                    userRequest,
                    referenceImages,
                    preview.dataUrl,
                    abortSignal
                  )
                } catch (error) {
                  if (wasAborted(abortSignal, error)) break
                  appendAssistantText(
                    write,
                    `\n${agentT('verificationError')}: ${
                      error instanceof Error ? error.message : String(error)
                    }`
                  )
                  break
                }

                if (abortSignal?.aborted) break

                if (verification.passed) {
                  appendAssistantText(
                    write,
                    `\n${agentT('verificationPassed')}`
                  )
                  break
                }

                if (verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
                  appendAssistantText(
                    write,
                    `\n${agentT('verificationMaxAttempts')}\n\n${verification.feedback.trim()}`
                  )
                  break
                }

                appendAssistantText(
                  write,
                  `\n${agentT('verificationFailed')}\n${verification.feedback.trim()}\n\n${agentT('verificationContinuing')}`
                )

                workingMessages = [
                  ...workingMessages,
                  {
                    id: generateId(),
                    role: 'user',
                    parts: [
                      {
                        type: 'text',
                        text: buildVerificationFeedbackMessage(
                          verificationAttempts,
                          MAX_VERIFICATION_ATTEMPTS,
                          verification.feedback
                        )
                      }
                    ]
                  }
                ]
              }
            })
          } catch (error) {
            if (wasAborted(abortSignal, error)) return
            controller.enqueue({
              type: 'error',
              errorText:
                error instanceof Error ? formatChatError(error) : String(error)
            })
          } finally {
            controller.close()
          }
        }
      })
    },
    reconnectToStream: async () => null
  }
}
