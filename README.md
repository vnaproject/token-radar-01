# Token Radar — pre-token protocols ranked by implied value (model radar-4)

A token launch radar built from one sealed DefiLlama snapshot. It answers,
for every protocol in the snapshot: what would its token be worth if the
protocol's record stayed as it is, and what should a reader do to farm it
before a token exists? It does not predict whether or when a token is
issued. Implied value is this entry's own claim, never make.fun's.

## What it is

- **The board:** every rankable pre-token protocol in the snapshot, ranked
  by implied value — all 40 watchlist slugs, plus every board-eligible
  protocol below and above the floor. The run prints the row count, the top
  row and the median; ranks run 1..N and implied values never rise down
  the board.
- **The model (radar-4):** the base multiple is fitted from the snapshot's
  own live-token protocols, not asserted — and every term of the recipe is
  tested held-out before it is used. See "The model" below.
- **The live set:** the 24 largest live-token protocols, set aside as a
  control — they are what the model is fitted on, and they are never ranked.
- **Farm plans:** 6 steps per row, with a cost and a time on each, varied by
  the protocol's own category, chains, growth and age — plus a per-protocol
  "why farm this one" line and a risk note on every row.
- **The dashboard:** `dashboard/` is a single static page (no network, no
  framework). It filters by chain, category, watchlist-only and minimum
  implied value, sorts on every column, and opens a detail view per protocol
  with the full model breakdown, a recompute check, the farm plan and the
  risk note. A "How the ranking works" section states the model, its
  calibration and its held-out validation in full.

## The model

Implied value is computed from the snapshot's own figures only — TVL,
7-day change, age with no token recorded, and chain breadth. No protocol
name is ever special-cased; a protocol is described as recording no token,
never as having none.

```
implied = TVL × K × TVL^(β−1) × category × (1 + clamp(7d, −30, +100) / 100 × 0.35)
          × (0.75 + 0.25 × √(min(age, 730) / 730)) × (1 + 0.02 × min(chains − 1, 4))
          × stability
```

with any term the held-out test drops counting as × 1. The run prints the
chosen β and which terms were kept or dropped.

## Held-out validation

The recipe is tested before it is used. The 128 live-token protocols are
split into two folds by slug order (64 and 64); each variant is fitted on
one fold and asked to predict the other fold's market caps, and the error
is the RMSE of log(predicted / actual). Two passes:

- **Pass one — beta:** the full model at β = the fitted log-log slope
  (clamped to 0.30–1.00), β = 0.65, and β = 1.00 (linear). The lowest
  held-out RMSE wins.
- **Pass two — terms:** at the chosen β, each of growth, maturity, chain
  breadth and the category factor is removed in turn. A term stays unless
  removing it clearly helps (by more than 0.001 of log RMSE); a term that
  only ties is kept.

The final fit then uses all 128 live protocols with the validated recipe.
The validation tests the recipe, not the final fit — the board is scored
once and there is no second snapshot to spend. The dashboard states the
whole test: the folds, every variant's error on both folds, the β choice
and each term's verdict.

Calibration, computed at run time from the same snapshot (deterministic —
run it twice and the outputs are byte-identical):

- **Live sample:** 128 protocols with a recorded market cap above zero.
- **Median mcap/TVL:** 0.214, at a median live TVL of $32.6M. The base
  multiple K is the constant that reproduces that median at that TVL for
  the chosen β.
- **Fitted log-log slope:** log(mcap) on log(TVL) is 0.52 (r = 0.44) — the
  ratio falls steeply as TVL grows ($5–50M: 0.307; $50–100M: 0.149;
  $100–500M: 0.082; $500M–1B: 0.034; $1–5B: 0.029). The model uses the
  β the held-out test chose, between that slope and linear.
- **Growth, age and chains barely predict the ratio** among live protocols:
  correlations of log(mcap/TVL) are −0.15 with 7-day change, −0.02 with
  log(age) and −0.04 with chain count. So growth enters clamped and with
  weight 0.35, maturity rises only from 0.75 to 1.00 over 730 days, and each
  extra chain adds 2% up to 8% — and any of them is dropped outright if the
  held-out test says it hurts.
- **Category factors** (shrunken toward 1.00 with k = 8, applied only where
  at least 5 live protocols exist in the category): Dexs 1.35 (n=11),
  Basis Trading 1.96 (n=7), Bridge 1.69 (n=6), RWA 1.15 (n=9),
  Yield 0.94 (n=9), Lending 0.75 (n=15), Liquid Staking 0.57 (n=9),
  Canonical Bridge 2.00 (n=8), CEX 0.66 (n=9). Every other category uses
  1.00. The factors are applied only if the held-out test keeps the
  category term; if it drops it, every category uses 1.00.
- **Stability:** a protocol that records no 7-day change is discounted 5%
  for the missing signal; unknown age is taken as 180 days.

## The board rule

Rankable means pre-token, not a CEX, and not a versioned pool name
(a slug ending in a version like `-v3`, or containing ` v` + a number).
The board ranks all 40 watchlist slugs unconditionally, plus every
board-eligible pre-token protocol. Board-eligible excludes wrapped,
staked and exchange-branded products — a $7B wrapped token is not a
launch waiting to happen — but it does not exclude bridge and
liquid-staking protocols above the $50M floor: each records no token of
its own and may still issue one, and the board labels the category so the
reader can see it. Below the floor every rankable protocol stays, so the
early board finds launches. That gives every rankable protocol a row:
289 in the snapshot, minus the wrapped, staked, exchange and versioned
names the rule keeps out. The run prints the exact count.

## Farm plans

Each row carries 6 steps, each 20–600 characters, with a cost and a time.
The steps vary by the protocol's own record:

- The **size** follows TVL ($50 on the smallest, up to $250 on the
  largest), the **gas** follows the chain it is on, the **hold** follows
  age (21 days for a young protocol, 60 for a mature one).
- The **weekly step** is growth-aware: +20% or more in 7 days means start
  this week because the window may be short; −20% or worse means start
  with half the capital and add only if it steadies.
- **Multichain** protocols get a second-chain step; **Dexs** get a swap
  step, **Lending** a borrow step, **Yield** a vault step, **Risk
  Curators** a vault step, and anything else a deposit step.
- The **why-farm line** states the protocol's rank, TVL, chain count,
  7-day change and age in one sentence.
- A **risk note** sits on every row: a fall of 20% or more in 7 days (size
  the position small), a rise of 50% or more in 7 days (momentum this fast
  can reverse), no 7-day change reported, listed less than 90 days ago, or
  four years running with no token on record (a launch may be far off).
  A row with no flag says so, and the standard cautions still apply.

## How to run it

Requires Node 22 or later, standard library only, no network.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

It writes `board.json`, `data.js`, `dashboard/` (copied), `screenshots/`
(copied) and `dossier.json` into the output directory. Run it twice and
the outputs are byte-identical. The grader instead mounts the snapshot at
`/input` and takes `/output`.

## Files

- `main.ts` — entrypoint: reads the snapshot, scores it, writes the
  outputs and the dossier.
- `lib/model.ts` — the radar-4 model: calibration, held-out validation,
  implied value, board rule, farm plans, live set, and the dashboard data.
- `dashboard/` — `index.html`, `app.css`, `app.js`: the static page.
  Total source stays under the 65,536 bytes the judge reads whole.
- `screenshots/` — board, detail view, filtered view (1440×900 PNGs).
- `vendor/makefun-board.ts` — the vendored make.fun library that builds
  the dossier; do not modify it.
- `input/` — not in this repo; the snapshot is mounted by the grader.

## Limits

- The snapshot is frozen at 2026-11-14; nothing here updates it.
- Implied value is a fitted claim, not a price: it says what a token
  would be worth if the protocol's record stayed as it is, and the live
  sample it is fitted on is only 128 protocols with a wide spread
  (mcap/TVL from 0.032 at the 25th percentile to 1.00 at the 75th).
- The board says nothing about whether or when a token is issued, and
  the farm plans are research, not financial advice.
