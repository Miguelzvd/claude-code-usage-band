import type { RenderElement, SessionMeasureInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

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

  // /usage-band: off until typed again, through prompts too
  const toggle = () =>
    $.command.run({
      command: 'usage-band',
      args: '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 80 },
    })
  expect((await toggle()).text).toBe('Barras de limite desligadas.')
  expect(last().isHidden).toBe(true)
  await $.prompt.submit({ text: 'oi', wait: false, origin: { kind: 'composer' } })
  expect(last().isHidden).toBe(true)
  expect((await toggle()).text).toBe('Barras de limite ligadas.')
  expect(last().isHidden).toBe(false)
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
