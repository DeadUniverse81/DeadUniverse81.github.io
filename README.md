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

## Visit and like counts
Song hearts and the footer totals are public counters on `abacus.jasoncameron.dev` (namespace `deaduniversemusic`). Live Wall, Fan Ideas, polls, and accounts stay in Firebase and are not part of these counters.

The site reads epoch `e1` keys (`stats-policy.js`). Legacy keys are left in place as the backup. A browser records a visit or a like only after Firebase auth has resolved, and only when that browser is not excluded and the signed-in user is not in `admins/{uid}`. Until then it still shows the numbers. The exclusion flag is `localStorage.du_count_exclude` and does not grant admin, delete, ban, or poll access.

Set it once per browser, after this version is deployed, by opening the site at `?du_owner=exclude` and pressing OK. Do that on the Windows PC and on the phone (and in each extra browser). Open that URL first. Pressing Cancel does not save the exclusion; that one load is still not counted, so open the URL again and press OK. `?du_owner=include` turns counting back on. The footer then says “This browser is not counted”.

Limits: the flag is per browser profile, not per person. Clearing site data or using a private window drops it. The parameter is visible in the page source; someone else can exclude only their own browser. A signed-out visit still counts unless the flag is set, and a counted visit cannot be subtracted afterwards. If auth never answers, that view is not counted. Old `du_like-*` / `du_seen` values are ignored, so a fresh total does not go negative and a filled heart does not stick to a zeroed counter.

`node --test tools/test-counters.mjs` checks the policy. `node tools/browser-check.mjs` loads the page in headless Chrome against a local mock and does not touch the live counters. `node tools/counter-reset.mjs` only reads counters and writes a local backup. It does not increment, reset, or delete unless you pass an explicit confirm flag. Hit-created legacy keys have no admin key and cannot be reset in place.
