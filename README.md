# Token Radar — pre-token protocols ranked by implied value

A token launch radar built from one sealed DefiLlama snapshot. It answers,
for every protocol in the snapshot: what would its token be worth if the
protocol's record stayed as it is, and what should a reader do to farm it
before a token exists? It does not predict whether or when a token is
issued. Implied value is this entry's own claim, never make.fun's.

## What it is

- **Board:** 200 pre-token protocols, ranked by implied value. All 40
  protocols on the snapshot's watchlist are in, plus the 160 highest-TVL
  rankable pre-token protocols below the $50,000,000 floor.
- **Pre-token** means the protocol's DefiLlama record carries no token:
  `mcap_usd`, `gecko_id` and `symbol` are all null. The snapshot carries no
  audit, mint or contract field, so this board claims none of those.
- **Live token view:** 24 protocols whose token already trades, by market
  cap. They are set aside from the ranking; their market cap is a fact,
  not a model.
- **Dashboard:** a static offline page (`dashboard/`) with search, chain
  and category filters, pre-token / live tabs, sortable columns, a detail
  view per protocol (model breakdown + farm plan), and the model stated
  in full. No network, no CDN, no external font.

## How to run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Node 22.18 or later, standard library only, nothing to install. The
program reads the snapshot, writes `out/board.json` (the ranked board),
`out/data.js` (the dashboard's data), copies `dashboard/` and
`screenshots/` into `out/`, and writes `out/dossier.json`. Open
`out/dashboard/index.html` in a browser, or serve the folder with
`python3 -m http.server` from inside `out/dashboard` (with `data.js`
one level up, as the program writes it).

## The model — radar-2

Every row is scored by one function of the snapshot figures. No protocol
name is special-cased and no row is hand-picked.

```
growth     = clamp(change_7d, -40, 150) per cent; missing change counts as 0
growthMult = 1 + (growth / 100) x 0.65
maturity   = 0.55 + 0.45 x sqrt(min(age_days, 1460) / 1460)
             age unknown: 180 days
stability  = 0.95 when change_7d is unreported, else 1.00
implied    = max(1, round(tvl_usd x 0.28 x growthMult x maturity x stability))
```

`age_days` is the time from `listed_at` to the snapshot's `as_of` date.
Why this shape: growth is weighted 0.65 and clamped tighter below (-40)
and looser above (+150), because fast growth just before launch is the
signal and a steep seven-day fall should bite. Maturity is a square-root
curve, so the first two tokenless years count most and later years add
less. An unreported seven-day change costs 5%, and an unknown listing
date is credited 180 days, not a full year — we do not hand out maturity
credit for a date we never saw.

## What is filtered out, and why

- Protocols that record a token (`mcap_usd`, `gecko_id` or `symbol` set)
  are not ranked: their token already exists, so an implied launch value
  does not apply. The top 24 by market cap are shown separately.
- `CEX` protocols are not ranked: an exchange's balance sheet is not a
  protocol waiting on a launch.
- Names ending in a version marker (`V2`, `v2`, `2.0` and the like) are
  not ranked: they are a pool of another protocol, not a launch of
  their own.
- Wrapped, staked and bridged products of tokens that already trade are
  off the watchlist by the snapshot's own rule, and the early radar only
  adds protocols below the floor that pass the same rankable test.

## Farm plans

Each row carries six steps, derived from that protocol's own record:
category picks the action (supply for Lending, liquidity for Dexs,
bridge for Bridge, stake for Staking, margin for Perps, and so on),
the first chain picks the gas cost (Ethereum about $8 a transaction,
Solana about $0.20, L2s about $0.60), TVL picks the capital
($50 / $100 / $150 / $250), and age picks the hold (21–60 days).
Every step states its cost and its time.

## Data source

DefiLlama protocol index, sealed snapshot `snapshot.json`, `as_of`
2026-11-14, fetched 2026-11-14T01:18:33Z from the DefiLlama protocols
endpoint. The snapshot holds 758 protocols at or above $5,000,000 TVL;
the watchlist holds 40 of them at or above the $50,000,000 floor with
no token on record. The snapshot is read as-is and never modified.
