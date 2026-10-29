#!/usr/bin/env bash
# Usage: tools/update_music.sh path/to/track.wav   (run from anywhere)
set -euo pipefail
IN="$(realpath "$1")"; cd "$(dirname "$0")/.."
ffmpeg -y -v error -i "$IN" -c:a libmp3lame -b:a 192k assets/ambient.mp3
ffmpeg -y -v error -i "$IN" -c:a libopus -b:a 128k assets/ambient.ogg
python3 tools/beats_big.py "$IN" assets/bass_hits.json "${2:-0.7}"
sed -i -E "s/\?v=[0-9]+/?v=$(date +%s)/g" index.html
echo "done: assets/ambient.mp3 ambient.ogg bass_hits.json (cache bumped)"
