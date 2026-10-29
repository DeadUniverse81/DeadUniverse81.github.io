# DeadUniverse – prototype
Static site, no build. Preview: `python3 -m http.server 8000` then open http://localhost:8000

## Add a track
Edit the `TRACKS` array at the top of `main.js`:
```js
{ title: "Song", year: 2026, cover: "assets/covers/song.jpg", preview: "assets/previews/song.mp3",
  links: { spotify: "https://...", youtube: "https://...", bandcamp: "https://..." } },
```
Empty links show "Links coming soon"; no `preview` = no play button. Playing a preview ducks the ambient music.

## Swap the ambient music
Put the file at `assets/ambient.mp3` (or change `src` of `<audio id="ambient">` in index.html). Volume: `AMB_VOL` in main.js. It starts on ENTER (browsers block autoplay with sound); if missing, the site works silently.

## Swap the ambient track (bass-synced flashes)
`tools/update_music.sh path/to/final.wav` — converts to `assets/ambient.mp3` (192k) + `assets/ambient.ogg` (opus), detects bass hits (30–150 Hz) into `assets/bass_hits.json` and bumps the cache version. Optional 2nd arg = threshold (default 4.0; higher = fewer hits). Needs ffmpeg, python3, numpy, scipy.
While the music plays, the cross-window flashes follow the bass hits (intensity → brightness/decay). Before ENTER: rare random lightning; muted: none; no json: random. `?debug` logs hits to the console.
