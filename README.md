# best-flight-game-01

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Mamekmoen/best-flight-game-01/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Mamekmoen/best-flight-game-01/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Sunharrow — Archipelago Ring Run is an original flight game written in plain JavaScript on a 2D canvas, with no libraries and no network requests: it plays offline in a desktop browser from static files. At dawn you take the little Kitefin prop plane off a runway on a flattened island plateau, climb out over a seeded archipelago of green hills and sand shores, and thread eight rings strung on a wide loop around the home island, then a finish ring hanging over the runway. The chase view keeps the aircraft in frame over recognisable terrain, with a live HUD (altitude, speed, heading), a compass tape, a target guide, and a panel of lit instruments — airspeed and altitude gauges, an artificial horizon, throttle and ring-progress bars, and a stall warning when the wing gives up. The flight model has ground effect's opposite number: a real stall, a takeoff roll, and a sea that ends a flight as firmly as a hillside. Sound is synthesized live with WebAudio — engine, wind, the ring chime, the miss thud, the finish arpeggio — and the controls are the keyboard (arrows or A/D to bank, up/down to climb and dive, Shift/Ctrl or E/Q for throttle, P to pause) or the mouse. The entry program (`main.ts`) writes the game and its dossier of real screenshots, all rendered by the game's own code.

## Run it

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

Then open `out/game/index.html` in a desktop browser — or serve the folder with `node serve.ts` — and press Space to fly.

---

<sub>Entered on [make.fun](https://make.fun/?ref=w5fzvcsy&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
