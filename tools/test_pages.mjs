// Generated fixture only; never selects an existing user preview or local stories.
import { chromium, expect } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'

const url = new URL(process.env.WEBFROTZ_PAGES_URL || 'https://chaynes89.github.io/WebFrotz/')
if (!(url.href === 'https://chaynes89.github.io/WebFrotz/' ||
    (['localhost', '127.0.0.1'].includes(url.hostname) &&
      !['4175', '4176'].includes(url.port) && url.pathname === '/WebFrotz/'))) {
  throw new Error('Use the WebFrotz Pages URL or an isolated loopback /WebFrotz/ preview.')
}
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const failures = []
  page.on('pageerror', error => failures.push(error.message))
  page.on('requestfailed', request => failures.push(`${request.url()}: ${request.failure()?.errorText}`))
  page.on('response', response => {
    if (response.status() >= 400 && /\/(wasm|assets)\//.test(response.url()))
      failures.push(`${response.status()}: ${response.url()}`)
  })
  const response = await page.goto(url.href, { waitUntil: 'networkidle' })
  expect(response.status()).toBe(200)
  expect(new URL(page.url()).pathname).toBe('/WebFrotz/')
  await page.getByLabel('Load story file').setInputFiles({
    name: 'station.z3', mimeType: 'application/octet-stream',
    buffer: await readFile('public/fixtures/station.z3'),
  })
  const input = page.getByLabel('Story command')
  for (const command of ['north', 'east', 'east', 'south', 'up']) {
    await expect(input).toBeEnabled()
    await input.fill(command)
    await input.press('Enter')
    await expect(input).toBeEnabled()
  }
  await expect(page.locator('.current-location')).toHaveText('antenna loft')
  await expect(page.locator('.map-panel .panel-heading')).toContainText('006 NODES')
  await page.locator('.map-directory summary').click()
  await expect(page.locator('.map-directory')).toContainText('5 links')
  await expect(page.locator('.map-directory')).toContainText('2, 0, 1')
  await page.keyboard.press('Control+m')
  await expect(page.locator('.console')).toHaveClass(/map-expanded/)
  await page.keyboard.press('Control+m')
  await page.getByRole('button', { name: 'Restart', exact: true }).click()
  await page.getByRole('button', { name: 'Restart story' }).click()
  await expect(page.locator('.current-location')).toHaveText('arrival bay')
  await expect(page.locator('.map-panel .panel-heading')).toContainText('001 NODES')
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(failures).toEqual([])
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/github-pages.png' })
  console.log(`${url.href}: real C/WASM gameplay, six rooms/vertical movement, map toggle and restart passed.`)
} finally {
  await browser.close()
}
