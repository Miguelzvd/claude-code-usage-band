#!/bin/bash
# Status line command: caveman badge left, rate-limit bars right (statusline.py)
exec python3 -I "$(dirname "$(readlink -f "$0")")/statusline.py"
