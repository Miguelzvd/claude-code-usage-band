// Status line: the rate-limit bars, read from state.json (kept up to date by
// the usage-band mod) and the context share from the status line's input.
// Plain Node, no other dependency.
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

// the mod writes state.json next to its own files: here when it runs from this
// folder (--plugin-dir), else in its installed copy under the plugin cache
const STATE = (() => {
  const own = path.join(__dirname, 'state.json')
  const cache = path.join(os.homedir(), '.claude', 'plugins', 'cache')
  const found = []
  try {
    for (const market of fs.readdirSync(cache)) {
      const root = path.join(cache, market, 'usage-band')
      if (!fs.existsSync(root)) continue
      for (const version of fs.readdirSync(root)) found.push(path.join(root, version, 'state.json'))
    }
  } catch {}
  const mtime = file => {
    try {
      return fs.statSync(file).mtimeMs
    } catch {
      return 0
    }
  }
  return [own, ...found].sort((x, y) => mtime(y) - mtime(x))[0]
})()
// last state.json that parsed, for a read that lands mid-write
const CACHE = path.join(__dirname, '.state-cache.json')
const BAR_WIDTH = 6
const HEAVY = '━'
const LIGHT = '─'
// Nerd Font circle-outline, then circle-slice-1..8 (full): one cell, fills it
const CIRCLES = [0xf0766, ...Array.from({ length: 8 }, (_, i) => 0xf0a9e + i)].map(c =>
  String.fromCodePoint(c),
)
// cells the status line keeps free at its edges
const MARGIN = 4
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const COLORS = { success: '\x1b[32m', warning: '\x1b[33m', error: '\x1b[31m' }
const ANSI = /\x1b\[[0-9;]*m/g

const readJson = file => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

const loadState = () => {
  const state = readJson(STATE)
  if (state) {
    try {
      fs.writeFileSync(CACHE, JSON.stringify(state))
    } catch {}
    return state
  }
  return readJson(CACHE) ?? {}
}

const formatReset = (resetsAt, now) => {
  if (!resetsAt) return ''
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at) || at <= now) return ''
  const minutes = Math.ceil((at - now) / 60000)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours >= 24) return `${Math.floor(hours / 24)}d${String(hours % 24).padStart(2, '0')}`
  return hours > 0 ? `${hours}h${String(rest).padStart(2, '0')}` : `${rest}m`
}

const barColor = remaining =>
  remaining > 50 ? COLORS.success : remaining >= 20 ? COLORS.warning : COLORS.error

const clamp = n => Math.min(100, Math.max(0, n))
const circle = percent =>
  CIRCLES[Math.min(CIRCLES.length - 1, Math.round((percent / 100) * (CIRCLES.length - 1)))]

// [label, percent shown, how full is good, reset text] per band
const meters = (state, session, payload) => {
  const out = []
  const isHidden = state.isHidden || (session && (state.hiddenSessions ?? []).includes(session))
  if (!isHidden) {
    const byKind = Object.fromEntries((state.limits ?? []).map(l => [l.kind, l]))
    const now = Date.now()
    for (const [label, kind] of [['5h', 'five_hour'], ['7d', 'seven_day']]) {
      const limit = byKind[kind]
      if (!limit) continue
      const remaining = clamp(100 - Number(limit.percentUsed ?? 0))
      out.push([label, remaining, remaining, formatReset(limit.resetsAt, now)])
    }
  }
  const used = payload?.context_window?.used_percentage
  if (used !== undefined && used !== null) {
    const percent = clamp(Number(used))
    out.push(['ctx', percent, 100 - percent, ''])
  }
  return out
}

const render = (items, compact) =>
  items
    .map(([label, percent, goodness, reset]) => {
      const color = barColor(goodness)
      if (compact) return `${color}${circle(percent)}${RESET}${DIM} ${Math.round(percent)}% ${label}${RESET}`
      const filled = Math.round((percent / 100) * BAR_WIDTH)
      const tail = [reset, label].filter(Boolean).join(' · ')
      return (
        `${DIM}${Math.round(percent)}% ${RESET}${color}${HEAVY.repeat(filled)}${RESET}` +
        `${DIM}${LIGHT.repeat(BAR_WIDTH - filled)} ${tail}${RESET}`
      )
    })
    .join(`${DIM} | ${RESET}`)

// Width of the whole terminal. The width the mod saves is the transcript's, which
// a docked pane (file tree) narrows, so the bars would stop at the pane. A status
// line has no tty on its pipes, but on Windows it still sits on the console:
// `mode con` reports that console's size. Elsewhere $COLUMNS, then the saved width.
const terminalColumns = () => {
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('mode.com', ['con'], { encoding: 'utf8', timeout: 500, windowsHide: true })
      const match = out.match(/(?:Colunas|Columns)[^0-9]+([0-9]+)/i)
      if (match) return Number(match[1])
    } catch {}
  }
  return Number(process.env.COLUMNS) || 0
}

const main = () => {
  let payload = {}
  try {
    payload = JSON.parse(fs.readFileSync(0, 'utf8'))
  } catch {}
  const state = loadState()
  const items = meters(state, String(payload.session_id ?? ''), payload)
  if (items.length === 0) return
  const width = process.stdout.columns || terminalColumns() || Number(state.columns) || 0
  let right = render(items, false)
  if (width && right.replace(ANSI, '').length + MARGIN + 2 > width) right = render(items, true)
  const gap = width ? width - MARGIN - right.replace(ANSI, '').length : 0
  process.stdout.write(`${' '.repeat(Math.max(2, gap))}${right}\n`)
}

main()
