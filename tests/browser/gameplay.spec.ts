import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function load(page: Page, version = 3) {
  await page.goto('/')
  await page.getByLabel('Load story file').setInputFiles(`public/fixtures/survey.z${version}`)
  await expect(page.getByLabel('Story command')).toBeEnabled()
  await expect(page.locator('.current-location')).toHaveText('foyer')
}
async function command(page: Page, text: string) {
  await page.getByLabel('Story command').fill(text)
  await page.getByLabel('Story command').press('Enter')
  await expect(page.getByLabel('Story command')).toBeEnabled()
}

for (const version of [1, 2, 3]) {
  test(`real WASM V${version}: input, movement, mapping, toggle, restart`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await load(page, version)
    await expect(page.getByLabel('Story transcript')).toContainText('webfrotz survey fixture')
    await expect(page.getByLabel('Story status')).toContainText('Score: 7')
    await expect(page.getByLabel('Story status')).toContainText('Moves: 2')
    if (version === 3) await expect(page.getByLabel('Story upper window')).toContainText('upper telemetry')
    await command(page, 'north')
    await expect(page.locator('.current-location')).toHaveText('garden')
    await expect(page.locator('.map-directory summary')).toContainText('1 links')
    await expect(page.locator('.map-panel .panel-heading')).toContainText('002 NODES')
    await page.keyboard.press('Control+m')
    await expect(page.locator('.console')).toHaveClass(/map-expanded/)
    await expect(page.getByRole('button', { name: /Dock map/ })).toBeVisible()
    await page.getByRole('button', { name: /Dock map/ }).click()
    await expect(page.locator('.console')).not.toHaveClass(/map-expanded/)
    await command(page, 'south')
    await expect(page.locator('.current-location')).toHaveText('foyer')
    await page.getByRole('button', { name: 'Restart', exact: true }).click()
    await page.getByRole('button', { name: 'Restart story', exact: true }).click()
    await expect(page.locator('.map-panel .panel-heading')).toContainText('001 NODES')
    await expect(page.locator('.map-directory summary')).toContainText('0 links')
    await expect(page.locator('.current-location')).toHaveText('foyer')
    await expect(page.getByLabel('Story command')).toBeFocused()
    expect(errors).toEqual([])
  })
}

test('real Quetzal save/restore, cancelled restore, undo and story replacement', async ({ page }) => {
  await load(page)
  const saved = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const download = await saved
  const path = await download.path()
  expect(path).not.toBeNull()
  const bytes = await readFile(path!)
  expect(bytes.subarray(0, 4).toString()).toBe('FORM')
  await expect(page.getByLabel('Story command')).toBeEnabled()
  await command(page, 'north')
  await expect(page.locator('.current-location')).toHaveText('garden')
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cancel restore' })).toBeVisible()
  await page.getByLabel('Restore save file').setInputFiles({ name: 'checkpoint.qzl', mimeType: 'application/octet-stream', buffer: bytes })
  await expect(page.locator('.current-location')).toHaveText('foyer')
  await expect(page.locator('.map-panel .panel-heading')).toContainText('002 NODES')
  await expect(page.locator('.map-directory summary')).toContainText('1 links')
  await command(page, 'north')
  await expect(page.locator('.current-location')).toHaveText('garden')
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel restore' }).click()
  await expect(page.getByLabel('Story command')).toBeEnabled()
  await expect(page.locator('.current-location')).toHaveText('garden')
  await command(page, 'south')
  await expect(page.locator('.current-location')).toHaveText('foyer')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByLabel('Story command')).toBeEnabled()
  await expect(page.locator('.current-location')).toHaveText('garden')
  await expect(page.locator('.map-panel .panel-heading')).toContainText('002 NODES')
  await page.getByLabel('Load story file').setInputFiles('public/fixtures/survey.z1')
  await expect(page.locator('.current-location')).toHaveText('foyer')
  await expect(page.locator('.map-panel .panel-heading')).toContainText('001 NODES')
})

test('unsupported stories, stop and narrow layout', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Load story file').setInputFiles({
    name: 'unsupported.z4', mimeType: 'application/octet-stream', buffer: Buffer.from([4, ...Array(99).fill(0)]),
  })

  await expect(page.getByRole('alert')).toContainText('V4 and V6-V8')
  await page.setViewportSize({ width: 390, height: 844 })
  await load(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.getByLabel('Story command')).toBeDisabled()
  await expect(page.getByLabel('Story transcript')).toContainText('Interpreter stopped')
})

test('map renderer and original retro presentation', async ({ page }) => {
  await load(page)
  await command(page, 'north')
  await expect(page.locator('.map-failure')).toHaveCount(0)
  await expect(page.locator('.map-surface canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Rotate map left' }).click()
  await page.getByRole('button', { name: 'Zoom map in' }).click()
  await page.screenshot({ path: 'test-results/webfrotz-desktop.png', fullPage: true })
})

test('WebGL failure keeps the real interpreter and room directory usable', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, name: string, ...args: unknown[]) {
      if (name.includes('webgl')) return null
      return Reflect.apply(getContext, this, [name, ...args])
    } as typeof getContext
  })

  await load(page)
  await expect(page.locator('.map-failure')).toContainText('3D map unavailable')
  await command(page, 'north')
  await expect(page.locator('.current-location')).toHaveText('garden')
  await page.locator('.map-directory summary').click()
  await expect(page.locator('.map-directory li')).toHaveCount(2)
})
test('single-key input, command history and keyboard-accessible restart confirmation', async ({ page }) => {
  await load(page)
  await command(page, 'north')
  await page.getByLabel('Story command').press('Alt+n')
  await expect(page.getByLabel('Story transcript')).toContainText('Do you wish to restart')
  await expect(page.getByLabel('Story command')).toHaveAttribute('maxlength', '1')
  await page.getByLabel('Story command').press('n')
  await expect(page.getByLabel('Story transcript')).toContainText('Continue input')
  await expect(page.getByLabel('Story command')).toHaveAttribute('maxlength', '39')
  await page.getByLabel('Story command').press('ArrowUp')
  await expect(page.getByLabel('Story command')).toHaveValue('north')
  await page.getByRole('button', { name: 'Restart', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Keep exploring' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Restart', exact: true })).toBeFocused()
  await page.getByLabel('Story command').focus()
  await page.getByLabel('Story command').press('Alt+n')
  await expect(page.getByLabel('Story command')).toHaveAttribute('maxlength', '1')
  await page.getByLabel('Story command').press('y')
  await expect(page.locator('.map-panel .panel-heading')).toContainText('001 NODES')
  await expect(page.locator('.current-location')).toHaveText('foyer')
})
