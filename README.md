# usage-band

A Claude Code mod that keeps your rate limits and context size in view, on the status line under the prompt.

Three small bars sit flush right on the terminal's last row:

```
5h ━━━━━─ 88% · 29m | 7d ━━━━━─ 77% · 1d06 | ctx ━━━─── 42%
```

- **5h** and **7d**: how much of the 5-hour and 7-day rate limits is left, with the time until each resets.
- **ctx**: how much of the model's context window is in use, the same figure as `/context` (the status line's `used_percentage`).
- Bars are green above 50% left, yellow down to 20%, red below. `ctx` is red when the window is more than 80% full.
- On a narrow terminal the bars give way to circles, one per band, with the percentage:

```
5h 󰪤 88% | 7d 󰪣 77% | ctx 󰪤 85%
```

The bars always align to the edge of the whole terminal, even when a pane such as a file tree is docked beside the transcript.

## Install

In a Claude Code terminal session:

```
/plugin install usage-band --marketplace Miguelzvd/claude-code-usage-band
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install usage-band --marketplace Miguelzvd/claude-code-usage-band
```

Then point the status line at the script, in `~/.claude/settings.json`. Use the path where the mod is installed:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash ~/.claude/mods/usage-band/statusline.sh",
    "refreshInterval": 1
  }
}
```

## Commands

- `/usage-band` turns the bars off and on again. The choice is kept across sessions.
- `/usage` hides the bars in that session until your next prompt, so the built-in usage screen is not crowded.

## How it works

A status line command gets neither the rate limits as the engine measures them nor the terminal's width. The mod saves the limits to `state.json` after every turn, and `statusline.py` reads them each time the status line is drawn. The context figure comes straight from the status line's own input.

The width comes from the terminal itself: the script finds the pseudo-terminal of the `claude` process, so a docked pane does not shrink it. If that fails it falls back to the width the mod last saw.

If `~/.claude/hooks/caveman-statusline.sh` exists, its badge is drawn on the left. Without it the left side is empty.

## Limitations

- The circles use Nerd Font glyphs (`circle-slice`). Without a Nerd Font in the terminal they show as empty boxes.
- The width lookup reads `/proc`, so it works on Linux only. Elsewhere the bars use the width the mod saved, which a docked pane can narrow.
- Rate limits exist only on a subscription: with none, only `ctx` is drawn.
- `state.json` is shared by every open session, so a session with no limits yet shows the last ones written.
