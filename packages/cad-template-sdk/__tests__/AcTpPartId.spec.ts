import { formatPartId, parsePartId, SIDES } from '../src/AcTpPartId'

/**
 * Pins the partId convention.
 *
 * `role` says what a thing is; `partId` says which one. If templates each
 * invent their own scheme, "lan can bên phải" stops being addressable — and
 * the discovery happens at query time, after drawings carrying unparseable
 * ids have already been generated and saved.
 */
describe('partId convention', () => {
  test.each([
    [{ role: 'ban_mat_cau' }, 'ban_mat_cau'],
    [{ role: 'lan_can', side: 'trai' as const }, 'lan_can_trai'],
    [{ role: 'ong_thoat_nuoc', ordinal: 3 }, 'ong_thoat_nuoc_03'],
    [{ role: 'goi_cau', side: 'phai' as const, ordinal: 12 }, 'goi_cau_phai_12']
  ])('%j formats as %s', (parts, expected) => {
    expect(formatPartId(parts)).toBe(expected)
  })

  test('ordinals are zero-padded so ids sort in drawing order', () => {
    // Without padding, "ong_thoat_nuoc_10" sorts before "..._2" in every
    // string comparison the digest and the UI do.
    const ids = [1, 2, 10].map(ordinal =>
      formatPartId({ role: 'ong_thoat_nuoc', ordinal })
    )
    expect([...ids].sort()).toEqual(ids)
  })

  test('a nonsensical ordinal is a template bug, not a part', () => {
    for (const ordinal of [0, -1, 1.5]) {
      expect(() => formatPartId({ role: 'goi_cau', ordinal })).toThrow(
        /số nguyên dương/
      )
    }
  })

  test('every id it builds, it can read back', () => {
    const cases = [
      { role: 'ban_mat_cau' },
      { role: 'lan_can', side: 'trai' as const },
      { role: 'lan_can', side: 'phai' as const },
      { role: 'ong_thoat_nuoc', ordinal: 7 },
      { role: 'goi_cau', side: 'phai' as const, ordinal: 2 }
    ]
    for (const parts of cases) {
      expect(parsePartId(formatPartId(parts), parts.role)).toEqual(parts)
    }
  })

  test('an id belonging to another role is rejected, not guessed at', () => {
    // The tag and the id disagreeing is worth surfacing. Reading it as "no
    // side, no ordinal" would quietly make two rails indistinguishable.
    expect(parsePartId('lan_can_trai', 'go_chan_banh')).toBeUndefined()
  })

  test('ids from an older ad-hoc scheme are rejected rather than misread', () => {
    // These are the ids the first template shipped with. They must not parse
    // into a plausible-looking wrong answer.
    expect(parsePartId('lc_trai_01', 'lan_can')).toBeUndefined()
    expect(parsePartId('otn_01', 'ong_thoat_nuoc')).toBeUndefined()
  })

  test('sides are named by chainage direction', () => {
    // Screen-left flips when the section is mirrored; chainage does not.
    expect(SIDES).toEqual(['trai', 'phai'])
  })
})
