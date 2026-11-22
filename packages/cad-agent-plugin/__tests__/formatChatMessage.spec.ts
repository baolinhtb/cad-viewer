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
