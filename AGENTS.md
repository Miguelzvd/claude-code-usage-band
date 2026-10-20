# AGENTS.md

Guidance for AI agents working in this repository.

## What this is

`usage-band` is a Claude Code mod. It draws the 5-hour and 7-day rate limits and the context size as bars on the status line. See `README.md` for what it shows and how to install it.

## Layout

- `.claude-plugin/plugin.json`: the manifest. It names the type contract in `types/index.d.ts`.
- `hooks/hooks.json`: lists the hooks module, `./register.tsx`.
- `hooks/register.tsx`: the hooks module. It saves the rate limits and the transcript width to `state.json` and registers the `/usage-band` command.
- `hooks/register.test.ts`: tests for the hooks module.
- `statusline.py`: the status line command. It reads `state.json` and the status line's JSON input, and prints the bars. `statusline.sh` is its wrapper.
- `types/index.d.ts`: the `$.state` contract. Every state value the module uses is declared here.

`state.json`, `.state-cache.json`, `__pycache__/`, `tsconfig.json` and `.claude-plugin/types/` are generated and stay out of git.

## Rules

- The hooks module has no DOM and no Node. Everything outside it goes through `$`.
- A render hook may not write state. The width is kept in a variable and a timer writes it.
- `statusline.py` runs on every status line redraw (`refreshInterval: 1`). Keep it fast and free of network calls.
- The status line has no controlling tty, so `/dev/tty` does not open. The terminal width is read from the `/dev/pts/*` of an ancestor process.
- The layout of one band is: percentage, bar, time left, a dot, then the window label (`5h`, `7d`, `ctx`). Keep it in both `render` modes.
- Circles use Nerd Font glyphs. Do not swap them for plain Unicode circles: those are too small.
- Do not edit the user's `settings.json` or the caveman status line script.

## Checks

Run these before a commit:

```
claude plugin validate .
claude plugin test .
python3 -I -m py_compile statusline.py
```

To try the status line by hand:

```
echo '{"context_window":{"used_percentage":42}}' | python3 -I statusline.py
```

## Commits

Write commit messages in Portuguese, Conventional Commit style (`feat:`, `fix:`, `docs:`), with a short title and a body that says why.
