"""Status line: the caveman badge on the left, the rate-limit bars on the right.

The bars come from state.json, which the usage-band mod keeps up to date.
"""
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
CAVEMAN = Path.home() / ".claude" / "hooks" / "caveman-statusline.sh"
BAR_WIDTH = 6
# below this many free cells the bars give way to circles
# Nerd Font circle-outline, then circle-slice-1..8 (full): one cell, fills it
CIRCLES = [chr(0xF0766)] + [chr(c) for c in range(0xF0A9E, 0xF0AA6)]
# cells the status line keeps free at its edges
MARGIN = 4

DIM = "\033[2m"
RESET = "\033[0m"
COLORS = {"success": "\033[32m", "warning": "\033[33m", "error": "\033[31m"}
ANSI = re.compile(r"\033\[[0-9;]*m")
STATE = HERE / "state.json"
# last state.json that parsed, for a read that lands mid-write
CACHE = HERE / ".state-cache.json"


def caveman_badge(payload: str) -> str:
    if not CAVEMAN.is_file():
        return ""
    try:
        run = subprocess.run(
            ["bash", str(CAVEMAN)], input=payload, capture_output=True, text=True, timeout=2
        )
        return run.stdout.strip("\n")
    except (OSError, subprocess.SubprocessError):
        return ""


def format_reset(resets_at, now: datetime) -> str:
    if not resets_at:
        return ""
    try:
        at = datetime.fromisoformat(str(resets_at).replace("Z", "+00:00"))
    except ValueError:
        return ""
    seconds = (at - now).total_seconds()
    if seconds <= 0:
        return ""
    minutes = -(-int(seconds) // 60)
    hours, rest = divmod(minutes, 60)
    if hours >= 24:
        return f"{hours // 24}d{hours % 24:02d}"
    return f"{hours}h{rest:02d}" if hours > 0 else f"{rest}m"


def bar_color(remaining: float) -> str:
    if remaining > 50:
        return COLORS["success"]
    return COLORS["warning"] if remaining >= 20 else COLORS["error"]


def load_state() -> dict:
    for attempt in range(2):
        try:
            state = json.loads(STATE.read_text())
        except (OSError, ValueError):
            if attempt == 0:
                time.sleep(0.05)
            continue
        try:
            CACHE.write_text(json.dumps(state))
        except OSError:
            pass
        return state
    try:
        return json.loads(CACHE.read_text())
    except (OSError, ValueError):
        return {}


def session_id(payload: str) -> str:
    try:
        return str(json.loads(payload).get("session_id") or "")
    except (ValueError, AttributeError):
        return ""


def context_percent(payload: str):
    """Share of the context window in use, as the status line reports it."""
    try:
        window = json.loads(payload).get("context_window") or {}
    except (ValueError, AttributeError):
        return None
    used = window.get("used_percentage")
    return None if used is None else min(100.0, max(0.0, float(used)))


def circle(percent: float) -> str:
    return CIRCLES[min(len(CIRCLES) - 1, round(percent / 100 * (len(CIRCLES) - 1)))]


def meters(state: dict, session: str, payload: str):
    """(label, percent shown, how full is good, reset text) per band."""
    out = []
    if not (state.get("isHidden") or (session and session in (state.get("hiddenSessions") or []))):
        by_kind = {l.get("kind"): l for l in state.get("limits") or []}
        now = datetime.now(timezone.utc)
        for label, kind in (("5h", "five_hour"), ("7d", "seven_day")):
            limit = by_kind.get(kind)
            if limit:
                remaining = min(100.0, max(0.0, 100 - float(limit.get("percentUsed", 0))))
                out.append((label, remaining, remaining, format_reset(limit.get("resetsAt"), now)))
    used = context_percent(payload)
    if used is not None:
        out.append(("ctx", used, 100 - used, ""))
    return out


def render(items, compact: bool) -> str:
    parts = []
    for label, percent, goodness, reset in items:
        color = bar_color(goodness)
        if compact:
            parts.append(f"{DIM}{label} {RESET}{color}{circle(percent)}{RESET}{DIM} {round(percent)}%{RESET}")
            continue
        filled = round(percent / 100 * BAR_WIDTH)
        summary = " \u00b7 ".join(s for s in (f"{round(percent)}%", reset) if s)
        parts.append(
            f"{DIM}{label} {RESET}{color}{'\u2501' * filled}{RESET}"
            f"{DIM}{'\u2500' * (BAR_WIDTH - filled)} {summary}{RESET}"
        )
    return f"{DIM} | {RESET}".join(parts)


def terminal_columns() -> int:
    """Width of the whole terminal. The width the mod saves is the transcript's,
    which a docked pane (file tree) narrows, so the bars would stop at the pane.
    The status line has no controlling tty, so ask the ancestor that owns one."""
    pid = os.getpid()
    while pid > 1:
        for fd in (0, 1, 2):
            try:
                tty = os.readlink(f"/proc/{pid}/fd/{fd}")
                if not tty.startswith("/dev/pts/"):
                    continue
                handle = os.open(tty, os.O_RDONLY | os.O_NOCTTY)
            except OSError:
                continue
            try:
                return os.get_terminal_size(handle).columns
            except OSError:
                pass
            finally:
                os.close(handle)
        try:
            pid = int(Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[1])
        except (OSError, ValueError, IndexError):
            return 0
    return 0


def main() -> None:
    payload = sys.stdin.read() if not sys.stdin.isatty() else ""
    left = caveman_badge(payload)
    state = load_state()
    items = meters(state, session_id(payload), payload)
    if not items:
        print(left)
        return
    width = terminal_columns() or int(state.get("columns") or 0)
    left_width = len(ANSI.sub("", left))
    right = render(items, False)
    if width and left_width + len(ANSI.sub("", right)) + MARGIN + 2 > width:
        right = render(items, True)
    visible = left_width + len(ANSI.sub("", right))
    gap = width - MARGIN - visible if width else 0
    print(f"{left}{' ' * max(2, gap)}{right}")


main()
