import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { MapSnapshot } from '../../src/engine/protocol'

test('desktop adapter hydrates the real portable map and handles native save/restore/recent/error paths', async ({ page }) => {
  const data = Array.from(await readFile('public/fixtures/survey.z3'))
  await page.addInitScript(({ data }) => {
    const id = '1'.repeat(64)
    let map: unknown = null
    let save: number[] | null = null
    let fail = false
    let available = true
    const recent = () => available ? [{ id, name: 'survey.z3', path: 'fixture-local', savePath: save ? 'local.qzl' : null }] : []
    const story = () => ({ id, name: 'survey.z3', data, map, hasSave: save !== null })
    Object.assign(window, {
      isTauri: true,
      __desktopTest: { fail: () => { fail = true }, map: () => map, save: () => save },
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: 'main' } },
        transformCallback: () => 1,
        async invoke(command: string, args: Record<string, unknown> = {}) {
          if (command === 'plugin:event|listen') return 1
          if (command === 'plugin:event|unlisten') return
          if (command === 'recent_stories') return recent()
          if (command === 'pick_story' || command === 'open_recent') {
            if (fail) throw new Error('Local file is missing')
            return story()
          }
          if (command === 'persist_map') { map = args.map; return }
          if (command === 'save_game') { save = args.data as number[]; return true }
          if (command === 'restore_game') return args.latest ? save : null
          if (command === 'forget_library') { available = false; map = null; save = null; return }
          throw new Error(`Unexpected native command: ${command}`)
        },
      },
    })
  }, { data })
  await page.goto('/')
  await page.getByRole('button', { name: 'Load story', exact: true }).click()
  await expect(page.locator('.current-location')).toHaveText('foyer')
  await page.getByLabel('Story command').fill('north')
  await page.getByLabel('Story command').press('Enter')
  await expect(page.locator('.current-location')).toHaveText('garden')
  await expect.poll(async () => {
    const map: MapSnapshot = await page.evaluate(() => Reflect.get(window, '__desktopTest').map())
    return map.rooms.length
  }).toBe(2)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Save file written locally')
  const save: number[] = await page.evaluate(() => Reflect.get(window, '__desktopTest').save())
  expect(Buffer.from(save).subarray(0, 4).toString()).toBe('FORM')
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await page.getByRole('button', { name: 'Choose save file' }).click()
  await expect(page.getByLabel('Story command')).toBeEnabled()
  await expect(page.locator('.current-location')).toHaveText('garden')
  await page.locator('.local-library summary').click()
  await page.getByRole('button', { name: 'survey.z3', exact: true }).click()
  await expect(page.locator('.current-location')).toHaveText('foyer')
  await expect(page.locator('.map-panel .panel-heading')).toContainText('002 NODES')
  await expect(page.locator('.map-directory summary')).toContainText('1 links')
  await expect(page.getByLabel('Story transcript')).toContainText('local discoveries loaded')
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await page.getByRole('button', { name: 'Use last local save' }).click()
  await expect(page.locator('.current-location')).toHaveText('garden')
  await page.evaluate(() => Reflect.get(window, '__desktopTest').fail())
  await page.getByRole('button', { name: 'survey.z3', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Local file is missing')
  await expect(page.locator('.current-location')).toHaveText('garden')
  await page.getByRole('button', { name: 'Restart', exact: true }).click()
  await page.getByRole('button', { name: 'Restart story' }).click()
  await expect(page.locator('.map-panel .panel-heading')).toContainText('001 NODES')
  await expect.poll(async () => {
    const map: MapSnapshot = await page.evaluate(() => Reflect.get(window, '__desktopTest').map())
    return map.rooms.length
  }).toBe(1)
  await page.getByRole('button', { name: 'Clear local history and maps' }).click()
  await page.getByRole('button', { name: 'Clear local data' }).click()
  await expect(page.locator('.local-library summary')).toContainText('0 recent stories')
  await expect(page.getByLabel('Story command')).toBeDisabled()
})
