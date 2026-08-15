import {
  findRolesWithoutLayer,
  SEED_ROLE_LAYERS,
  SEED_ROLES
} from '../src/AcTpSeed'
import { AcTpParamSpec, validateParamValues } from '../src/AcTpTemplate'

const PARAMS: readonly AcTpParamSpec[] = [
  {
    key: 'L',
    label: 'Chiều dài nhịp',
    type: 'number',
    unit: 'm',
    min: 6,
    max: 24,
    default: 12
  },
  {
    key: 'B',
    label: 'Bề rộng cầu',
    type: 'number',
    unit: 'm',
    min: 4,
    max: 20
  },
  {
    key: 'lop_phu',
    label: 'Loại lớp phủ',
    type: 'choice',
    choices: [
      { value: 'btn', label: 'Bê tông nhựa' },
      { value: 'btxm', label: 'Bê tông xi măng' }
    ]
  }
]

describe('validateParamValues', () => {
  test('accepts values inside the declared range', () => {
    expect(
      validateParamValues(PARAMS, { L: 12, B: 9, lop_phu: 'btn' })
    ).toEqual([])
  })

  test('reports the field, the bound and the unit — not just "invalid"', () => {
    const errors = validateParamValues(PARAMS, { L: 30, B: 9, lop_phu: 'btn' })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('Chiều dài nhịp')
    expect(errors[0]).toContain('24')
    expect(errors[0]).toContain('m')
  })

  test('reports a missing value only when there is no default to fall back on', () => {
    // L has a default, B does not.
    const errors = validateParamValues(PARAMS, { lop_phu: 'btn' })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('Bề rộng cầu')
  })

  test('rejects a choice outside the declared list and names the options', () => {
    const errors = validateParamValues(PARAMS, { L: 12, B: 9, lop_phu: 'gach' })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('btn')
    expect(errors[0]).toContain('btxm')
  })

  test('rejects text where a number is declared', () => {
    const errors = validateParamValues(PARAMS, {
      L: 'mười hai',
      B: 9,
      lop_phu: 'btn'
    })

    expect(errors[0]).toContain('phải là một số')
  })
})

describe('seed standardisation data', () => {
  test('every seeded role has a layer to draw on', () => {
    expect(findRolesWithoutLayer()).toEqual([])
  })

  test('role keys are ASCII slugs so they can be matched by machine', () => {
    for (const role of Object.keys(SEED_ROLES)) {
      expect(role).toMatch(/^[a-z0-9_]+$/)
    }
  })

  test('layer names are declared for exactly the seeded roles', () => {
    expect(Object.keys(SEED_ROLE_LAYERS).sort()).toEqual(
      Object.keys(SEED_ROLES).sort()
    )
  })
})
