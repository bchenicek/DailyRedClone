# Maintaining Daily Red

Notes for whoever updates the game next. They matter most when adding a new generation of Pokémon, which should happen about once every three years.

## Where things live

- **`main` branch:** the built website that GitHub Pages serves. Nothing on it is edited by hand; it is rebuilt from source.
- **`source` branch:** the source code, which is this branch.
  - `src/`: TypeScript for the game.
    - `game.ts`: team generation and Red's AI.
    - `app.ts`: all of the UI.
    - `stats.ts`: attempts, stats, replays and cloud sync.
    - `engine.js`: the entry point for the bundled battle simulator.
  - `out/index.html`: the page's HTML and CSS, edited directly.
  - `build/`: build scripts plus the generated data.
    - `pool.json`: every Pokémon and its sets.
    - `sprites.json`: sprite sheet coordinates.
    - `desc.json` and `battletext.json`: move and ability text.
    - Test scripts: `*-test.cjs` and friends.
  - `web/`: website-only pieces: Firebase setup (`web.js`, `config.js`), the service worker template, the manifest and icons.
  - `assets/`: sprite sheets and the bundled font.
- **Firebase project `dailyredclone`:** player summaries, friends and cloud saves.

## Outside data the build used

| What | Repository | Commit |
|---|---|---|
| Battle engine, sets, move data | github.com/smogon/pokemon-showdown | `7244fe8` (Oct 16, 2026) |
| Sprites | github.com/PokeAPI/sprites | `289e842` (Oct 17, 2026) |
| Pokédex ids for sprites | github.com/PokeAPI/pokeapi | `5ee47a9` (Oct 16, 2026) |

The scripts expect these repositories cloned to `/home/claude/ps` (built with `node build`), `/home/claude/pokesprites` and `/home/claude/pokeapi`. They also expect this branch at `/home/claude/dailyred`. All paths are hard-coded, so either clone to those paths or update the scripts.

## Building and deploying

1. `./build/build.sh` bundles the engine and app into `out/`. This is the Claude artifact version.
2. `./build/build-web.sh` turns `out/` into the website in `web/site/`. It adds Firebase, offline support and cache-busting.
3. Copy `web/site/` onto the `main` branch (not its `.git` folder), commit and push. GitHub Pages updates within a few minutes.

Run `node build/test.mjs 2` to check the engine; it plays full battles with both Reds. The `build/*.cjs` scripts are Playwright checks of individual features, and most of them need a local server on port 8765 (`out/`) or 8766 (`web/site/`).

## Rule 1: never change the past

Teams are not stored anywhere. Every day's team is rebuilt on demand from `pool.json`, the date and the mode. Replays are stored as just the choices made, then replayed through the engine. This means that changing anything that affects old dates silently changes old teams and breaks old replays. That covers the pool, set data, team rules and engine mechanics.

So every rule change in `game.ts` is date-gated (`CHAOS_SLOTS_FROM`, `GENDER_FROM`, `RANDOM_NATURES_FROM` and so on), and only applies from a future date. Endless mode uses keys like `x<runId>-<n>`, which sort after every date, so Endless always gets the newest rules. A run already in progress still needs protecting: see how Classic natures use the `c` key suffix (`cn` on the run).

## Adding a new generation

1. **Update Showdown** in `/home/claude/ps` and rebuild it. Wait until Showdown has Random Battle sets for most of the new Pokémon. That usually comes weeks after a game releases.
2. **Point the scripts at the new generation.** `build/pool.js` hard-codes `gen9`: `Dex.mod('gen9')`, `data/random-battles/gen9/...` and `gen9randomdoublesbattle`. `src/game.ts` and the engine shims may also reference gen 9 formats.
3. **Keep the old pool for old dates.** Don't overwrite `pool.json`. Save the new one as, say, `pool-gen10.json` and load both. In `generateTeam`, use the old pool for dates before a cutover date, and the new one from the cutover date and for Endless. Regenerating the old pool would also change existing Pokémon's sets, not just add new ones.
4. **Sprites.** Run `python3 build/sprites.py` after updating the sprite repository. New Pokémon often have no sprite for a while, so leave out any Pokémon without one rather than showing a blank. The script bumps a version hash (`v` in `sprites.json`) so phones fetch the new sheets.
5. **The new battle mechanic** (like Tera in Gen 9 or Dynamax in Gen 8) needs real work. `app.ts` needs a button or display for it. Red's AI in `game.ts` (`redChoice` and `redChoiceDoubles`) needs to know when to use it. Decide whether either side gets it at all.
6. **The engine and old replays.** A newer Showdown engine can make old replays play out differently, because of mechanics fixes. Either keep the old `engine.js` for days before the cutover (about 3.5 MB extra), or accept that some old replays may drift.
7. **Test, then deploy:**
   - Run `node build/test.mjs 2`.
   - Check that an old date (Oct 2026) still shows the same team, and that an old replay still plays to the same result.
   - Check that the cutover date shows new Pokémon.
   - Deploy to both the website and the Claude artifact.

## Other things that need a person

- **Changing the rules:** pick a future date, and gate the change on it.
- **Red's team** is fixed in `RED_TEAM` in `game.ts`.
- **Firebase** has free-tier limits. Usage is at console.firebase.google.com → dailyredclone → Usage.
