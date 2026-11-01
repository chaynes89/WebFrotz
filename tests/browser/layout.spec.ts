import { expect, test } from '@playwright/test'

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 650 },
  { width: 800, height: 650 },
  { width: 1262, height: 1408 },
  { width: 1490, height: 1840 },
]) {
  test(`desktop ${viewport.width}x${viewport.height} keeps commands visible without page scrolling`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    const input = page.getByLabel('Story command')
    async function expectViewportFit() {
      expect(await page.evaluate(() => ({
        height: document.scrollingElement!.scrollHeight,
        viewport: innerHeight,
        width: document.scrollingElement!.scrollWidth,
        viewportWidth: innerWidth,
      }))).toEqual({ height: viewport.height, viewport: viewport.height, width: viewport.width, viewportWidth: viewport.width })
      const bounds = await input.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.y).toBeGreaterThanOrEqual(0)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
    }
    await expectViewportFit()
    await page.getByLabel('Load story file').setInputFiles('public/fixtures/survey.z3')
    await expect(input).toBeEnabled()
    for (const command of ['north', 'south', ...Array<string>(12).fill('look')]) {
      await input.fill(command)
      await input.press('Enter')
      await expect(input).toBeEnabled()
    }
    await page.locator('.map-directory summary').click()
    await expect(page.locator('.map-directory')).toContainText('garden')
    await expectViewportFit()
    expect(await page.getByLabel('Story transcript').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
    for (const expanded of [false, true]) {
      if (expanded) {
        await page.keyboard.press('Control+m')
        await expect(page.locator('.console')).toHaveClass(/map-expanded/)
      }
      await expectViewportFit()
      await input.fill('north')
      await page.getByRole('button', { name: 'Help', exact: true }).click()
      const help = page.getByRole('dialog', { name: 'Command help' })
      await help.getByRole('button', { name: 'Reveal story vocabulary (spoilers)' }).click()
      await expect(help.getByRole('list', { name: 'Story dictionary keys' })).toBeVisible()
      await expectViewportFit()
      const bounds = await help.boundingBox()
      expect(bounds!.y).toBeGreaterThanOrEqual(0)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
      await help.getByRole('button', { name: 'Close help' }).click()
      await expect(input).toHaveValue('north')
      await expectViewportFit()
    }
    await page.keyboard.press('Control+m')
    await expect(page.locator('.console')).not.toHaveClass(/map-expanded/)
    await expectViewportFit()
  })
}

test('short desktop preserves V5 command bar with upper-window and restore panels', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 650 })
  await page.goto('/')
  await page.getByLabel('Load story file').setInputFiles('public/fixtures/survey.z5')
  const input = page.getByLabel('Story command')
  await expect(input).toBeEnabled()
  await expect(page.getByLabel('Story upper window')).toHaveText('upper telemetry')
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choose save file' })).toBeVisible()
  expect(await page.evaluate(() => document.scrollingElement!.scrollHeight <= innerHeight)).toBe(true)
  const bounds = await input.boundingBox()
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(650)
  await page.getByRole('button', { name: 'Cancel restore' }).click()
  await expect(input).toBeEnabled()
})
