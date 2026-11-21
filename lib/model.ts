// Token Radar model "radar-2": one sealed snapshot in, one ranked board out.
//
// A protocol is pre-token when its DefiLlama record carries no token at all
// (mcap_usd, gecko_id and symbol are all null). Live-token protocols are
// never ranked: they are set aside with their market cap shown as a fact.
//
// Implied value is a claim about what a token would be worth if the
// protocol's record stayed as it is. It follows only from the snapshot's
// own figures -- TVL, seven-day TVL change, and how long the protocol has
// run with no token -- and from nothing else. No protocol name is ever
// special-cased: the same function scores every row.
//
//   base      = tvl_usd x BASE_MULTIPLE            (0.28)
//   growth    = clamp(change_7d, -40, 150) per cent; null change counts as 0
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT   (0.65)
//   maturity  = 0.55 + 0.45 x sqrt(min(age_days, 1460) / 1460)
//               age unknown: 180 days (cautious, not the average)
//   stability = 0.95 when change_7d is unreported, else 1.00
//   implied   = max(1, round(base x growthMult x maturity x stability))
//
// Why this shape, and how it differs from the house starter (radar-1):
// growth matters more (0.65 vs 0.50) and is clamped tighter on the downside
// (-40 vs -60) and looser on the upside (150 vs 120), because a protocol
// still growing fast just before launch is the signal, while a steep
// seven-day fall is a warning that should bite. Maturity is a square-root
// curve instead of a straight line, so the first two years of surviving
// with no token count most and the third and fourth years add less: a
// protocol that has waited four years is proven, not twice as proven as
// one that waited two. An unreported seven-day change is penalised 5%,
// because an unreadable record is a weaker record. Age unknown is 180
// days, not 365: we do not hand a protocol a full year of maturity credit
// for a date we never saw.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** radar-2's constants, as the dashboard states them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  unknown_growth_penalty: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.28,
  growth_weight: 0.65,
  growth_floor: -40,
  growth_cap: 150,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 180,
  unknown_growth_penalty: 0.95,
};

/** The model's version label: the dashboard names it and the README quotes it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One farm step: its action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    stability_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row; farm plans are derived in the page from the same rules. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  stability_multiplier: number;
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; stabilityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = protocol.change_7d === null ? 0 : finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const cappedAge = Math.min(Math.max(ageForModel, 0), model.maturity_days);
  const maturityMult = model.maturity_floor + model.maturity_range * Math.sqrt(cappedAge / model.maturity_days);
  const stabilityMult = protocol.change_7d === null ? model.unknown_growth_penalty : 1;
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * stabilityMult));
  return { implied, growthPct, growthMult, maturityMult, stabilityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names is in, whatever its size.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the floor, by TVL.
  // A chosen protocol stays chosen; the early rows only add what is missing.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const watch = new Set(snapshot.watchlist);
  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      stability_multiplier: round4(s.stabilityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** Typical gas for one transaction on a chain, in dollars, from the chain's own fee level. */
export function gasFor(chain: string): { amount: string; note: string } {
  const c = chain.toLowerCase();
  if (c.includes('ethereum')) return { amount: '$8', note: 'about $8 of gas on Ethereum' };
  if (c.includes('bitcoin')) return { amount: '$3', note: 'about $3 of network fee on Bitcoin rails' };
  if (c.includes('solana')) return { amount: '$0.20', note: 'about $0.20 of fee on Solana' };
  if (c.includes('base') || c.includes('arbitrum') || c.includes('optimism') || c.includes('blast') || c.includes('linea') || c.includes('scroll') || c.includes('zksync') || c.includes('mode'))
    return { amount: '$0.60', note: 'about $0.60 of gas on this L2' };
  if (c.includes('binance') || c.includes('bnb')) return { amount: '$0.30', note: 'about $0.30 of gas on BNB Chain' };
  if (c.includes('polygon')) return { amount: '$0.50', note: 'about $0.50 of gas on Polygon' };
  if (c.includes('avalanche')) return { amount: '$1', note: 'about $1 of gas on Avalanche' };
  if (c.includes('tron')) return { amount: '$1', note: 'about $1 of energy fee on Tron' };
  return { amount: '$2', note: 'about $2 of gas on this chain' };
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  if (age < 730) return 30;
  return 21;
}

/** The category's main action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and open a small borrow against it to show both sides.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the LP position open.`;
  if (c.includes('yield')) return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and leave the yield compounding.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged funds inside its app once.`;
  if (c.includes('restak') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade, then close it the same week.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}, then settle it when the market closes.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares for the whole hold.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the protocol.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it to maturity of the position.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active through the hold.`;
  if (c.includes('farm')) return `Deposit $${capital} into ${name}'s main farm on ${chain} and stake the farm receipt.`;
  if (c.includes('liquid')) return `Deposit $${capital} of the liquid staking asset through ${name} on ${chain} and hold the receipt.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and use its main feature once a week.`;
}

/** The category's weekly qualifying action: the repeatable habit that counts. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp')) return 'a supply top-up, a borrow or a repay';
  if (c.includes('dex')) return 'a swap or a liquidity rebalance in the main pool';
  if (c.includes('yield') || c.includes('farm') || c.includes('vault') || c.includes('curator') || c.includes('allocator')) return 'a deposit, a harvest or a vault rebalance';
  if (c.includes('bridge')) return 'a small bridge in either direction';
  if (c.includes('staking') || c.includes('restak') || c.includes('liquid')) return 'a stake top-up or a rewards claim';
  if (c.includes('perpetual') || c.includes('derivative')) return 'one small hedged trade';
  if (c.includes('prediction')) return 'one market position or a vote on an outcome';
  if (c.includes('rwa')) return 'a mint, a hold check or a rewards claim';
  if (c.includes('stable')) return 'a mint, a redeem or a transfer inside the protocol';
  if (c.includes('insurance')) return 'a cover check or a premium top-up';
  return 'a deposit, a swap or a vote inside the app';
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * Every value comes from the protocol's own record (category, chains, TVL,
 * age); two protocols in different categories, on different chains, or of
 * different sizes get different plans. No name is special-cased.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyFor(p);
  const exitGas = gas.amount === '$0.20' || gas.amount === '$0.30' ? 'under $1' : `about ${gas.amount} per transaction`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm on ${chain}, and keep its seed phrase offline.`,
      cost: `${gas.note} for the first transaction`,
      time: '10 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and ${gas.note}`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action each week on ${chain}, such as ${weekly}, so the wallet shows repeat use.`,
      cost: `${gas.note} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity spans more than one snapshot window.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page from its official site and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay anyone to claim',
      time: '10 minutes',
    },
    {
      text: `Log the wallet, the dates and every transaction hash, then unwind in two transactions and keep the log for the next farm.`,
      cost: `${exitGas} to unwind`,
      time: '10 minutes to unwind',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    stability_multiplier: row.model.stability_multiplier,
    watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watch.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, watch)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
