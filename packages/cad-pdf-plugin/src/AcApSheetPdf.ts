import { jsPDF } from 'jspdf'

export interface AcApSvgSheet {
  svg: string
  title: string
  widthMm: number
  heightMm: number
}

/** Multi-page sheet export. Rasterising each SVG in the browser preserves
 * Vietnamese text without substituting jsPDF's Latin-only built-in fonts.
 * One canvas at a time bounds memory; the editable master remains DXF. */
export async function downloadSvgSheetsAsPdf(
  sheets: readonly AcApSvgSheet[],
  filename: string
): Promise<void> {
  if (!sheets.length) throw new Error('Chưa có tờ bản vẽ để xuất PDF.')
  const first = sheets[0]
  const pdf = new jsPDF({
    orientation: first.widthMm >= first.heightMm ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [first.widthMm, first.heightMm],
    compress: true
  })
  pdf.setProperties({
    title: 'Hồ sơ bản nháp',
    subject: 'Bản nháp — chưa phát hành thi công'
  })
  for (const [index, sheet] of sheets.entries()) {
    if (
      !Number.isFinite(sheet.widthMm) ||
      !Number.isFinite(sheet.heightMm) ||
      sheet.widthMm <= 0 ||
      sheet.heightMm <= 0 ||
      sheet.widthMm > 1200 ||
      sheet.heightMm > 1200
    )
      throw new Error('Khổ giấy PDF không hợp lệ.')
    if (index)
      pdf.addPage(
        [sheet.widthMm, sheet.heightMm],
        sheet.widthMm >= sheet.heightMm ? 'landscape' : 'portrait'
      )
    const canvas = document.createElement('canvas')
    const dpi = 200
    canvas.width = Math.round((sheet.widthMm / 25.4) * dpi)
    canvas.height = Math.round((sheet.heightMm / 25.4) * dpi)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Không khởi tạo được trang PDF.')
    const url = URL.createObjectURL(
      new Blob([sheet.svg], { type: 'image/svg+xml' })
    )
    try {
      const image = new Image()
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(
          () => reject(new Error(`Hết thời gian dựng tờ ${sheet.title}.`)),
          20000
        )
        image.onload = () => {
          window.clearTimeout(timer)
          resolve()
        }
        image.onerror = () => {
          window.clearTimeout(timer)
          reject(new Error(`Không dựng được tờ ${sheet.title}.`))
        }
        image.src = url
      })
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      pdf.addImage(
        canvas.toDataURL('image/jpeg', 0.96),
        'JPEG',
        0,
        0,
        sheet.widthMm,
        sheet.heightMm
      )
    } finally {
      URL.revokeObjectURL(url)
      canvas.width = 0
      canvas.height = 0
    }
  }
  pdf.save(filename)
}
