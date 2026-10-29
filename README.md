# Castle Blotto Lab

An interactive simulator for a Colonel Blotto variant: **5 castles worth 1–5 points, 100 soldiers**, played two ways:

- **Game 1, head to head:** your allocation plays every other player; score = average castle points (out of 15).
- **Game 2, four-way battle:** random groups of 4; each castle goes to whoever sends the most; only your placement counts (9 / 4 / 2 / 0).

The question behind both games is the same: *what will everyone else do?* This project models the opposing field explicitly, lets it adapt, and then searches for the allocation that does best against it. It can mix in **real human submissions** from FiveThirtyEight's Riddler castle puzzles.

**Live demo:** `https://<your-username>.github.io/castle-blotto-lab/` (after you enable Pages, see below)

## What's inside

| Path | What it does |
|---|---|
| `site/index.html` | **Lab.** Build an opponent field, evolve it, get the Game 1 and Game 2 optimum, compare your own candidates, inspect a heat map of the field, replay random battles. |
| `site/play.html` | **Play vs CPU.** Castles show their value as flags and turn the winner's color after each attack; single, continuous, or 1,000 fast battles; 1 or 3 CPU opponents. |
| `site/js/castle.js` | Castle drawing traced from the project artwork: flags show a castle's value, the tower fills with the winner's color or with a troop gauge. |
| `site/js/engine.js` | Shared engine (no dependencies): scoring, opponent archetypes, evolution, exact best response, simulated annealing, CSV parsing, 10→5 castle mapping. |
| `scripts/fetch-riddler.mjs` | Downloads the Riddler CSVs, keeps valid rows, maps them to 5 castles, writes `site/data/riddler.json`. |
| `cli/blotto.mjs`, `cli/genteam.mjs` | Command-line round-robin tournament and random-army generator, inspired by [jes/blotto](https://github.com/jes/blotto). |
| `tests/` | `node:test` unit tests, including a brute-force check of the Game 1 scorer and a cross-check of the fast Game 2 path. |

## Methods

**Opponent field.** One dial sets who the opponents are: from *all random* to *all human-like*. Each opponent is drawn independently: with probability `p` it copies a human-like allocation (a real Riddler submission mapped to 5 castles, or a synthetic archetype when no data is loaded) and then moves up to `k` single soldiers; otherwise it allocates uniformly at random. Mixing is done *by player*, never by averaging allocations, because averaging would erase real features such as leaving a castle empty. The random seed only makes runs reproducible; it is not part of the dial.

**Adaptation.** Each generation, players are scored under the game's own rules; the bottom 20% copy someone from the top 30% and mutate, and 10% of replacements are fresh draws to keep diversity. Game 1 and Game 2 evolve separate fields because they reward different things.

**Game 1 (exact).** Average castle points against a field is *separable by castle*: the expected value of sending `x` soldiers to castle `c` depends only on the field's distribution at castle `c`. A dynamic program over (castle, soldiers used) therefore finds the exact best response among all ~4.6 million allocations.

**Game 2 (search).** Placement payoff depends on all four totals jointly, so it is not separable. Simulated annealing runs on 2,500 sampled opponent triples, followed by a local polish; the result and all candidates are then re-evaluated on 20,000 fresh triples to avoid overfitting the training sample.

**Riddler data mapping.** Riddler games use 10 castles worth 1–10. Castle `i` is mapped by value rank onto 5 bins, which for 10 castles means pairing 1+2, 3+4, …, 9+10. The merged values are 3:7:11:15:19; as shares of the total (5.5%, 12.7%, 20.0%, 27.3%, 34.5%) they are close to this game's 1:2:3:4:5 (6.7%, 13.3%, 20.0%, 26.7%, 33.3%).

## Limitations

- Nobody knows how real applicants will allocate. Results hold only for the field you assume; robust choices are the ones that rank well across many reasonable fields and seeds.
- Riddler players were puzzle enthusiasts, and later rounds had seen earlier results. A 2026 applicant pool is a different population (for example, many people may ask an AI assistant and get similar answers).
- The 10→5 mapping preserves value shares, not the finer strategic structure of a 10-castle game.

## Run locally

Requires Node 18+ (for built-in `fetch` and `node:test`). No other dependencies.

```bash
npm test            # unit tests
npm run data        # download + preprocess Riddler data into site/data/riddler.json
npm run serve       # open http://localhost:8000
npm run tournament  # 8 random armies, round robin + 20,000 four-way groups
```

ES modules do not load from `file://`, so use the local server rather than double-clicking the HTML file. Without `riddler.json`, the lab page lets you upload the CSV files directly.

Custom tournament:

```bash
printf 'mine 3 12 22 28 35\nflank 21 29 50 0 0\nprop 7 13 20 27 33\neven 20 20 20 20 20\n' | node cli/blotto.mjs --four 20000
```

## Deploy (GitHub Pages)

1. Push this repository to GitHub as `castle-blotto-lab` on the `main` branch.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` runs the tests, downloads and preprocesses the Riddler data, and publishes `site/`. If the download fails, the site still deploys and falls back to CSV upload.

## Data and credits

- Riddler castle submissions: [fivethirtyeight/data/riddler-castles](https://github.com/fivethirtyeight/data/tree/master/riddler-castles). FiveThirtyEight publishes this repository under CC BY 4.0; please check its license file and keep the attribution if you redistribute derived data.
- CLI design inspired by [jes/blotto](https://github.com/jes/blotto) by James Stanley (no code copied).
- Varied-value castles UI inspired by [Colonel Blotto game with varied castles](https://rf.mokslasplius.lt/colonel-blotto-game-varied-castles/) by Aleksejus Kononovicius.
