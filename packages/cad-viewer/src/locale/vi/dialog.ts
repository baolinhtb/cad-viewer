/**
 * Vietnamese strings.
 *
 * Partial on purpose: vue-i18n falls back to English for anything not
 * translated yet, so the locale can grow one surface at a time instead of
 * blocking on a full translation pass (see story 1.12).
 */
export default {
  templateDlg: {
    title: 'Sinh bản vẽ từ template',
    template: 'Template',
    showAll: 'Xem tất cả thông số trên một trang',
    back: 'Quay lại',
    next: 'Tiếp',
    generate: 'Sinh bản vẽ',
    done: 'Đã sinh bản vẽ. {count} đối tượng, {layers} layer.'
  }
}
