/**
 * English UI strings for the CAD Agent panel.
 *
 * Flat keys under `main.toolPalette.agent` (merged into {@link AcApI18n}).
 * Keys must stay in sync with {@link agentZh}.
 */
export const agentEn = {
  tab: 'Agent',
  title: 'CAD Agent',
  settings: 'Settings',
  clear: 'New chat',
  close: 'Close',
  provider: 'Provider',
  providerDeepseek: 'DeepSeek',
  providerDeepseekVl: 'DeepSeek VL (vision)',
  providerDeepseekVlHint:
    'Uses an OpenAI-compatible vision endpoint (default: SiliconFlow). For self-hosted vLLM, set Base URL to your server, e.g. http://127.0.0.1:8000/v1.',
  providerOpenai: 'OpenAI',
  providerAnthropic: 'Anthropic',
  providerOpenaiCompatible: 'OpenAI Compatible',
  baseUrl: 'Base URL',
  baseUrlHint:
    'Must include /v1 for most gateways, e.g. https://ai-api.example.com/v1. Host-only URLs are auto-corrected.',
  model: 'Model',
  visionModels: 'Vision models',
  textModels: 'Text-only models',
  customModel: 'Custom model…',
  customModelName: 'Custom model name',
  modelSupportsVision: 'Supports image input',
  modelTextOnly: 'Text only — image attachments disabled',
  apiKey: 'API Key',
  saveSettings: 'Save settings',
  emptyHint:
    'Describe what to draw, or attach a reference image (sketch, screenshot, floor plan).',
  toolPrefix: 'tool',
  copyTool: 'Copy tool call (input & output)',
  toolCopied: 'Copied',
  inputPlaceholder: 'Describe your request…',
  attachImage: 'Attach image',
  removeAttachment: 'Remove',
  imageAlt: 'Attached image',
  imageOnlyRequest:
    'Please analyze the attached reference image(s) and help me draw this in CAD.',
  prepareImageFailed: 'Failed to prepare the attached image. Try a smaller PNG or JPEG.',
  errorTitle: 'Something went wrong',
  dismissError: 'Dismiss',
  send: 'Send',
  stop: 'Stop',
  working: 'Working…',
  agentMode: 'Agent mode',
  agentModeSimple: 'Simple',
  agentModeHighInference: 'High inference',
  agentModeSimpleHint:
    'Default. Fast — measure-API self-check only; no screenshots or vision verification.',
  agentModeHighInferenceHint:
    'Opt-in for complex tasks. Allows screenshots and verifies with screenshot + vision model (up to 5 rounds). Requires a vision model.',
  highInferenceRequiresVision:
    'High inference mode requires a vision-capable model.',
  verificationTitle: 'Drawing verification',
  verifying:
    'Comparing the drawing screenshot with your request and reference images…',
  verificationPassed: 'Verification passed — the drawing matches the request.',
  verificationFailed: 'Verification failed — issues found:',
  verificationSkipped: 'Verification skipped',
  verificationError: 'Verification error',
  verificationContinuing: 'Continuing to optimize the drawing…',
  verificationMaxAttempts:
    'Verification did not pass within the maximum number of attempts.',
  referenceImages: 'Reference image(s)',
  drawingScreenshot: 'Current drawing screenshot',
  unsavedSettings: 'Save settings before sending messages.',
  missingApiKey: 'Configure an API key in settings before sending messages.',
  turnUndoLabelFallback: 'AI command',
  scriptUndoLabel: 'AI script',
  providerProxy: 'This deployment (recommended)',
  toolFailed: 'the tool failed; outcome unknown',
  agentModeCompact: 'Compact',
  agentModeCompactHint:
    'Compact — cheapest. The assistant works in at most 3 steps and stops; it does not loop to check itself.',
  outputTruncated:
    'The answer was cut off by the output limit, so part of the drawing may be missing. Ask for a smaller piece at a time.',
  guideProposalTitle: 'Proposed assistant guide',
  guideProposalNote: 'Saved only if you press Save draft — as your own draft, visible to you alone. Publish it later from the guide library.',
  guideFieldId: 'Id',
  guideFieldTitle: 'Title',
  guideFieldDescription: 'When to use (one line)',
  guideFieldBody: 'Content (Markdown)',
  guideSaveDraft: 'Save draft',
  guideDecline: 'Don\'t save'
} as const
