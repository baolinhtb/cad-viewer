/**
 * Vietnamese strings for the surfaces the generate flow touches.
 *
 * Partial on purpose. vue-i18n falls back to English for anything not
 * translated, so the locale grows one surface at a time instead of blocking on
 * a full translation pass — and a half-translated screen never appears,
 * because each surface is finished before it is added.
 *
 * Terminology follows the trade, not a dictionary: "bản vẽ" not "bức vẽ",
 * "lớp" stays "layer" because that is what engineers say in front of AutoCAD.
 */
export default {
  mainMenu: {
    new: 'Bản vẽ mới',
    open: 'Mở bản vẽ',
    drawingUnits: 'Đơn vị bản vẽ',
    exportMenu: 'Xuất',
    export: 'Xuất ra DXF',
    exportHtml: 'Xuất ra HTML',
    exportPdf: 'Xuất ra PDF',
    exportSvg: 'Xuất ra SVG',
    exportImage: 'Xuất ra ảnh',
    about: 'Giới thiệu'
  },
  ribbon: {
    tab: {
      home: 'Trang chính',
      insert: 'Chèn',
      tools: 'Công cụ'
    }
  },
  statusBar: {
    // Coordinates are values, so they are read in the mono face; the label
    // beside them is prose.
    coordinate: 'Tọa độ'
  }
}
