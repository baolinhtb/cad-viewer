import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

/**
 * Guards how lazy plugin loaders import their plugin.
 *
 * A loader that dynamic-imports a relative module from its `register` subpath
 * entry builds into a chunk reference that resolves to `undefined` at runtime.
 * The destructure then throws, `loadByTrigger` catches it into a console error
 * and returns false, and the command reports "not found". Everything else
 * looks healthy: the unit tests pass, the build is green, the chunk is even
 * emitted and served.
 *
 * That is exactly what happened to the template plugin, and it made the whole
 * generate flow unreachable in the deployed app while every test stayed green.
 * The rule is one line and it is checked here because nothing else can see it:
 * a loader imports the package entry.
 */
const PACKAGES_DIR = join(__dirname, '../..')

function lazyRegisterFiles(): Array<[string, string]> {
  return readdirSync(PACKAGES_DIR)
    .map(pkg => [pkg, join(PACKAGES_DIR, pkg, 'src/register.ts')] as const)
    .filter(([, path]) => {
      try {
        return readFileSync(path, 'utf8').includes('registerLazyPlugin')
      } catch {
        return false
      }
    })
    .map(([pkg, path]) => [pkg, readFileSync(path, 'utf8')])
}

describe('lazy plugin loaders', () => {
  const files = lazyRegisterFiles()

  test('there are lazy plugins to check', () => {
    // A rename that empties the list would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(0)
  })

  test.each(files.map(([pkg]) => pkg))(
    '%s imports its plugin by package name',
    pkg => {
      const source = files.find(([name]) => name === pkg)![1]
      const dynamicImports = [...source.matchAll(/await import\(\s*'([^']+)'/g)]
        .map(match => match[1])
        .filter(specifier => specifier.startsWith('.'))

      expect(dynamicImports).toEqual([])
    }
  )

  /**
   * The other half of the rule.
   *
   * Importing the package by name only works if rollup is told to leave that
   * import alone. Resolving it means resolving `dist/`, which the build is
   * what produces — so a package that self-imports without externalising its
   * own name builds fine wherever a stale `dist/` happens to exist and fails
   * in a clean tree. That is a defect that reaches CI and never reaches a
   * developer's machine.
   */
  test.each(files.map(([pkg]) => pkg))(
    '%s externalises its own name in the vite config',
    pkg => {
      const source = files.find(([name]) => name === pkg)![1]
      const selfImports = [...source.matchAll(/await import\(\s*'([^']+)'/g)]
        .map(match => match[1])
        .filter(specifier => specifier.startsWith('@mlightcad/'))
      if (selfImports.length === 0) return

      const config = readFileSync(
        join(PACKAGES_DIR, pkg, 'vite.config.ts'),
        'utf8'
      )
      const missing = selfImports.filter(
        name => !config.includes(`'${name}'`) && !config.includes('packageName')
      )

      expect(missing).toEqual([])
      expect(config).toMatch(/external:\s*\[/)
    }
  )
})
