# usage-band

A Claude Code mod that keeps your rate limits and context size in view, on the status line under the prompt.

Three small bars sit flush right on the terminal's last row:

```
88% ━━━━━─ 29m · 5h | 77% ━━━━━─ 1d06 · 7d | 42% ━━━─── ctx
```

- **5h** and **7d**: how much of the 5-hour and 7-day rate limits is left, with the time until each resets. Each band reads: percentage, bar, time left, then the window.
- **ctx**: how much of the model's context window is in use, the same figure as `/context` (the status line's `used_percentage`).
- Bars are green above 50% left, yellow down to 20%, red below. `ctx` is red when the window is more than 80% full.
- On a narrow terminal the bars give way to circles, one per band, with the percentage:

```
󰪤 88% 5h | 󰪣 77% 7d | 󰪤 85% ctx
```

The bars always align to the edge of the whole terminal, even when a pane such as a file tree is docked beside the transcript.

## Install

In a Claude Code terminal session:

```
/plugin install usage-band --marketplace Miguelzvd/miguelzvd-claude-code-plugins
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install usage-band --marketplace Miguelzvd/miguelzvd-claude-code-plugins
```

The bars show right after install, with nothing to add to `settings.json`: when no settings file sets a `statusLine`, the mod supplies one that runs its `statusline.js`.

A `statusLine` you set yourself wins, and then the bars do not show. To get them back, remove yours, or point it at the script:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"$(ls -d ~/.claude/plugins/cache/claude-code-miguelzvd/usage-band/*/ | sort -V | tail -1)statusline.js\"",
    "refreshInterval": 1
  }
}
```

## Commands

- `/usage-band` turns every bar off, `ctx` included, and on again. The choice is kept across sessions.
- `/usage-band style auto|bars|circles` picks the look. `auto` (the default) draws bars and gives way to circles when the terminal is too narrow; `bars` and `circles` force one. The choice is kept across sessions. `USAGE_BAND_STYLE` in the environment overrides it.
- `/usage` hides the bars in that session until your next prompt, so the built-in usage screen is not crowded.

## How it works

A status line command gets neither the rate limits as the engine measures them nor the terminal's width. The mod saves the limits to `state.json` after every turn, and `statusline.js` reads them each time the status line is drawn. The context figure comes straight from the status line's own input.

The width is the one the mod last saw, saved in `state.json`; the script uses the terminal's own width when Node reports one.

## Limitations

- The compact mode (narrow terminals) draws plain Unicode circles, which need no special font. Set `USAGE_BAND_ICONS=blocks` for vertical blocks, or `USAGE_BAND_ICONS=nerd` for Nerd Font glyphs; the latter show as empty boxes without a Nerd Font.
- The width is the transcript's, which a docked pane can narrow.
- Rate limits exist only on a subscription: with none, only `ctx` is drawn.
- `state.json` is shared by every open session, so a session with no limits yet shows the last ones written.
