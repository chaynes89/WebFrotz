// CI-only: runs an isolated native app and automates its own Windows dialogs.
import { chromium, expect } from '@playwright/test'
import { spawn, execFileSync } from 'node:child_process'
import { readFile, mkdtemp, mkdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

if (process.platform !== 'win32' || process.env.CI !== 'true') {
  throw new Error('Desktop smoke automation is restricted to an isolated Windows CI runner.')
}
const sandbox = await mkdtemp(join(tmpdir(), 'webfrotz-desktop-'))
const fixture = resolve('public/fixtures/survey.z3')
const checkpoint = join(sandbox, 'checkpoint.qzl')
const transcript = join(sandbox, 'transcript.txt')
let child
let browser
let page
async function launch() {
  child = spawn(resolve('src-tauri/target/release/webfrotz-desktop.exe'), [], {
    env: { ...process.env, LOCALAPPDATA: sandbox, APPDATA: sandbox,
      WEBVIEW2_USER_DATA_FOLDER: join(sandbox, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=4181' },
    stdio: 'inherit',
  })
  let endpoint = false
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:4181/json/version')
      if (response.ok) { endpoint = true; break }
    } catch {
      if (child.exitCode !== null) throw new Error('Desktop failed to start.')
    }
    await new Promise(r => setTimeout(r, 250))
  }
  if (!endpoint) throw new Error('WebView2 debugging endpoint did not become ready.')
  browser = await chromium.connectOverCDP('http://127.0.0.1:4181')
  await expect.poll(() => browser.contexts().flatMap(context => context.pages())
    .some(page => page.url().includes('tauri.localhost'))).toBe(true)
  page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().includes('tauri.localhost'))
  await expect(page.getByRole('button', { name: 'Load story', exact: true })).toBeVisible()
}
async function dialog(path) {
  execFileSync('powershell.exe', ['-NoProfile', '-File', resolve('tools/native_dialog.ps1'),
    '-ProcessId', String(child.pid), '-FilePath', path], { timeout: 20000, stdio: 'inherit' })
}
async function command(text) {
  const input = page.getByLabel('Story command')
  await expect(input).toBeEnabled()
  await input.fill(text)
  await input.press('Enter')
  await expect(input).toBeEnabled()
}
async function close() {
  // Invoke the real close event, then use the app's unsaved-progress confirmation.
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|close', {
    label: 'main',
  }))
  await expect(page.getByRole('heading', { name: 'Close WebFrotz?' })).toBeVisible()
  await page.getByRole('button', { name: 'Close app', exact: true }).click()
  await new Promise((resolve, reject) => {
    if (child.exitCode !== null) return resolve()
    const timer = setTimeout(() => reject(new Error('Desktop did not close.')), 15000)
    child.once('exit', () => { clearTimeout(timer); resolve() })
  })
  await browser.close()
  browser = undefined
}
try {
  await launch()
  const failures = []
  page.on('pageerror', error => failures.push(error.message))
  await page.getByRole('button', { name: 'License / source' }).click()
  await expect(page.getByRole('heading', { name: 'License and corresponding source' })).toBeVisible()
  await expect(page.locator('.license-text')).toContainText('Source checkout')
  await page.getByRole('button', { name: 'Close notices' }).click()
  await page.getByRole('button', { name: 'Load story', exact: true }).click()
  await dialog(fixture)
  await expect(page.locator('.current-location')).toHaveText('foyer')
  await command('north')
  await expect(page.locator('.current-location')).toHaveText('garden')
  await expect(page.locator('.map-panel .panel-heading')).toContainText('002 NODES')
  await page.keyboard.press('Control+m')
  await expect(page.locator('.console')).toHaveClass(/map-expanded/)
  await page.keyboard.press('Control+m')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog(checkpoint)
  await expect(page.getByRole('status')).toContainText('Save file written locally')
  expect((await readFile(checkpoint)).subarray(0, 4).toString()).toBe('FORM')
  await command('south')
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await page.getByRole('button', { name: 'Use last local save' }).click()
  await expect(page.locator('.current-location')).toHaveText('garden')
  await page.getByRole('button', { name: 'Export transcript' }).click()
  await dialog(transcript)
  await expect(page.getByRole('status')).toContainText('Transcript exported locally')
  expect((await stat(transcript)).size).toBeGreaterThan(0)
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/tauri-windows.png' })
  expect(failures).toEqual([])
  await close()
  await launch()
  await page.locator('.local-library summary').click()
  await page.getByRole('button', { name: 'survey.z3', exact: true }).click()
  await expect(page.locator('.current-location')).toHaveText('foyer')
  await expect(page.locator('.map-panel .panel-heading')).toContainText('002 NODES')
  await expect(page.locator('.map-directory summary')).toContainText('1 links')
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await page.getByRole('button', { name: 'Use last local save' }).click()
  await expect(page.locator('.current-location')).toHaveText('garden')
  await page.getByRole('button', { name: 'Restart', exact: true }).click()
  await page.getByRole('button', { name: 'Restart story' }).click()
  await expect(page.locator('.map-panel .panel-heading')).toContainText('001 NODES')
  await page.getByRole('button', { name: 'Clear local history and maps' }).click()
  await page.getByRole('button', { name: 'Clear local data' }).click()
  await expect(page.locator('.local-library summary')).toContainText('0 recent stories')
  expect((await stat(fixture)).size).toBeGreaterThan(0)
  expect((await stat(checkpoint)).size).toBeGreaterThan(0)
  await close()
  console.log('Real Windows Tauri/WASM gameplay, native dialogs, saves, map/recent persistence and clear/close passed.')
} finally {
  if (browser) await browser.close()
  if (child?.exitCode === null) child.kill()
  await rm(sandbox, { recursive: true, force: true })
}
