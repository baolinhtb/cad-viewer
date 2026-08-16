import { AcEdCommandStack } from '../editor'
import { AcApI18n, AcApLocale } from './AcApI18n'
import csCommand from './cs/command'
import csJig from './cs/jig'
import csMain from './cs/main'
import enCommand from './en/command'
import enJig from './en/jig'
import enMain from './en/main'
import trCommand from './tr/command'
import trJig from './tr/jig'
import trMain from './tr/main'
import viCommand from './vi/command'
import viJig from './vi/jig'
import viMain from './vi/main'
import zhCommand from './zh/command'
import zhJig from './zh/jig'
import zhMain from './zh/main'

// Register core locale messages
AcApI18n.mergeLocaleMessage('en', {
  command: enCommand,
  jig: enJig,
  main: enMain
})
AcApI18n.mergeLocaleMessage('zh', {
  command: zhCommand,
  jig: zhJig,
  main: zhMain
})
AcApI18n.mergeLocaleMessage('tr', {
  command: trCommand,
  jig: trJig,
  main: trMain
})
AcApI18n.mergeLocaleMessage('cs', {
  command: csCommand,
  jig: csJig,
  main: csMain
})
AcApI18n.mergeLocaleMessage('vi', {
  command: viCommand,
  jig: viJig,
  main: viMain
})

export const cmdDescription = (groupName: string, cmdName: string) => {
  const key = `command.${groupName}.${cmdName}`
  return AcApI18n.t(key)
}

export const sysCmdDescription = (name: string) => {
  return cmdDescription(AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME, name)
}

export const userCmdDescription = (name: string) => {
  return cmdDescription(AcEdCommandStack.DEFAUT_COMMAND_GROUP_NAME, name)
}

export { AcApI18n, type AcApLocale }
