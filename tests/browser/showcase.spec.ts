import { expect, test } from '@playwright/test'

test('original release showcase discovers six real rooms and a vertical connection', async ({ page }) => {
  await page.goto('/')
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
  await expect(page.locator('.map-directory')).toContainText('5 links')
  await expect(page.locator('.map-directory li')).toHaveText([
    'arrival bay / 0, 0, 0', 'service corridor / 0, -1, 0',
    'reactor hall / 1, -1, 0', 'coolant gallery / 2, -1, 0',
    'observation deck / 2, 0, 0', '▶ antenna loft / 2, 0, 1',
  ])
  await expect(page.getByLabel('Story transcript')).toContainText('you climb the ladder into the antenna loft')
  await input.fill('down')
  await input.press('Enter')
  await expect(page.locator('.current-location')).toHaveText('observation deck')
  await expect(page.locator('.map-panel .panel-heading')).toContainText('006 NODES')
  await expect(page.getByRole('alert')).toHaveCount(0)
})
