import type { AcTpBtklResult } from '../../src/btkl'

const n3 = (v: number) =>
  (Math.round(v * 1000) / 1000)
    .toFixed(3)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d),)/g, ' ')
const cell = (s: string) => s.replace(/\|/g, '\\|')

/**
 * The M1 comparison table as Markdown: every line, the source value, the
 * computed value, the difference (computed − source) and the source/flags.
 */
export function btklCompareMarkdown(r: AcTpBtklResult, when: string): string {
  const rows = r.items.map(i => {
    const src = i.banGoc === undefined ? '—' : n3(i.banGoc)
    const val = i.khoiLuong === null ? '—' : n3(i.khoiLuong)
    const diff =
      i.banGoc === undefined || i.khoiLuong === null
        ? '—'
        : Math.abs(i.khoiLuong - i.banGoc) < 0.0005
          ? '0'
          : (i.khoiLuong > i.banGoc ? '+' : '−') +
            n3(Math.abs(i.khoiLuong - i.banGoc))
    const origin = {
      tham_so: 'tham số',
      ban_goc: 'số bản gốc',
      tu_choi: 'từ chối'
    }[i.nguon]
    const notes = [
      origin,
      ...(i.trongTong ? [] : ['không cộng tổng']),
      ...(i.flags ?? []).map(f => `⚑ \`${f.code}\``),
      ...(i.lyDo ? [i.lyDo] : [])
    ].join('; ')
    return `| ${i.stt} | ${cell(i.hangMuc)} | ${i.donVi.replace('m3', 'm³').replace('m2', 'm²')} | ${src} | ${val} | ${diff} | ${cell(notes)} |`
  })
  const flags = r.items.flatMap(i =>
    (i.flags ?? []).map(f => `- \`${f.code}\` (${i.stt}): ${f.message}`)
  )
  return [
    `# Đối chiếu BTKL ${r.doiTuong} với bảng SUB-100 bản gốc`,
    '',
    `Sinh bởi \`tools/fidelity/btkl-xuat.mjs\` (${when}) từ \`acTpBtklMo()\` với tham số mặc định. Không sửa tay.`,
    '',
    'Chênh = tính được − bản gốc.',
    '',
    '| STT | Hạng mục | Đơn vị | Bản gốc | Tính được | Chênh | Nguồn / cờ |',
    '|---|---|---|---:|---:|---:|---|',
    ...rows,
    '',
    '## Cờ',
    '',
    ...flags,
    ''
  ].join('\n')
}
