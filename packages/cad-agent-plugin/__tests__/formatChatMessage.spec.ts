/**
 * The chat palette's message text (UI acceptance 0.3.1b, V1/V4/V6): the
 * sentence before a tool call and the one after it ran together, and the
 * model's **bold** showed its asterisks.
 */
import {
  acapChatMessageHtml,
  acapEscapeHtml,
  acapJoinTextParts
} from '../src/ui/formatChatMessage'

describe('acapJoinTextParts: one paragraph a part', () => {
  test('the sentence before a tool and the one after it stay apart', () => {
    const joined = acapJoinTextParts([
      'Tôi sẽ kéo dài thân thêm 300 mm, đáy bệ và đỉnh bệ giữ nguyên.',
      'Chưa kéo dài được: hồ sơ dựng bằng bộ sinh 0.3.0.'
    ])
    expect(joined).not.toContain('nguyên.Chưa')
    expect(joined).toBe(
      'Tôi sẽ kéo dài thân thêm 300 mm, đáy bệ và đỉnh bệ giữ nguyên.\n\nChưa kéo dài được: hồ sơ dựng bằng bộ sinh 0.3.0.'
    )
  })

  test('three parts keep their order, nothing lost or merged', () => {
    const parts = ['Một.', 'Hai.', 'Ba.']
    expect(acapJoinTextParts(parts)).toBe('Một.\n\nHai.\n\nBa.')
  })

  test('no extra breaks where a part already has them; empty parts dropped', () => {
    expect(acapJoinTextParts(['Một.\n', 'Hai.'])).toBe('Một.\n\nHai.')
    expect(acapJoinTextParts(['Một.\n\n', 'Hai.'])).toBe('Một.\n\nHai.')
    expect(acapJoinTextParts(['Một.', '\nHai.'])).toBe('Một.\n\nHai.')
    expect(acapJoinTextParts(['Một.', '', '  ', 'Hai.'])).toBe('Một.\n\nHai.')
    expect(acapJoinTextParts(['Chỉ một phần.'])).toBe('Chỉ một phần.')
    expect(acapJoinTextParts([])).toBe('')
  })
})

describe('acapChatMessageHtml: escaped, **bold** rendered', () => {
  test('bold numbers and labels lose their asterisks, gain <strong>', () => {
    const html = acapChatMessageHtml(
      '**Lý do:** cao độ kê gối **235,854** m, **FG** tăng theo.'
    )
    expect(html).toBe(
      '<strong>Lý do:</strong> cao độ kê gối <strong>235,854</strong> m, <strong>FG</strong> tăng theo.'
    )
    expect(html).not.toContain('**')
  })

  test('a lone asterisk or an unclosed pair stays as written', () => {
    expect(acapChatMessageHtml('a * b')).toBe('a * b')
    expect(acapChatMessageHtml('2 * 3 = 6 và **chưa đóng')).toBe(
      '2 * 3 = 6 và **chưa đóng'
    )
    expect(acapChatMessageHtml('** cách **')).toBe('** cách **')
    expect(acapChatMessageHtml('****')).toBe('****')
  })

  test('bold does not run across lines', () => {
    expect(acapChatMessageHtml('**một\nhai**')).toBe('**một\nhai**')
  })

  test('HTML is escaped, never a tag', () => {
    expect(acapEscapeHtml('<b>&"\'')).toBe('&lt;b&gt;&amp;&quot;&#39;')
    const html = acapChatMessageHtml(
      '**<img src=x onerror=alert(1)>** và <script>'
    )
    expect(html).not.toMatch(/<img|<script/)
    expect(html).toBe(
      '<strong>&lt;img src=x onerror=alert(1)&gt;</strong> và &lt;script&gt;'
    )
  })

  test('paragraphs from the join survive', () => {
    const html = acapChatMessageHtml(
      acapJoinTextParts(['Tôi sẽ nâng **0,3 m**.', 'Đã nâng.'])
    )
    expect(html).toBe('Tôi sẽ nâng <strong>0,3 m</strong>.\n\nĐã nâng.')
  })
})

// QA P1/M6 (S1, S2, S5): parameter tables showed as bare pipes.
describe('acapChatMessageHtml: GFM tables', () => {
  test('a two-column table with a header becomes a table, every cell kept', () => {
    const html = acapChatMessageHtml(
      [
        'Thông số đã dùng:',
        '',
        '| Thông số | Giá trị |',
        '| --- | --- |',
        '| Dài bệ | 6000 mm |',
        '| Cao bệ | **2000** mm |',
        '',
        'Hồ sơ là bản nháp.'
      ].join('\n')
    )
    expect(html).toBe(
      // The table is a block: no line break kept next to it.
      'Thông số đã dùng:' +
        '<table class="cad-agent-msg-table">' +
        '<thead><tr><th>Thông số</th><th>Giá trị</th></tr></thead>' +
        '<tbody><tr><td>Dài bệ</td><td>6000 mm</td></tr>' +
        '<tr><td>Cao bệ</td><td><strong>2000</strong> mm</td></tr></tbody>' +
        '</table>' +
        'Hồ sơ là bản nháp.'
    )
    expect(html).not.toMatch(/\| Dài bệ/)
  })

  test('rows without a separator: a table without a header', () => {
    const html = acapChatMessageHtml(
      '| Dài bệ | 6000 mm |\n| Cao bệ | 2000 mm |'
    )
    expect(html).toBe(
      '<table class="cad-agent-msg-table"><tbody>' +
        '<tr><td>Dài bệ</td><td>6000 mm</td></tr>' +
        '<tr><td>Cao bệ</td><td>2000 mm</td></tr></tbody></table>'
    )
  })

  test('HTML in a cell is escaped', () => {
    const html = acapChatMessageHtml(
      '| A | B |\n| --- | --- |\n| <script>x</script> | a & b |'
    )
    expect(html).not.toContain('<script>')
    expect(html).toContain('<td>&lt;script&gt;x&lt;/script&gt;</td>')
    expect(html).toContain('<td>a &amp; b</td>')
  })

  test('a lone pipe line, or a header with no rows, is not a table', () => {
    expect(acapChatMessageHtml('| chỉ một dòng |')).toBe('| chỉ một dòng |')
    expect(acapChatMessageHtml('a | b | c')).toBe('a | b | c')
    expect(acapChatMessageHtml('| A | B |\n| --- | --- |')).toBe(
      '| A | B |\n| --- | --- |'
    )
  })

  test('text and bold around a table stay as they were', () => {
    const html = acapChatMessageHtml(
      'Trước **đậm**.\n| x | y |\n| 1 | 2 |\nSau.\n\nĐoạn mới.'
    )
    expect(html).toBe(
      'Trước <strong>đậm</strong>.' +
        '<table class="cad-agent-msg-table"><tbody>' +
        '<tr><td>x</td><td>y</td></tr><tr><td>1</td><td>2</td></tr>' +
        '</tbody></table>' +
        'Sau.\n\nĐoạn mới.'
    )
  })
})
