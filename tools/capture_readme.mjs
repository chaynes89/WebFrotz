import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const url = new URL(process.env.WEBFROTZ_SCREENSHOT_URL || 'http://127.0.0.1:4178/')
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
  throw new Error('README capture requires a separate loopback preview.')
}
if (url.port === '4175' || url.port === '4176') {
  throw new Error('Do not capture through an existing user preview; use a separate port.')
}

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1280 }, reducedMotion: 'reduce' })
  await page.goto(url.href)
  await page.getByLabel('Load story file').setInputFiles('public/fixtures/station.z3')
  const input = page.getByLabel('Story command')
  for (const command of ['north', 'east', 'east', 'south', 'up']) {
    await expect(input).toBeEnabled()
    await input.fill(command)
    await input.press('Enter')
    await expect(input).toBeEnabled()
  }
  await expect(page.locator('.map-panel .panel-heading')).toContainText('006 NODES')
  await page.locator('.map-directory summary').click()
  await expect(page.locator('.map-directory')).toContainText('antenna loft / 2, 0, 1')
  await expect(page.locator('.map-directory')).toContainText('5 links')
  await page.locator('.map-directory summary').click()
  await page.getByRole('button', { name: 'Center', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom map in' }).click()
  await page.getByRole('button', { name: 'Rotate map left' }).click()
  await page.getByRole('button', { name: 'Rotate map left' }).click()
  await page.getByRole('button', { name: 'Zoom map in' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.map-failure')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
  await input.blur()
  await mkdir('docs', { recursive: true })
  await page.screenshot({ path: 'docs/webfrotz-1.0.png' })
} finally {
  await browser.close()
}
