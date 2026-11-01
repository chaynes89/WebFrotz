// Opt-in local checks. Never write story bytes, output, screenshots, traces or videos.
import { chromium } from '@playwright/test'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const directory = process.env.WEBFROTZ_LOCAL_STORIES
if (!directory) throw new Error('Set WEBFROTZ_LOCAL_STORIES to an authorized local story directory.')
const preview = new URL(process.env.WEBFROTZ_PREVIEW_URL || 'http://127.0.0.1:4175')
assert(['127.0.0.1', 'localhost', '[::1]'].includes(preview.hostname), 'Private story tests require a loopback preview URL.')
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const files = (await readdir(directory)).filter(name => /\.z[1235]$/i.test(name)).sort()
  assert(files.length > 0, 'No raw stories found.')
  for (const name of files) {
    try {
    const data = await readFile(join(directory, name))
    await page.goto(preview.href)
    await page.getByLabel('Load story file').setInputFiles({
      name, mimeType: 'application/octet-stream', buffer: data,
    })
    const input = page.getByLabel('Story command')
    await input.waitFor({ state: 'visible' })
    await page.waitForFunction(() => !document.querySelector('#command').disabled)
    for (let i = 0; i < 4 && await input.getAttribute('maxlength') === '1'; i++) {
      await input.press('Space')
      await page.waitForFunction(() => !document.querySelector('#command').disabled)
    }
    for (const command of ['look', 'inventory', 'north', 'look']) {
      await input.fill(command)
      await input.press('Enter')
      await page.waitForFunction(() => !document.querySelector('#command').disabled)
      assert.equal(await page.getByRole('alert').count(), 0, `${name}: fatal error after ${command}`)
    }
    const outputLength = await page.getByLabel('Story transcript').evaluate(element => element.textContent?.length || 0)
    assert(outputLength > 100, `${name}: missing text output`)
    if (data[0] === 5) {
      const saved = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      const download = await saved
      const checkpoint = await readFile(await download.path())
      assert.equal(checkpoint.subarray(0, 4).toString(), 'FORM', 'Missing Quetzal save signature')
      await page.waitForFunction(() => !document.querySelector('#command').disabled)
      await page.getByRole('button', { name: 'Restore', exact: true }).click()
      await page.getByRole('button', { name: 'Choose save file' }).waitFor()
      await page.getByLabel('Restore save file').setInputFiles({
        name: 'local-checkpoint.qzl', mimeType: 'application/octet-stream', buffer: checkpoint,
      })
      await page.waitForFunction(() => !document.querySelector('#command').disabled)
      assert.equal(await page.getByRole('alert').count(), 0, 'Restore failed')
      console.log(`${name}: private Quetzal save/restore passed`)
    }
    console.log(`${name}: header V${data[0]}, load/look/inventory/north/look passed`)
    } catch (error) {
      const alert = await page.getByRole('alert').textContent().catch(() => null)
      if (alert?.includes('Timed input is not supported'))
        console.log(`${name}: UNSUPPORTED — timed input required (reported by host)`)
      else {
        console.log(`${name}: FAILED (${error.name}); host error: ${alert || 'none'}`)
        process.exitCode = 1
      }
    }
  }
} finally {
  await browser.close()
}
