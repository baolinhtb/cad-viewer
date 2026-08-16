import type { Config } from 'jest'

const config: Config = {
  verbose: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Workers are reused across suites and this repo's suites are heavy: the
  // renderer and data-model ones leave hundreds of megabytes behind. Without a
  // ceiling the worker eventually dies with "Ineffective mark-compacts near
  // heap limit", and the suite it happened to be running gets blamed for it.
  // Recycling the worker instead keeps a full run from depending on how many
  // suites exist.
  workerIdleMemoryLimit: '1GB',
  transform: {
    // Transpile-only for the agent package — see tsconfig.jest.agent.json for
    // why. Listed first because jest takes the first pattern that matches.
    'packages/cad-agent-plugin/.*\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.jest.agent.json'
      }
    ],
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.jest.json'
      }
    ],
    '^.+\\.js$': [
      'ts-jest',
      {
        tsconfig: {
          allowJs: true
        }
      }
    ]
  },
  transformIgnorePatterns: [
    '/node_modules/(?!.*(mtext-parser|rbush|quickselect))'
  ],
  testPathIgnorePatterns: [
    '/e2e/',
    '/__tests__/helpers/',
    // The service tests run on node:test (`pnpm test:server`); jest cannot
    // parse them and does not need to.
    '<rootDir>/server/'
  ],
  moduleNameMapper: {
    '^lodash-es$': 'lodash',
    '^three/examples/jsm/lines/LineMaterial\\.js$':
      '<rootDir>/test/mocks/three/LineMaterial.js',
    '^three/examples/jsm/lines/LineSegments2\\.js$':
      '<rootDir>/test/mocks/three/LineSegments2.js',
    '^three/examples/jsm/lines/LineSegmentsGeometry\\.js$':
      '<rootDir>/test/mocks/three/LineSegmentsGeometry.js',
    '^three/examples/jsm/renderers/CSS2DRenderer\\.js$':
      '<rootDir>/test/mocks/three/CSS2DRenderer.js',
    '^three/examples/jsm/utils/BufferGeometryUtils\\.js$':
      '<rootDir>/test/mocks/three/BufferGeometryUtils.js',
    '^three/examples/jsm/controls/OrbitControls(\\.js)?$':
      '<rootDir>/test/mocks/three/OrbitControls.js'
  }
}

export default config
