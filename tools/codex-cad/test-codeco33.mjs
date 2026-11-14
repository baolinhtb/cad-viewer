// Real deployment smoke test. Creates and removes one temporary member;
// never reads existing account credentials or reuses a user's session.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const base = process.env.CAD_TEST_BASE_URL || 'https://codeco33.smtc.vn'
if (
  !['codeco33.smtc.vn', '127.0.0.1', 'localhost'].includes(
    new URL(base).hostname
  )
)
  throw new Error('Unexpected test host')
const require = createRequire(`${root}/packages/cad-editor-demo/package.json`)
const { chromium } = require('@playwright/test')
const output = await mkdtemp(path.join(os.tmpdir(), 'cad-codex-website-'))
const email = `codex-smoke-${randomBytes(8).toString('hex')}@example.invalid`
const password = randomBytes(24).toString('hex')
const sql = code =>
  execFileSync(
    'docker',
    ['exec', '-i', 'cad-viewer-auth', 'node', '--input-type=module'],
    {
      input: `import {DatabaseSync} from 'node:sqlite'; import {randomBytes,scryptSync} from 'node:crypto'; const db=new DatabaseSync('/data/auth.db'); ${code}; db.close();`,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }
  )
let browser
const report = {
  url: base + '/cad-viewer/',
  calls: [],
  turns: []
}
try {
  sql(
    `const salt=randomBytes(16).toString('hex'); db.prepare("INSERT INTO users(email,name,pass_hash,salt,status,role) VALUES(?,?,?,?,'active','member')").run(${JSON.stringify(email)},'Codex temporary smoke test',scryptSync(${JSON.stringify(password)},salt,64).toString('hex'),salt)`
  )
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROME_PATH ||
      '/root/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell'
  })
  const context = await browser.newContext({
    viewport: { width: 1800, height: 1100 }
  })
  const login = await context.request.post(base + '/api/auth/login', {
    data: { email, password }
  })
  assert.equal(login.status(), 200, 'Temporary member login must succeed')
  const ai = await context.request.get(base + '/api/ai/context')
  report.context = await ai.json()
  assert.equal(report.context.model, 'codex-cli')
  if (process.env.CAD_TEST_REFERENCE_DWG) {
    const reference = await context.newPage()
    reference.on('pageerror', error =>
      console.log('[DWG page error]', error.message)
    )
    await reference.goto(report.url)
    await reference.getByRole('radio', { name: /^Write\b/ }).click()
    await reference.getByRole('radio', { name: /^Extents\b/ }).click()
    await reference
      .locator('input[type="file"]')
      .first()
      .setInputFiles(process.env.CAD_TEST_REFERENCE_DWG)
    await reference
      .locator('.ml-cad-container')
      .waitFor({ state: 'visible', timeout: 120000 })
    const chunk = (
      await readdir(`${root}/packages/cad-editor-demo/dist/assets`)
    ).find(name => /^cad-simple-viewer-.*\.js$/.test(name))
    await reference.evaluate(async chunk => {
      const module = await import(`/cad-viewer/assets/${chunk}`)
      window.__referenceManager = Object.values(module).find(
        value =>
          typeof value === 'function' &&
          value.prototype &&
          Object.getOwnPropertyDescriptor(value.prototype, 'curDocument')?.get
      )
    }, chunk)
    await reference.waitForFunction(
      () => {
        try {
          return (
            [
              ...window.__referenceManager.instance.curDocument.database.tables.blockTable.modelSpace.newIterator()
            ].length > 100
          )
        } catch {
          return false
        }
      },
      undefined,
      { timeout: 180000 }
    )
    report.referenceEntities = await reference.evaluate(
      () =>
        [
          ...window.__referenceManager.instance.curDocument.database.tables.blockTable.modelSpace.newIterator()
        ].length
    )
    report.referenceSceneReady = await reference.evaluate(async () => {
      const manager = window.__referenceManager.instance
      const view = manager.curView
      const ready = await view.waitUntilIdle(120000)
      await view.zoomToSmartExtents(120000)
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
      return ready
    })
    assert.equal(
      report.referenceSceneReady,
      true,
      'DWG scene must finish rendering'
    )
    report.referenceDiagnostics = await reference.evaluate(() => {
      const view = window.__referenceManager.instance.curView
      return {
        drawingBox: view.getDrawingExtents(),
        activeLayoutId: view.activeLayoutBtrId
      }
    })
    assert(
      report.referenceDiagnostics.drawingBox,
      'DWG must have drawable model-space extents'
    )
    console.log(
      '[DWG diagnostics]',
      JSON.stringify(report.referenceDiagnostics)
    )
    await reference.screenshot({ path: path.join(output, 'reference-dwg.png') })
    console.log(
      `[DWG] Loaded actual reference, ${report.referenceEntities} model entities`
    )
    await reference.close()
  }
  if (process.env.CAD_TEST_REFERENCE_ONLY === '1') {
    console.log(`PASS: reference DWG parsed and scene ready. ${output}`)
  } else {
    const page = await context.newPage()
    await page.addInitScript(() =>
      localStorage.setItem('cad-agent-plugin.agent-mode', 'simple')
    )
    page.on('response', async response => {
      if (new URL(response.url()).pathname === '/api/ai/messages') {
        // Record headers immediately: streamed bodies can be released before
        // response.text() completes, even after the CAD tool has succeeded.
        const call = {
          status: response.status(),
          model: response.request().postDataJSON()?.model,
          text: ''
        }
        report.calls.push(call)
        console.log(`[AI] HTTP ${call.status}, model ${call.model}`)
        try {
          call.text = await response.text()
        } catch {}
      }
    })
    await page.goto(report.url)
    await page.getByRole('radio', { name: /^Write\b/ }).click()
    await page.getByRole('radio', { name: /^Extents\b/ }).click()
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(
        `${root}/packages/cad-editor-demo/e2e/fixtures/minimal-line.dxf`
      )
    await page
      .locator('.ml-cad-container')
      .waitFor({ state: 'visible', timeout: 60000 })
    const viewerChunk = (
      await readdir(`${root}/packages/cad-editor-demo/dist/assets`)
    ).find(name => /^cad-simple-viewer-.*\.js$/.test(name))
    await page.evaluate(async chunk => {
      const module = await import(`/cad-viewer/assets/${chunk}`)
      // Production does not expose the dev-only document-manager global.
      const Manager = Object.values(module).find(
        value =>
          typeof value === 'function' &&
          value.prototype &&
          Object.getOwnPropertyDescriptor(value.prototype, 'curDocument')?.get
      )
      if (!Manager) throw new Error('Document manager export not found')
      window.__smokeDocManager = Manager
    }, viewerChunk)
    await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
    await page.waitForFunction(
      () =>
        document.querySelector('.cad-agent-model-select')?.value === 'codex-cli'
    )
    async function prompt(text) {
      console.log(`[Prompt] ${text}`)
      await page.locator('.cad-agent-panel-root textarea').fill(text)
      await page.locator('.cad-agent-send-btn').click()
      await page.waitForFunction(
        () => !!document.querySelector('.cad-agent-send-btn--stop'),
        undefined,
        { timeout: 10000 }
      )
      await page.waitForFunction(
        () => !document.querySelector('.cad-agent-send-btn--stop'),
        undefined,
        { timeout: 300000 }
      )
      report.turns.push({
        prompt: text,
        panel: await page.locator('.cad-agent-panel-root').innerText()
      })
    }
    const texts = () =>
      page.evaluate(() =>
        [
          ...window.__smokeDocManager.instance.curDocument.database.tables.blockTable.modelSpace.newIterator()
        ]
          .filter(e => e.dxfTypeName === 'TEXT')
          .map(e => e.textString)
      )
    await prompt(
      'Dựng bộ hồ sơ mố M1 theo mẫu BTC mo_2 bằng công cụ tao_ho_so_mo, giữ các thông số mặc định và trạng thái bản nháp. Không vẽ từng nét.'
    )
    assert(
      (await texts()).includes('bBe: 7700'),
      'CAD must contain the created dossier'
    )
    if (process.env.CAD_TEST_DETAILS === '1') {
      report.sourceDetails = await page.evaluate(() => {
        const es = [
          ...window.__smokeDocManager.instance.curDocument.database.tables.blockTable.modelSpace.newIterator()
        ]
        return {
          entities: es.length,
          fills: es.filter(e => e.dxfTypeName === 'HATCH').length,
          rotatedTexts: es.filter(
            e => e.dxfTypeName === 'TEXT' && Math.abs(e.rotation) > 0.7
          ).length
        }
      })
      assert(report.sourceDetails.entities > 4500)
      assert(report.sourceDetails.fills > 1000)
      assert(report.sourceDetails.rotatedTexts > 50)
      const sourcePdf = page.waitForEvent('download', { timeout: 300000 })
      sourcePdf.catch(() => {})
      await prompt(
        'Xuất PDF bản nháp của hồ sơ M1 mặc định vừa dựng, giữ đầy đủ chi tiết CAD nguồn.'
      )
      await (await sourcePdf).saveAs(path.join(output, 'M1-source-detail.pdf'))
      await page.screenshot({ path: path.join(output, 'source-details.png') })
    }
    if (process.env.CAD_TEST_PRESERVE === '1') {
      const beforeNative = await page.evaluate(() => {
        const es = [
          ...window.__smokeDocManager.instance.curDocument.database.tables.blockTable.modelSpace.newIterator()
        ]
        const line = es.find(e => e.dxfTypeName === 'LINE')
        return {
          ids: es.map(e => e.objectId),
          fills: es.filter(e => e.dxfTypeName === 'HATCH').length,
          lineId: line.objectId,
          endX: line.endPoint.x
        }
      })
      assert(beforeNative.fills > 1000)
      await prompt(
        'Sửa riêng dòng chữ BỐ TRÍ MỐ M1 — CHI TIẾT TRÍCH TỪ CAD GỐC thành M1 — GHI CHÚ ĐÃ HIỆU CHỈNH. Giữ nguyên font, màu, vị trí và toàn bộ chi tiết còn lại; sửa trực tiếp trên bản vẽ, không dùng template.'
      )
      assert((await texts()).includes('M1 — GHI CHÚ ĐÃ HIỆU CHỈNH'))
      await prompt(
        `Kiểm tra chỉnh sửa cục bộ: dùng công cụ sửa điểm điều khiển để dịch đúng đầu cuối của đối tượng LINE mã ${beforeNative.lineId} thêm 25 mm theo X, Y giữ nguyên. Chỉ sửa LINE này, giữ nguyên mọi đối tượng khác; không dựng lại bản vẽ.`
      )
      report.nativeEdits = await page.evaluate(id => {
        const db = window.__smokeDocManager.instance.curDocument.database
        const es = [...db.tables.blockTable.modelSpace.newIterator()]
        return {
          ids: es.map(e => e.objectId),
          fills: es.filter(e => e.dxfTypeName === 'HATCH').length,
          endX: db.getObjectById(id).endPoint.x
        }
      }, beforeNative.lineId)
      assert.deepEqual(report.nativeEdits.ids, beforeNative.ids)
      assert.equal(report.nativeEdits.fills, beforeNative.fills)
      assert(Math.abs(report.nativeEdits.endX - beforeNative.endX - 25) < 0.001)
      report.nativeUndo = await page.evaluate(id => {
        const db = window.__smokeDocManager.instance.curDocument.database
        const before = db.getObjectById(id).endPoint.x
        const undo = db.transactionManager.undo()
        const undone = db.getObjectById(id).endPoint.x
        const redo = db.transactionManager.redo()
        const redone = db.getObjectById(id).endPoint.x
        return { undo, redo, before, undone, redone }
      }, beforeNative.lineId)
      assert.equal(report.nativeUndo.undo, true)
      assert.equal(report.nativeUndo.redo, true)
      assert.equal(report.nativeUndo.before, report.nativeUndo.redone)
      assert.equal(report.nativeUndo.undone, beforeNative.endX)
      const nativeDownload = page.waitForEvent('download', { timeout: 300000 })
      nativeDownload.catch(() => {})
      await prompt(
        'Xuất DXF đúng bản vẽ hiện tại bằng cad.file.saveDxf, đặt tên M1-preserved.dxf, giữ ghi chú vừa sửa và chi tiết CAD. Không tái sinh từ template.'
      )
      await (await nativeDownload).saveAs(path.join(output, 'M1-preserved.dxf'))
      assert(
        (await readFile(path.join(output, 'M1-preserved.dxf'))).length > 1000000
      )
      await page.screenshot({
        path: path.join(output, 'preserved-details.png')
      })
      console.log(
        `PASS: native AI edits preserve all ${beforeNative.ids.length} handles and ${beforeNative.fills} fills, undo/redo and actual DXF export. ${output}`
      )
    } else {
      const originalIds = await page.evaluate(() =>
        [
          ...window.__smokeDocManager.instance.curDocument.database.tables.blockTable.modelSpace.newIterator()
        ].map(e => e.objectId)
      )
      await prompt(
        'Sửa hồ sơ vừa dựng: đổi tên công trình thành Cầu đã cập nhật. Giữ nguyên mọi chi tiết, kích thước, thép và bố trí cọc. Không dựng lại từ template.'
      )
      const editedIds = await page.evaluate(() =>
        [
          ...window.__smokeDocManager.instance.curDocument.database.tables.blockTable.modelSpace.newIterator()
        ].map(e => e.objectId)
      )
      assert.deepEqual(
        editedIds,
        originalIds,
        'Editing must preserve every existing CAD entity id'
      )
      const after = await texts()
      assert(after.includes('Cầu đã cập nhật'))
      assert(after.includes('bBe: 7700'))
      assert(after.includes('bThan: 7700'))
      assert.equal(
        after.filter(t => t === 'BẢN NHÁP — CHƯA PHÁT HÀNH THI CÔNG').length,
        6
      )
      report.undoRedo = await page.evaluate(async () => {
        const db = window.__smokeDocManager.instance.curDocument.database
        const tm = db.transactionManager
        const has = text =>
          [...db.tables.blockTable.modelSpace.newIterator()].some(
            e => e.dxfTypeName === 'TEXT' && e.textString === text
          )
        const steps = [tm.undo(), tm.undo(), tm.redo(), tm.redo()]
        const restored =
          has('Cầu đã cập nhật') && has('bBe: 7700') && has('bThan: 7700')
        const sceneReady =
          await window.__smokeDocManager.instance.curView.waitUntilIdle(120000)
        return { steps, restored, sceneReady }
      })
      assert.deepEqual(report.undoRedo.steps, [true, true, true, true])
      assert.equal(report.undoRedo.restored, true)
      assert.equal(report.undoRedo.sceneReady, true)
      const download = page.waitForEvent('download', { timeout: 300000 })
      download.catch(() => {})
      await prompt(
        'Xuất PDF 6 trang bản nháp của hồ sơ M1 vừa sửa bằng công cụ xuat_ho_so_mo.'
      )
      await (await download).saveAs(path.join(output, 'M1-ban-nhap.pdf'))
      const pdf = await readFile(path.join(output, 'M1-ban-nhap.pdf'))
      report.pdfPages = (
        pdf.toString('latin1').match(/\/Type \/Page\b/g) || []
      ).length
      assert.equal(report.pdfPages, 6)
      if (process.env.CAD_TEST_ANNOTATIONS === '1') {
        const jpegStart = pdf.indexOf(Buffer.from([0xff, 0xd8, 0xff]))
        const jpegEnd = pdf.indexOf(Buffer.from([0xff, 0xd9]), jpegStart) + 2
        assert(
          jpegStart >= 0 && jpegEnd > jpegStart,
          'PDF must contain sheet image'
        )
        report.pdfColoredPixels = await page.evaluate(async base64 => {
          const image = new Image()
          image.src = 'data:image/jpeg;base64,' + base64
          await image.decode()
          const canvas = document.createElement('canvas')
          canvas.width = 1600
          canvas.height = Math.round(
            (image.height * canvas.width) / image.width
          )
          const ctx = canvas.getContext('2d')
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
          const pixels = ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          ).data
          let colored = 0
          for (let i = 0; i < pixels.length; i += 4) {
            if (
              Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) -
                Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) >
              20
            )
              colored++
          }
          return colored
        }, pdf.subarray(jpegStart, jpegEnd).toString('base64'))
        assert(
          report.pdfColoredPixels > 20,
          'Exported PDF must retain annotation colors'
        )
        await prompt(
          'Thêm một ví dụ chú thích riêng ở ngoài khung hồ sơ: chữ ANNO-SMOKE xanh lá ACI 3 kèm đường dẫn nét liền, một đường tim đỏ ACI 1 kiểu CENTER và một đường khuất xám ACI 8 kiểu HIDDEN. Dùng execute_cad_script và tx.setStyle, chọn tỷ lệ nét đủ nhìn rõ. Không sửa hồ sơ cũ.'
        )
        report.annotations = await page.evaluate(() => {
          const db = window.__smokeDocManager.instance.curDocument.database
          const entities = [...db.tables.blockTable.modelSpace.newIterator()]
          const note = entities.find(
            e => (e.textString ?? e.contents) === 'ANNO-SMOKE'
          )
          const axes = entities.filter(
            e => e.lineType === 'CENTER' && e.color.colorIndex === 1
          )
          const hidden = entities.filter(
            e => e.lineType === 'HIDDEN' && e.color.colorIndex === 8
          )
          return {
            noteColor: note?.color.colorIndex,
            axes: axes.length,
            hidden: hidden.length
          }
        })
        assert.equal(report.annotations.noteColor, 3)
        assert(report.annotations.axes > 0)
        assert(report.annotations.hidden > 0)
      }
    }
    await page.screenshot({ path: path.join(output, 'website-codex.png') })
    assert(report.calls.some(c => c.status === 200 && c.model === 'codex-cli'))
    console.log(
      `PASS: public website chat → Codex → real CAD edits and export. ${output}`
    )
  }
} catch (error) {
  report.error = error.message
  console.error(`FAIL: ${error.message}. ${output}`)
  process.exitCode = 1
} finally {
  await browser?.close()
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  // Remove only this test member's records, including any automatic draft save.
  sql(
    `const user=db.prepare('SELECT id FROM users WHERE email=?').get(${JSON.stringify(email)}); if(user){db.prepare('DELETE FROM ai_calls WHERE user_id=?').run(user.id); db.prepare('DELETE FROM drawings WHERE owner_id=?').run(user.id); db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id); db.prepare('DELETE FROM users WHERE id=?').run(user.id)}`
  )
}
