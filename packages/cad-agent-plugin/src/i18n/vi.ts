/**
 * Vietnamese UI strings for the CAD Agent panel.
 *
 * Flat keys under `main.toolPalette.agent` (merged into {@link AcApI18n}).
 * Keys must stay in sync with {@link agentEn}.
 *
 * This is the locale the engineers using the product actually work in; until
 * it existed every agent string rendered as its own key — a panel that said
 * `verificationTitle` where it meant "Kiểm tra bản vẽ".
 */
export const agentVi = {
  tab: 'Trợ lý',
  title: 'CAD Agent',
  settings: 'Thiết lập',
  clear: 'Xoá hội thoại',
  close: 'Đóng',
  provider: 'Nguồn mô hình',
  providerDeepseek: 'DeepSeek',
  providerDeepseekVl: 'DeepSeek VL (đọc ảnh)',
  providerDeepseekVlHint:
    'Dùng endpoint tương thích OpenAI có đọc ảnh (mặc định: SiliconFlow). Nếu tự dựng vLLM, đặt Base URL trỏ vào máy chủ của bạn, ví dụ http://127.0.0.1:8000/v1.',
  providerOpenai: 'OpenAI',
  providerAnthropic: 'Anthropic',
  providerOpenaiCompatible: 'Tương thích OpenAI',
  baseUrl: 'Base URL',
  model: 'Mô hình',
  visionModels: 'Mô hình đọc được ảnh',
  textModels: 'Mô hình chỉ đọc chữ',
  customModel: 'Mô hình tự nhập…',
  customModelName: 'Tên mô hình',
  modelSupportsVision: 'Nhận ảnh đầu vào',
  modelTextOnly: 'Chỉ chữ — không đính kèm được ảnh',
  apiKey: 'API Key',
  saveSettings: 'Lưu thiết lập',
  emptyHint:
    'Mô tả hình cần vẽ, hoặc đính kèm ảnh tham chiếu (bản phác, ảnh chụp màn hình, mặt bằng).',
  toolPrefix: 'công cụ',
  inputPlaceholder: 'Mô tả hình cần vẽ…',
  attachImage: 'Đính kèm ảnh',
  removeAttachment: 'Bỏ',
  imageAlt: 'Ảnh đính kèm',
  errorTitle: 'Có lỗi xảy ra',
  dismissError: 'Bỏ qua',
  send: 'Gửi',
  stop: 'Dừng',
  working: 'Đang xử lý…',
  agentMode: 'Chế độ',
  agentModeSimple: 'Nhanh',
  agentModeHighInference: 'Suy luận sâu',
  agentModeSimpleHint: 'Nhanh — không chụp màn hình kiểm lại sau khi vẽ.',
  agentModeHighInferenceHint:
    'Vẽ xong thì chụp màn hình và nhờ mô hình đọc ảnh kiểm lại (tối đa 5 vòng). Cần mô hình đọc được ảnh.',
  highInferenceRequiresVision:
    'Chế độ suy luận sâu cần một mô hình đọc được ảnh.',
  verificationTitle: 'Kiểm tra bản vẽ',
  verifying: 'Đang đối chiếu ảnh bản vẽ với yêu cầu và ảnh tham chiếu…',
  verificationPassed: 'Đạt — bản vẽ khớp với yêu cầu.',
  verificationFailed: 'Chưa đạt — các điểm cần sửa:',
  verificationSkipped: 'Bỏ qua bước kiểm',
  verificationError: 'Lỗi khi kiểm tra',
  verificationContinuing: 'Tiếp tục chỉnh lại bản vẽ…',
  verificationMaxAttempts: 'Đã hết số vòng kiểm mà vẫn chưa đạt.',
  referenceImages: 'Ảnh tham chiếu',
  drawingScreenshot: 'Ảnh bản vẽ hiện tại',
  unsavedSettings: 'Lưu thiết lập trước khi gửi tin nhắn.',
  missingApiKey: 'Cấu hình API key trong thiết lập trước khi gửi tin nhắn.',
  turnUndoLabelFallback: 'Lệnh AI',
  providerProxy: 'Máy chủ của hệ thống (khuyến nghị)',
  toolFailed: 'công cụ chạy lỗi, chưa rõ kết quả',
  agentModeOneCall: 'Một lời gọi',
  agentModeOneCallHint: 'Một lời gọi — rẻ nhất. Trợ lý làm một lượt rồi dừng, không đọc lại kết quả để tự sửa.',
  outputTruncated:
    'Câu trả lời bị cắt vì chạm giới hạn độ dài, nên có thể thiếu một phần hình. Hãy yêu cầu từng phần nhỏ hơn.'
} as const
