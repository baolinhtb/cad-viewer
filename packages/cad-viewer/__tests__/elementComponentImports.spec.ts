import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Every `<el-*>` tag a component uses must be imported by that component.
 *
 * This project registers Element Plus components per file rather than
 * globally. Miss an import and Vue cannot resolve the tag, so it renders
 * nothing — and in a production build the "Failed to resolve component"
 * warning is compiled out. The result is a component that mounts, occupies no
 * DOM, and reports no error anywhere.
 *
 * That is exactly how `MlTemplateDlg` shipped: the `template` command ran, the
 * dialog manager toggled it visible, and nothing appeared. It survived a green
 * build, a green test run and three rounds of manual checking, because the
 * only symptom is absence.
 */
const SRC = join(__dirname, '../src')

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return vueFiles(path)
    return path.endsWith('.vue') ? [path] : []
  })
}

/** `el-input-number` → `ElInputNumber` */
function tagToComponent(tag: string): string {
  return tag
    .split('-')
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join('')
}

const files = vueFiles(SRC).map(
  path => [path.slice(SRC.length + 1), readFileSync(path, 'utf8')] as const
)

/**
 * Tags provided by an ancestor rather than imported here — Element Plus
 * registers these as children of a parent that is imported.
 */
const PROVIDED_BY_PARENT = new Set(['ElOption', 'ElFormItem', 'ElOptionGroup'])

describe('Element Plus component imports', () => {
  const offenders = files
    .map(([name, source]) => {
      // Blocks are matched by name rather than by position: several components
      // put `<template>` first, and slicing at its offset then searches an
      // empty string for the imports and reports every file as an offender.
      const template = /<template>([\s\S]*)<\/template>/.exec(source)?.[1] ?? ''
      const script = [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
        .map(match => match[1])
        .join('\n')

      const used = new Set(
        [...template.matchAll(/<(el-[a-z0-9-]+)/g)].map(m =>
          tagToComponent(m[1])
        )
      )
      const missing = [...used].filter(
        component =>
          !PROVIDED_BY_PARENT.has(component) &&
          !new RegExp(`\\b${component}\\b`).test(script)
      )
      return [name, missing] as const
    })
    .filter(([, missing]) => missing.length > 0)
    .map(([name, missing]) => `${name}: ${missing.join(', ')}`)

  test('there are components to check', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  test('no component uses an el-* tag it does not import', () => {
    expect(offenders).toEqual([])
  })
})
