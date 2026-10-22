import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit } from '../types'

const limits = atom({ plugin: 'usage-band', key: 'limits' } as const, null)
const isHidden = atom({ plugin: 'usage-band', key: 'isHidden' } as const, false)

const toLimits = (raw: readonly Limit[]): Limit[] =>
  raw.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt }))

// The bars are drawn by statusline.js, on the status line.
// A status line command gets neither the rate limits as the engine
// measures them nor the terminal's width, so the mod keeps both in state.json
// for it. The width is the one the footer was last drawn at: a render hook may
// not write, so it is kept here and a timer writes it soon after a resize.
let columns = 0
let persistedColumns = 0
const RESIZE_CHECK_MS = 150

// /usage-band turns the bars off and on again; kept across sessions
const COMMAND = 'usage-band'
const OFF_KEY = 'isOff'
// /usage-band style auto|bars|circles: auto draws bars and gives way to circles
// when the line is too narrow; the other two force one look. Kept across sessions
const STYLE_KEY = 'style'
const STYLES = ['auto', 'bars', 'circles']
type Style = (typeof STYLES)[number]
const isStyle = (value: unknown): value is Style => STYLES.includes(value as Style)

// state.json is one file for every open session: a session that has no
// limits yet keeps the last ones written, and /usage hides the bars only in
// the session that ran it (the status line matches its own session_id)
const readState = async ($: EngineInterface): Promise<Partial<State>> => {
  try {
    return JSON.parse(await $.fs.read(`${$.plugin.root}/state.json`))
  } catch {
    return {}
  }
}

type State = {
  limits: Limit[]
  isHidden: boolean
  hiddenSessions: string[]
  columns: number
  style: Style
}

const readStyle = async ($: EngineInterface): Promise<Style> => {
  const style = await $.store.get(STYLE_KEY)
  return isStyle(style) ? style : 'auto'
}

const persist = async ($: EngineInterface) => {
  const previous = await readState($)
  const own = (await read($, limits)) ?? []
  const id = await $.session.id()
  const others = (previous.hiddenSessions ?? []).filter(s => s !== id)
  const state: State = {
    limits: own.length > 0 ? own : (previous.limits ?? []),
    isHidden: (await $.store.get(OFF_KEY)) === true,
    hiddenSessions: ((await read($, isHidden)) ? [...others, id] : others).slice(-20),
    columns,
    style: await readStyle($),
  }
  persistedColumns = columns
  await $.fs.write(`${$.plugin.root}/state.json`, `${JSON.stringify(state)}\n`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Show or hide the rate-limit bars on the status line',
    })
    const result = await next(e)
    const usage = await $.session.usage()
    await update($, isHidden, () => false)
    if (usage.rateLimits.length > 0) {
      await update($, limits, () => toLimits(usage.rateLimits))
    }
    await persist($)
    // keeps the bars flush right after a resize, without waiting for a turn
    $.clock.every(RESIZE_CHECK_MS, async () => {
      if (columns !== persistedColumns) await persist($)
    })
    return result
  })

  // after every turn: the limits when they moved, the width in any case
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => toLimits(e.rateLimits))
    }
    await persist($)
    return next(e)
  })

  on('command.run', { command: 'usage' }, async ($, e, next) => {
    await update($, isHidden, () => true)
    await persist($)
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const [word, choice] = e.args.trim().split(/ +/)
    if (word === 'style') {
      if (!isStyle(choice)) {
        return { text: `Uso: /usage-band style ${STYLES.join('|')} (agora: ${await readStyle($)})` }
      }
      await $.store.set(STYLE_KEY, choice)
      await persist($)
      return { text: `Estilo das barras: ${choice}.` }
    }
    const isOff = (await $.store.get(OFF_KEY)) !== true
    await $.store.set(OFF_KEY, isOff)
    await persist($)
    return { text: isOff ? 'Barras de limite desligadas.' : 'Barras de limite ligadas.' }
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, isHidden, () => false)
    await persist($)
    return next(e)
  })

  // drawn again on every resize; read only for the terminal's width, the
  // engine's own mode labels drawn as they are
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    columns = e.viewport?.columns ?? columns
    return next(e)
  })
}
