import type { RenderElement, SessionMeasureInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { register } from './register'

const measure: SessionMeasureInput = {
  context: { window: 200_000 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 23, resetsAt: '2026-10-06T14:13:00Z' },
    { kind: 'seven_day', percentUsed: 39, resetsAt: '2026-10-09T16:00:00Z' },
  ],
  changed: ['rateLimits'],
}

test('state.json follows the limits, the width and /usage', async ($, on) => {
  mock.store(on)
  on('session.id', () => ({ value: 'me' }) as never)
  const writes: { path: string; text: string }[] = []
  on('fs.write', ($, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('session.measure', ($, e) => ({ changed: [...e.changed] }))
  on('command.run', { command: 'usage' }, () => ({ text: '' }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  // stands for the engine's own mode labels
  on('ui.render', { component: 'SessionMode' }, ($, e) =>
    h($.ui.resolve(e).Box, { key: 'engine' }) as RenderElement)

  const last = () => JSON.parse(writes.at(-1)?.text ?? '{}')

  await $.session.measure(measure)
  expect(writes.at(-1)?.path).toMatch(/.state.json$/)
  expect(last().limits).toEqual(measure.rateLimits)
  expect(last().isHidden).toBe(false)

  const ui = await $.ui.mount({
    plugin: 'usage-band',
    surface: 'terminal',
    component: 'SessionMode',
    props: { modes: [] },
    viewport: { columns: 132, rows: 40 },
  })
  expect(await ui.find({ key: 'engine' })).toBeDefined()
  await ui.unmount()
  // the width is written with the next event
  await $.session.measure({ ...measure, changed: ['context'] })
  expect(last().columns).toBe(132)

  await $.command.run({
    command: 'usage',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  // /usage hides the bars in this session only
  expect(last().isHidden).toBe(false)
  expect(last().hiddenSessions).toEqual(['me'])

  await $.prompt.submit({ text: 'oi', wait: false, origin: { kind: 'composer' } })
  expect(last().hiddenSessions).toEqual([])

  const band = (args: string) =>
    $.command.run({
      command: 'usage-band',
      args,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 80 },
    })
  // a bare /usage-band never hides the bars, typed once or twice
  expect((await band('')).text).toContain('ligadas')
  expect(last().isHidden).toBe(false)
  expect((await band('')).text).toContain('ligadas')
  expect(last().isHidden).toBe(false)
  // /usage-band off: off until turned on, through prompts too
  expect((await band('off')).text).toContain('desligadas')
  expect(last().isHidden).toBe(true)
  await $.prompt.submit({ text: 'oi', wait: false, origin: { kind: 'composer' } })
  expect(last().isHidden).toBe(true)
  // a bare /usage-band turns them back on
  expect((await band('')).text).toBe('Barras de limite ligadas.')
  expect(last().isHidden).toBe(false)
  await band('off')
  expect((await band('on')).text).toBe('Barras de limite ligadas.')
  expect(last().isHidden).toBe(false)
  expect((await band('talvez')).text).toContain('on|off')
})

test('a resize reaches state.json without waiting for a turn', async ($, on) => {
  mock.store(on)
  on('session.id', () => ({ value: 'me' }) as never)
  const clock = mock.clock(on)
  const writes: string[] = []
  on('fs.write', ($, e) => {
    writes.push(e.text)
    return { value: undefined }
  })
  on('command.register', () => ({ value: undefined }) as never)
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: measure.rateLimits },
  }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'SessionMode' }, ($, e) =>
    h($.ui.resolve(e).Box, { key: 'engine' }) as RenderElement)

  const last = () => JSON.parse(writes.at(-1) ?? '{}')
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  for (const columns of [150, 90]) {
    const ui = await $.ui.mount({
      plugin: 'usage-band',
      surface: 'terminal',
      component: 'SessionMode',
      props: { modes: [] },
      viewport: { columns, rows: 40 },
    })
    await ui.unmount()
    await clock.advance(500)
    expect(last().columns).toBe(columns)
  }

  // no width change, no write
  const count = writes.length
  await clock.advance(2000)
  expect(writes.length).toBe(count)
})

test('a session without limits keeps the ones already written', async ($, on) => {
  mock.store(on)
  on('session.id', () => ({ value: 'me' }) as never)
  const writes: string[] = []
  on('fs.read', () => ({
    value: JSON.stringify({ limits: measure.rateLimits, hiddenSessions: ['other'] }),
  }) as never)
  on('fs.write', ($, e) => {
    writes.push(e.text)
    return { value: undefined }
  })
  on('command.register', () => ({ value: undefined }) as never)
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const last = JSON.parse(writes.at(-1) ?? '{}')
  expect(last.limits).toEqual(measure.rateLimits)
  expect(last.hiddenSessions).toEqual(['other'])
})

test('/usage-band style picks the look and keeps it', async ($, on) => {
  mock.store(on)
  on('session.id', () => ({ value: 'me' }) as never)
  const writes: string[] = []
  on('fs.write', ($, e) => {
    writes.push(e.text)
    return { value: undefined }
  })
  const last = () => JSON.parse(writes.at(-1) ?? '{}')
  const style = (args: string) =>
    $.command.run({
      command: 'usage-band',
      args,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 80 },
    })

  expect((await style('style circles')).text).toBe('Estilo das barras: circles.')
  expect(last().style).toBe('circles')
  expect((await style('style auto')).text).toBe('Estilo das barras: auto.')
  expect(last().style).toBe('auto')
  // a bad value changes nothing and says what is accepted
  expect((await style('style round')).text).toContain('auto|bars|circles')
  expect(last().style).toBe('auto')
})

// the test kit raises no settings.read, so the hook is called as the engine would
const settingsHook = () => {
  let hook: any
  register(((event: string, ...rest: any[]) => {
    if (event === 'settings.read') hook = rest.at(-1)
  }) as never, {} as never)
  const $ = { plugin: { name: 'usage-band', root: '/mods/usage-band' } }
  // next resolves the way the engine's does: { value } or { deny }
  return (e: object, result: object) => hook($, e, async () => result)
}

test('the merged settings carry a statusLine for the bars unless one is set', async () => {
  const read = settingsHook()

  expect(await read({ layers: [] }, { value: { theme: 'dark' } })).toEqual({
    value: {
      theme: 'dark',
      statusLine: { type: 'command', command: 'node "/mods/usage-band/statusline.js"', refreshInterval: 1 },
    },
  })

  // a statusLine the person set is kept
  const mine = { value: { statusLine: { type: 'command', command: 'mine' } } }
  expect(await read({ layers: [] }, mine)).toEqual(mine)

  // one source's read is that source as loaded
  expect(await read({ source: 'user', layers: [] }, { value: {} })).toEqual({ value: {} })

  // a refused read stays refused
  expect(await read({ layers: [] }, { deny: 'no' })).toEqual({ deny: 'no' })
})
