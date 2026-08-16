import { AcEdCommandStack } from '../src/editor/command/AcEdCommandStack'
import { AcApPluginManager } from '../src/plugin/AcApPluginManager'

/**
 * Pins the contract the command line depends on.
 *
 * `AcEdCommandLine` used to resolve a typed command against the command stack
 * alone. A lazy plugin's commands are not in the stack until the plugin loads,
 * and the plugin does not load until one of them is asked for — so every lazy
 * command (`cpdf`, `csvg`, `template`) was rejected as unknown when typed,
 * while the same command worked from a ribbon button, which reaches
 * `sendStringToExecute` directly. The command line now asks
 * {@link AcApPluginManager.isLazyPluginTrigger} before giving up, and it
 * upper-cases the word first, so these are the cases that must hold.
 */
function managerWithTrigger(...triggers: string[]): AcApPluginManager {
  const commandManager = new AcEdCommandStack()
  const manager = new AcApPluginManager({} as never, commandManager)
  manager.registerLazyPlugin({
    name: 'TestPlugin',
    triggers,
    loader: async () => {
      throw new Error('not loaded in this test')
    }
  })
  return manager
}

describe('lazy plugin triggers', () => {
  test('a registered trigger is recognised', () => {
    expect(managerWithTrigger('template').isLazyPluginTrigger('template')).toBe(
      true
    )
  })

  test('recognition survives the command line upper-casing the word first', () => {
    // The command line normalises to upper case before asking. Double
    // normalisation has to be harmless or every lazy command breaks again.
    const manager = managerWithTrigger('template')
    for (const typed of ['template', 'TEMPLATE', 'Template', '  template  ']) {
      expect(manager.isLazyPluginTrigger(typed)).toBe(true)
    }
  })

  test('an unrelated word is not a trigger', () => {
    const manager = managerWithTrigger('template')
    expect(manager.isLazyPluginTrigger('line')).toBe(false)
    expect(manager.isLazyPluginTrigger('templates')).toBe(false)
  })

  test('every trigger of a plugin is registered, not just the first', () => {
    const manager = managerWithTrigger('cpdf', 'ipdf')
    expect(manager.isLazyPluginTrigger('cpdf')).toBe(true)
    expect(manager.isLazyPluginTrigger('ipdf')).toBe(true)
  })

  test('two plugins cannot claim the same trigger', () => {
    // Silently letting the second registration win would make which plugin
    // loads depend on import order.
    const manager = managerWithTrigger('template')
    expect(() =>
      manager.registerLazyPlugin({
        name: 'OtherPlugin',
        triggers: ['template'],
        loader: async () => {
          throw new Error('unused')
        }
      })
    ).toThrow(/already registered/)
  })
})
