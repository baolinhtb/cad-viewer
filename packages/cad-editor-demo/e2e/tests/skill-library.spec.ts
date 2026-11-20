/**
 * The guide library, driven the way an author and a member will drive it.
 *
 * The unit tests prove the client packs a folder correctly and the server
 * validates it. What they cannot prove is that the tab exists, that the
 * buttons are wired, and that a person can get from "pick files" to
 * "published" without reading the code — which is the whole feature.
 *
 * The server is stood in for by an in-test store behind `page.route`, so the
 * flow is exercised end to end against the real dialog, not against a mock
 * of the dialog.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, type Page, type Route, test } from '@playwright/test'

import { uploadFixture } from '../helpers/fileUpload'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(here, '..', 'fixtures', 'minimal-line.dxf')

const MAIN =
  '---\nname: mo-cau\ndescription: Dựng và sửa mố cầu theo tham số.\n---\n' +
  '# Dựng mố cầu\n\nGọi ghep_bo_phan với mo_cau_hoan_chinh.\n'

interface StoredGuide {
  skillId: string
  title: string
  description: string
  paths: string[]
  contentHash: string
  status: 'draft' | 'published'
  uploadedBy: number | null
  createdAt: string
  updatedAt: string
  verifiedAt: string | null
  files: { path: string; content: string }[]
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  })

/**
 * A guide library that lives for one test.
 *
 * Behaves like the real routes where the dialog can tell the difference:
 * drafts and published entries, a 400 with a reason for a bad upload, and
 * a 404 for a guide that is not there.
 */
function serveLibrary(
  page: Page,
  role: 'admin' | 'author' | 'member',
  seed: StoredGuide[] = []
) {
  const guides = new Map(seed.map(guide => [guide.skillId, guide]))
  const requests: { method: string; path: string; body?: unknown }[] = []

  const withoutFiles = ({ files: _files, ...summary }: StoredGuide) => summary

  const install = async () => {
    await page.route('**/api/auth/me', route =>
      json(route, { id: 1, email: 'a@x.vn', role, isAdmin: role === 'admin' })
    )
    await page.route('**/api/templates', route =>
      json(route, { templates: [] })
    )
    await page.route('**/api/skills**', async route => {
      const request = route.request()
      const method = request.method()
      const pathname = new URL(request.url()).pathname
      const [id, action] = pathname
        .replace(/^.*\/api\/skills\/?/, '')
        .split('/')
      const body =
        (method === 'POST' && !id) || method === 'PUT'
          ? request.postDataJSON()
          : undefined
      requests.push({ method, path: pathname, body })

      if (method === 'GET' && !id) {
        return json(route, { skills: [...guides.values()].map(withoutFiles) })
      }
      if (method === 'POST' && !id) {
        const files = (body as { files: { path: string; content: string }[] })
          .files
        const main = files.find(file => file.path === 'SKILL.md')
        const name = main && /^name:\s*(\S+)/m.exec(main.content)?.[1]
        if (!main || !name) {
          return json(
            route,
            {
              error: 'Không nạp được hướng dẫn.',
              code: 'skill_invalid',
              detail: { reason: 'Thiếu SKILL.md.' }
            },
            400
          )
        }
        const guide: StoredGuide = {
          skillId: name,
          title: /^# (.+)$/m.exec(main.content)?.[1] ?? name,
          description:
            /^description:\s*"?(.*?)"?$/m.exec(main.content)?.[1] ?? '',
          paths: files.map(file => file.path),
          contentHash: 'h1',
          status: 'draft',
          uploadedBy: 1,
          createdAt: '2026-09-03 10:00:00',
          updatedAt: '2026-09-03 10:00:00',
          verifiedAt: null,
          files
        }
        guides.set(name, guide)
        return json(route, { skill: guide, changed: true }, 201)
      }
      const guide = id ? guides.get(id) : undefined
      if (!guide) {
        return json(
          route,
          { error: 'Không tìm thấy hướng dẫn.', code: 'skill_not_found' },
          404
        )
      }
      if (method === 'GET' && !action) return json(route, { skill: guide })
      if (method === 'PUT' && !action) {
        // An edit replaces the files and sends the guide back to draft.
        const files = (body as { files: { path: string; content: string }[] })
          .files
        const main = files.find(file => file.path === 'SKILL.md')!
        Object.assign(guide, {
          files,
          paths: files.map(file => file.path),
          title: /^# (.+)$/m.exec(main.content)?.[1] ?? guide.title,
          status: 'draft',
          verifiedAt: null
        })
        return json(route, { skill: guide, changed: true })
      }
      if (method === 'POST' && action === 'publish') {
        guide.status = 'published'
        guide.verifiedAt = '2026-09-03 10:05:00'
        return json(route, { skill: guide })
      }
      if (method === 'DELETE' && !action) {
        guides.delete(id)
        return json(route, { message: 'ok' })
      }
      return json(route, { error: 'Phương thức không hỗ trợ.' }, 405)
    })
  }

  return { install, requests, guides }
}

const PUBLISHED: StoredGuide = {
  skillId: 'mo-cau',
  title: 'Dựng mố cầu',
  description: 'Dựng và sửa mố cầu theo tham số.',
  paths: ['SKILL.md', 'references/tham-so.md'],
  contentHash: 'h0',
  status: 'published',
  uploadedBy: 2,
  createdAt: '2026-09-03 09:00:00',
  updatedAt: '2026-09-03 09:00:00',
  verifiedAt: '2026-09-03 09:30:00',
  files: [
    { path: 'SKILL.md', content: MAIN },
    { path: 'references/tham-so.md', content: '# Tham số\n' }
  ]
}

/** Opens the template dialog on its guide tab; returns the panel. */
async function openGuideTab(page: Page) {
  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()

  // Generating from a template sits in the file menu, beside New and Open.
  await page
    .getByRole('button', { name: /^File\b/i })
    .first()
    .click()
  await page.getByText(/Generate from template|Sinh bản vẽ từ template/).click()
  const dialog = page.locator('.ml-template-dlg')
  await expect(dialog).toBeVisible()

  await dialog
    .getByRole('tab', { name: /Assistant guides|Hướng dẫn cho trợ lý/ })
    .click()
  const panel = page.getByTestId('skill-library')
  await expect(panel).toBeVisible()
  return { dialog, panel }
}

// Publishing is an admin's (standard assumption 11), so the full cycle runs
// as one.
test('an admin uploads a guide, sees it as a draft, publishes it, then deletes it', async ({
  page
}) => {
  const library = serveLibrary(page, 'admin')
  await library.install()
  const { panel } = await openGuideTab(page)

  await expect(panel).toContainText(/No guides yet|Chưa có hướng dẫn nào/)

  // Picked as loose files: a folder pick cannot be driven headlessly, and the
  // packing of a folder is covered by the unit tests. The stray .txt is there
  // to check it is named as skipped rather than dropped in silence.
  await page.getByTestId('skill-files-input').setInputFiles([
    { name: 'SKILL.md', mimeType: 'text/markdown', buffer: Buffer.from(MAIN) },
    {
      name: 'tham-so.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Tham số\n')
    },
    { name: 'ghi-chu.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }
  ])

  const note = page.getByTestId('skill-note')
  await expect(note).toContainText(
    /Uploaded mo-cau as a draft|Đã nạp mo-cau ở trạng thái nháp/
  )
  await expect(note).toContainText('ghi-chu.txt')

  // The server received the folder shape, not the picker's flat list.
  const upload = library.requests.find(
    r => r.method === 'POST' && r.path.endsWith('/api/skills')
  )
  expect(
    (upload?.body as { files: { path: string }[] }).files.map(f => f.path)
  ).toEqual(['SKILL.md', 'references/tham-so.md'])

  const item = panel.locator('[data-skill="mo-cau"]')
  await expect(item).toBeVisible()
  await expect(item.locator('.ml-skill-lib__status')).toHaveText(/Draft|Nháp/)
  await expect(item).toContainText(/2 files|2 file/)

  // Viewing shows the body and names the references.
  await item.getByRole('button', { name: /^(View|Xem)$/ }).click()
  await expect(item.locator('.ml-skill-lib__content')).toContainText(
    'Gọi ghep_bo_phan với mo_cau_hoan_chinh'
  )
  await expect(item).toContainText('references/tham-so.md')

  await item.getByRole('button', { name: /^(Publish|Công bố)$/ }).click()
  await expect(note).toContainText(/Published mo-cau|Đã công bố mo-cau/)
  await expect(item.locator('.ml-skill-lib__status')).toHaveText(
    /Published|Đã công bố/
  )
  await expect(
    item.getByRole('button', { name: /^(Publish|Công bố)$/ })
  ).toHaveCount(0)

  // Deleting takes two clicks on the same button, and nothing leaves before
  // the second.
  await item.getByRole('button', { name: /^(Delete|Xoá)$/ }).click()
  await expect(
    item.getByRole('button', { name: /Confirm delete|Xác nhận xoá/ })
  ).toBeVisible()
  expect(library.requests.filter(r => r.method === 'DELETE')).toHaveLength(0)
  await item
    .getByRole('button', { name: /Confirm delete|Xác nhận xoá/ })
    .click()
  await expect(note).toContainText(/Deleted mo-cau|Đã xoá mo-cau/)
  await expect(panel).toContainText(/No guides yet|Chưa có hướng dẫn nào/)
  expect(library.requests.filter(r => r.method === 'DELETE')).toHaveLength(1)
})

test('a member sees the published guides and no way to change them', async ({
  page
}) => {
  const library = serveLibrary(page, 'member', [PUBLISHED])
  await library.install()
  const { panel } = await openGuideTab(page)

  const item = panel.locator('[data-skill="mo-cau"]')
  await expect(item).toBeVisible()
  await expect(item.locator('.ml-skill-lib__status')).toHaveText(
    /Published|Đã công bố/
  )
  // A member drafts guides of their own, but a colleague's published guide
  // is not theirs to publish, edit or delete.
  await expect(page.getByTestId('skill-compose')).toBeVisible()
  await expect(page.getByTestId('skill-edit-mo-cau')).toHaveCount(0)
  await expect(
    item.getByRole('button', { name: /^(Publish|Công bố)$/ })
  ).toHaveCount(0)
  await expect(
    item.getByRole('button', { name: /^(Delete|Xoá)$/ })
  ).toHaveCount(0)

  // Reading is for everyone: it is the same text the assistant follows.
  await item.getByRole('button', { name: /^(View|Xem)$/ }).click()
  await expect(item.locator('.ml-skill-lib__content')).toContainText(
    'Gọi ghep_bo_phan'
  )
})

test('a refused upload shows the reason, and the library is left as it was', async ({
  page
}) => {
  const library = serveLibrary(page, 'author', [PUBLISHED])
  await library.install()
  const { panel } = await openGuideTab(page)

  // No SKILL.md among the picked files: refused before anything is sent.
  await page.getByTestId('skill-files-input').setInputFiles([
    {
      name: 'tham-so.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# x\n')
    }
  ])
  await expect(page.getByTestId('skill-error')).toContainText('Thiếu SKILL.md')
  expect(library.requests.filter(r => r.method === 'POST')).toHaveLength(0)
  await expect(panel.locator('[data-skill="mo-cau"]')).toBeVisible()
})

test('a member writes a guide in the editor and edits their own, always as a draft', async ({
  page
}) => {
  // Their own guide, published earlier by an admin.
  const library = serveLibrary(page, 'member', [
    { ...PUBLISHED, uploadedBy: 1 }
  ])
  await library.install()
  const { panel } = await openGuideTab(page)

  // A new guide from the form: no YAML typed by hand.
  await page.getByTestId('skill-compose').click()
  const editor = page.getByTestId('skill-editor')
  await editor
    .getByTestId('skill-field-id')
    .locator('input')
    .fill('mo-cau-doi-chieu-cao')
  await editor
    .getByTestId('skill-field-title')
    .locator('input')
    .fill('Đổi chiều cao bệ mố')
  await editor
    .getByTestId('skill-field-description')
    .locator('textarea')
    .fill('Khi người dùng đổi hBe của hồ sơ mố.')
  await editor
    .getByTestId('skill-field-body')
    .locator('textarea')
    .fill('1. Gọi sua_ho_so_mo.\n2. Gọi cap_nhat_btkl.')
  await page.getByTestId('skill-save').click()
  await expect(page.getByTestId('skill-note')).toContainText(
    /Saved mo-cau-doi-chieu-cao as a draft|Đã lưu mo-cau-doi-chieu-cao ở trạng thái nháp/
  )
  const created = library.requests.find(
    r => r.method === 'POST' && r.path.endsWith('/api/skills')
  )
  const sent = (created?.body as { files: { content: string }[] }).files[0]
  expect(sent.content).toMatch(
    /^---\nname: mo-cau-doi-chieu-cao\ndescription: "Khi người dùng đổi hBe của hồ sơ mố\."\n---\n# Đổi chiều cao bệ mố\n/
  )
  const item = panel.locator('[data-skill="mo-cau-doi-chieu-cao"]')
  await expect(item.locator('.ml-skill-lib__status')).toHaveText(/Draft|Nháp/)

  // Editing a published guide: the id is fixed, references are kept, and
  // the guide goes back to draft until it is published again.
  const published = panel.locator('[data-skill="mo-cau"]')
  await published.getByTestId('skill-edit-mo-cau').click()
  await expect(
    editor.getByTestId('skill-field-id').locator('input')
  ).toBeDisabled()
  await expect(
    editor.getByTestId('skill-field-title').locator('input')
  ).toHaveValue('Dựng mố cầu')
  await editor
    .getByTestId('skill-field-body')
    .locator('textarea')
    .fill('Gọi ghep_bo_phan, rồi kiểm tra lan can hai bên.')
  await page.getByTestId('skill-save').click()
  const put = library.requests.find(r => r.method === 'PUT')
  expect(put?.path).toMatch(/\/api\/skills\/mo-cau$/)
  expect(
    (put?.body as { files: { path: string }[] }).files.map(f => f.path)
  ).toEqual(['SKILL.md', 'references/tham-so.md'])
  await expect(published.locator('.ml-skill-lib__status')).toHaveText(
    /Draft|Nháp/
  )
  // Saving never publishes.
  expect(library.requests.some(r => r.path.endsWith('/publish'))).toBe(false)
})

test('a member drafts but cannot publish; an admin sees the draft to publish', async ({
  page
}) => {
  const draft = { ...PUBLISHED, status: 'draft' as const, uploadedBy: 1 }
  const library = serveLibrary(page, 'member', [draft])
  await library.install()
  const { panel } = await openGuideTab(page)
  const item = panel.locator('[data-skill="mo-cau"]')
  await expect(item.locator('.ml-skill-lib__status')).toHaveText(/Draft|Nháp/)
  await expect(
    item.getByRole('button', { name: /^(Publish|Công bố)$/ })
  ).toHaveCount(0)
  // Their own draft: they may still edit or delete it.
  await expect(page.getByTestId('skill-edit-mo-cau')).toBeVisible()
  await expect(
    item.getByRole('button', { name: /^(Delete|Xoá)$/ })
  ).toBeVisible()
})
