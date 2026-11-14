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
Song hearts, footer totals, and on-site play counts are public counters on `abacus.jasoncameron.dev` (namespace `deaduniversemusic`). Live Wall, Fan Ideas, polls, comments, and accounts stay in Firebase and are not part of these counters.

The site reads epoch `e1` keys (`stats-policy.js`). Legacy keys are left in place as the backup. A browser records a visit, a like, or an on-site play only after Firebase auth has resolved, and only when that browser is not excluded and the signed-in user is not in `admins/{uid}`. Until then it still shows the numbers. The exclusion flag is `localStorage.du_count_exclude` and does not grant admin, delete, ban, or poll access.

Set it once per browser, after this version is deployed, by opening the site at `?du_owner=exclude` and pressing OK. Do that on the Windows PC and on the phone (and in each extra browser). Open that URL first. Pressing Cancel does not save the exclusion; that one load is still not counted, so open the URL again and press OK. `?du_owner=include` turns counting back on. The footer then says “This browser is not counted”.

Limits: the flag is per browser profile, not per person. Clearing site data or using a private window drops it. The parameter is visible in the page source; someone else can exclude only their own browser. A signed-out visit still counts unless the flag is set, and a counted visit cannot be subtracted afterwards. If auth never answers, that view is not counted. Old `du_like-*` / `du_seen` values are ignored, so a fresh total does not go negative and a filled heart does not stick to a zeroed counter.

`node --test tools/test-counters.mjs` checks the policy. `node tools/browser-check.mjs` loads the page in headless Chrome against a local mock and does not touch the live counters. `node tools/test-playbacks.mjs` checks qualified plays against that same kind of mock, then deletes only the mock's `play-*-e1` keys. `node tools/counter-reset.mjs` only reads counters and writes a local backup. It does not increment, reset, or delete unless you pass an explicit confirm flag. Hit-created legacy keys have no admin key and cannot be reset in place. Play keys are read with `/info` and are not on the reset allowlist.

## On-site play counts
Each catalog title has one shared counter, including when the same title is shown on Latest Release and in the library. The key is the title slug, not the card.

| Title | Read-only key |
| --- | --- |
| Rewritten by Light | `play-rewritten-by-light-e1` |
| Erased by Light | `play-erased-by-light-e1` |
| Ashes in My Veins | `play-ashes-in-my-veins-e1` |
| The Monolith | `play-the-monolith-e1` |
| The Oblivion | `play-the-oblivion-e1` |
| b4bYLon | `play-b4bylon-e1` |
| Burn the World Down | `play-burn-the-world-down-e1` |
| Lift Me Up | `play-lift-me-up-e1` |

Monitoring read (does not increment): `GET https://abacus.jasoncameron.dev/info/deaduniversemusic/<key>` or `GET /get/deaduniversemusic/<key>`. A missing key is shown as 0. Do not call `/hit/` from a monitor; `/hit/` adds one. There is no backfill from Spotify, YouTube, likes, or older visits. The counters start when this version is deployed.

A play is recorded only after 30 seconds of forward on-site preview audio (`assets/tracks/…`) at normal speed. Time is summed in steps of at most 1.25 seconds while the preview is actually playing. Paused time, stalled waiting, and seeks do not add the skipped gap. One count is stored per listen pass. The pass closes, and another 30 seconds can count, when the preview ends or the playhead jumps backward by more than 1.25 seconds after a count (replay or loop). Switching songs keeps the unfinished pass; coming back continues it. Two cards for one title share the pass, so a re-render or a second card cannot double-count the same listen. A failed write is not shown as a success and is not retried for 15 seconds.

Not counted: Spotify, YouTube, Apple Music, Deezer, SoundCloud, and other outbound links; the ambient intro; the unreleased teaser. Browsers with `localStorage.du_count_exclude` (`?du_owner=exclude`) and a signed-in Firebase `admins/{uid}` user still see the numbers and do not increment them. If auth never resolves, the listen is not recorded. If Abacus cannot be read, the card leaves the number blank instead of showing a fake 0.

The Exclusive card plays `assets/tracks/the_traveller.mp3` (The Traveller, alpha preview, opening only). It uses the same player as the catalog — analyzer, repeat, seek — and is not a like, an on-site play, or a Latest Release.

Deployment is GitHub Pages from `main` (`CNAME` → deaduniversemusic.com). This change is cache-busted as `style.css`, `stats-policy.js`, and `main.js` `?v=56`. Merging to `main` publishes it. Do not reset visit, like, or Firebase data as part of that.
