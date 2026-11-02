import { expect, test, type Page } from '@playwright/test'

const input = (page: Page) => page.getByLabel('Story command')
const nodes = (page: Page) => page.locator('.map-panel .panel-heading')
const autosave = (page: Page) => page.getByTestId('autosave-status')

async function command(page: Page, text: string) {
  await input(page).fill(text)
  await input(page).press('Enter')
  await expect(input(page)).toBeEnabled()
}
async function stored(page: Page) {
  await expect(autosave(page)).toContainText('Stored')
}
async function reopen(page: Page, name: string) {
  await page.reload()
  await page.locator('.browser-library summary').click()
  await page.getByRole('button', { name: `Open ${name}` }).click()
  await expect(page.getByRole('dialog', { name: `Resume ${name}?` })).toBeVisible()
}

test('V3 progress and map autosave, survive reload, reopen without a file and keep an earlier run', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByLabel('Load story file').setInputFiles('public/fixtures/survey.z3')
  await expect(input(page)).toBeEnabled()
  await command(page, 'north')
  await expect(page.locator('.current-location')).toHaveText('garden')
  await stored(page)
  const moves = (await page.getByLabel('Story status').textContent())!

  await reopen(page, 'survey.z3')
  await page.getByRole('button', { name: 'Resume autosave' }).click()
  await expect(input(page)).toBeEnabled()
  await expect(page.getByLabel('Story transcript')).toContainText('[Autosave resumed')
  await expect(page.getByLabel('Story transcript')).toContainText('webfrotz survey fixture')
  await expect(page.getByLabel('Story status')).toHaveText(moves)
  await expect(page.locator('.current-location')).toHaveText('garden')
  await expect(nodes(page)).toContainText('002 NODES')
  await expect(page.locator('.map-directory summary')).toContainText('1 links')
  await command(page, 'south')
  await expect(page.locator('.current-location')).toHaveText('foyer')
  await stored(page)

  await page.getByRole('button', { name: 'Restart', exact: true }).click()
  await page.getByRole('button', { name: 'Restart story', exact: true }).click()
  await expect(nodes(page)).toContainText('001 NODES')
  await stored(page)
  await command(page, 'north')
  await stored(page)

  await reopen(page, 'survey.z3')
  await page.getByRole('button', { name: /Resume earlier run/ }).click()
  await expect(input(page)).toBeEnabled()
  await expect(page.locator('.current-location')).toHaveText('foyer')
  await expect(nodes(page)).toContainText('002 NODES')
  await expect(page.locator('.map-directory summary')).toContainText('1 links')
  await command(page, 'north')
  await expect(page.locator('.current-location')).toHaveText('garden')
  await stored(page)

  await reopen(page, 'survey.z3')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByLabel('Story transcript')).toContainText('Mount a raw')
  await page.getByRole('button', { name: 'Forget survey.z3' }).click()
  await page.getByRole('button', { name: 'Forget story' }).click()
  await expect(page.locator('.browser-library summary')).toContainText('0 stories')
  await page.getByLabel('Load story file').setInputFiles('public/fixtures/survey.z3')
  await expect(input(page)).toBeEnabled()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('V5 autosave resumes the real interpreter state and upper window', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Load story file').setInputFiles('public/fixtures/survey.z5')
  await expect(input(page)).toBeEnabled()
  await command(page, 'north')
  await expect(page.getByLabel('Story transcript')).toContainText('you walk north\ngarden')
  await stored(page)
  await reopen(page, 'survey.z5')
  await page.getByRole('button', { name: 'Resume autosave' }).click()
  await expect(input(page)).toBeEnabled()
  await expect(page.getByLabel('Story upper window')).toHaveText('upper telemetry')
  await expect(page.getByLabel('Story transcript')).toContainText('you walk north\ngarden')
  await command(page, 'south')
  await expect(page.getByLabel('Story transcript')).toContainText('you walk south\nfoyer')
})

test('a second tab pauses autosave instead of overwriting the first', async ({ page, context }) => {
  await page.goto('/')
  await page.getByLabel('Load story file').setInputFiles('public/fixtures/survey.z3')
  await expect(input(page)).toBeEnabled()
  await stored(page)
  const other = await context.newPage()
  await other.goto('/')
  await other.getByLabel('Load story file').setInputFiles('public/fixtures/survey.z3')
  await other.getByRole('button', { name: 'Start new game' }).click()
  await expect(input(other)).toBeEnabled()
  await expect(autosave(other)).toContainText('Paused')
  await expect(other.getByRole('status').filter({ hasText: 'another tab' })).toBeVisible()
})

test('storage failures are visible and gameplay continues', async ({ page }) => {
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = function () { throw new DOMException('full', 'QuotaExceededError') }
  })
  await page.goto('/')
  await page.getByLabel('Load story file').setInputFiles('public/fixtures/survey.z3')
  await expect(page.locator('.library-error')).toContainText('quota')
  await expect(page.getByRole('alert').filter({ hasText: 'Autosave failed' })).toContainText('use Save')
  await expect(autosave(page)).toContainText('FAILED')
  await command(page, 'north')
  await expect(page.locator('.current-location')).toHaveText('garden')
})
