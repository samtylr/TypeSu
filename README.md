# TypeSu

A 4-key vertical-scrolling rhythm game where you **type** the falling letters. Each song gets a poem; its letters fall as diamond notes timed to the song's beat, and you hit each one by typing that letter as it reaches the line.

## Play (no install)

1. Download **[TypeSu.html](TypeSu.html)** (or the whole repo: Code → Download ZIP).
2. Double-click it. It opens in your browser; nothing to install.
3. Press **Enter** to play the built-in demo track, or **Load audio file…** to use your own music (mp3, ogg, wav, flac, m4a).

Works offline. Chrome, Edge and Firefox are tested; fonts fall back to system fonts without internet.

## Develop

```bash
npm install
npm run dev            # live-reloading dev server
npm run build:single   # rebuild TypeSu.html after changing the code
```

| Key | Action |
| --- | --- |
| a–z | Hit notes |
| Enter | Play (menu) |
| 1–4 | Pick difficulty (menu) |
| Esc | Quit to menu |
| T | Tap tempo (timing screen) |
| R | Retry (results) |

**First time?** Click **Calibrate** and tap Space along with the clicks. This measures your audio latency so notes line up with what you hear.

## How it works

- **Lanes follow your hands.** Every letter has a home lane from the touch-typing finger that presses it on QWERTY: lane 1 `q a z w s x`, lane 2 `e d c r f v t g b`, lane 3 `y h n u j m i k`, lane 4 `o l p`. On Hard and Insane a comfort solver may move a letter to the other lane on the same hand to avoid "fake jacks" (two different letters stacked in one lane). Double letters always stay as a real jack. `hello` → lanes 3-2-4-4-3.
- **BPM sync.** On import the song is analysed once with [web-audio-beat-detector](https://github.com/chrisguttandin/web-audio-beat-detector) for tempo and first-beat offset, folded into 85–200 BPM. The timing screen lets you halve/double, nudge the offset in 1 ms steps, tap tempo, and preview with metronome clicks. Corrections are saved per song in the browser.
- **Charts.** Letters snap to the beat grid. Loudness per 4-bar section picks the snap: quiet sections are slower, loud sections faster, near-silent sections empty. Difficulty tiers loosely follow osu!mania 4K ranking guidelines and cap letters per second. The same song always generates the same chart, and every difficulty types the same poem.
- **Timing.** Game time comes from the audio hardware clock (`AudioContext.getOutputTimestamp`), not frame timers, and key presses use the event's own timestamp.
- **Judgements.** Marvelous ±22 ms, Perfect ±45, Great ±90, Good ±135, Miss beyond 180. A wrong letter right next to a note counts as a typo and breaks combo.

## Project layout

```
src/
  chart/    lanes.ts (comfort solver), generator.ts, poems.ts, types.ts, rng.ts
  audio/    clock.ts (audio-clock playback), analysis.ts (BPM, energy), demo.ts (synth demo track)
  engine/   session.ts (judging, combo, accuracy), render.ts (canvas playfield)
  ui/       storage.ts (settings and per-song timing overrides)
  main.ts   menus, timing screen, calibration, game loop
tests/      unit tests for the solver, generator and judging
```

## Scripts

- `npm run dev`: local dev server
- `npm test`: unit tests (Vitest)
- `npm run build`: typecheck and production build into `dist/`
- `npm run build:single`: build the one-file `TypeSu.html` in the repo root

## Poems

All poems in `src/chart/poems.ts` were published before 1929 and are in the public domain. Add more by appending to the list.

## Roadmap

- Essentia.js beat lists and onsets for more accurate placement and variable-tempo songs
- More keyboard layouts (AZERTY, Dvorak, Colemak): just another lane table
- Strict-lane mode, chord words, more poems
