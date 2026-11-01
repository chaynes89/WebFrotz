import { expect, test } from '@playwright/test'

for (const width of [320, 350, 351, 360, 390, 720, 721, 1000, 1001, 1024, 1440, 1920]) {
  test(`compact header fits and remains usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.locator('.hardware-header')).toHaveCSS('display', 'flex')

    const help = page.getByRole('button', { name: 'Help', exact: true })
    const load = page.getByRole('button', { name: 'Load story', exact: true })
    const [frame, consoleArea, brand, helpBox, loadBox, leftScrew, rightScrew] = await Promise.all([
      page.locator('.hardware').boundingBox(),
      page.locator('.console').boundingBox(),
      page.locator('.hardware-header .brand').boundingBox(),
      help.boundingBox(),
      load.boundingBox(),
      page.locator('.top-left').boundingBox(),
      page.locator('.top-right').boundingBox(),
    ])
    expect(frame).not.toBeNull()
    expect(consoleArea).not.toBeNull()
    expect(brand).not.toBeNull()
    expect(helpBox).not.toBeNull()
    expect(loadBox).not.toBeNull()
    expect(leftScrew).not.toBeNull()
    expect(rightScrew).not.toBeNull()
    expect(consoleArea!.y - frame!.y).toBeLessThanOrEqual(64)
    expect(brand!.x + brand!.width).toBeLessThanOrEqual(helpBox!.x)
    expect(helpBox!.x + helpBox!.width).toBeLessThanOrEqual(loadBox!.x)
    expect(loadBox!.x + loadBox!.width).toBeLessThanOrEqual(width)
    expect(helpBox!.height).toBeGreaterThanOrEqual(24)
    expect(loadBox!.height).toBeGreaterThanOrEqual(24)
    for (const screw of [leftScrew!, rightScrew!]) {
      for (const item of [brand!, helpBox!, loadBox!]) {
        expect(screw.x < item.x + item.width && screw.x + screw.width > item.x &&
          screw.y < item.y + item.height && screw.y + screw.height > item.y).toBe(false)
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)

    await help.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Command help' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(help).toBeFocused()

    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), load.click()])
    await chooser.setFiles('public/fixtures/survey.z3')
    const input = page.getByLabel('Story command')
    await expect(input).toBeEnabled()
    await input.fill('north')
    await input.press('Enter')
    await expect(page.getByLabel('Story transcript')).toContainText('you walk north')
  })
}
