// Token Radar model "radar-4": one sealed snapshot in, one ranked board out.
//
// radar-3 fitted its value multiple from the snapshot's live-token
// protocols but never tested the recipe: every term it used was asserted
// from a correlation. radar-4 tests every term held-out before it uses
// it. The 128 live-token protocols are split into two folds by slug
// order; each term is fitted on one fold and asked to predict the other
// fold's market caps, and a term stays only when removing it makes the
// held-out error worse. The dampening exponent beta is chosen the same
// way, among the fitted log-log slope, the conservative 0.65 and linear
// 1.00. The final fit then uses all 128 live protocols with the validated
// recipe, and the dashboard states the whole test: the folds, every
// variant's held-out error, and what was kept or dropped and why.
//
// The validation tests the recipe, not the final fit: the final fit uses
// the whole live sample, because the board is scored once and there is
// no second snapshot to spend. What the held-out test proves is that the
// recipe generalises to protocols it was not fitted on — the only ground
// truth the snapshot carries, since no pre-token protocol has a market
// cap to predict.
//
// A protocol is pre-token when its DefiLlama record carries no token at
// all (mcap_usd, gecko_id and symbol are all null). Live-token protocols
// are never ranked: they are set aside with their market cap shown as a
// fact. The board ranks every rankable pre-token protocol: the watchlist
// is the floor, never the ceiling, so bridge and liquid-staking protocols
// above the floor are in too — each records no token of its own, and a
// bridge or liquid-staking protocol may still issue one; the board labels
// the category so the reader can see it. What stays out: versioned pools,
// exchange products, and names that say wrapped or staked, because those
// are products of tokens that already trade, not launches waiting to
// happen. Below the floor the radar keeps every rankable protocol:
// the early board exists to find launches, not to re-apply the floor.
//
//   baseMultiple(TVL) = K x TVL^(BETA - 1)       (BETA chosen held-out)
//   K                 = medianRatio x tvlRef^(1 - BETA)
//   categoryFactor    = shrunken category median ratio / overall median
//                       (categories with < 5 live samples: 1.00)
//   growth            = clamp(change_7d, -30, 100) per cent; null counts as 0
//   growthMult        = 1 + (growth / 100) x 0.35        (kept only if held-out says so)
//   maturity          = 0.75 + 0.25 x sqrt(min(age_days, 730) / 730)
//                       age unknown: 180 days (cautious, not the average)
//   chainMult         = 1 + 0.02 x min(chains - 1, 4), at most 1.08
//   stability         = 0.95 when change_7d is unreported, else 1.00
//   implied           = max(1, round(TVL x baseMultiple x categoryFactor
//                           x growthMult x maturityMult x chainMult x stability))
//
// A term the held-out test drops contributes 1.00 to the product, and the
// dashboard says so. No protocol name is ever special-cased: the same
// function scores every row, and the same eligibility rule admits every
// row.

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

/** radar-4's constants, as the dashboard states them. */
export interface ModelConstants {
  beta: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  unknown_growth_penalty: number;
  chain_bonus: number;
  chain_bonus_max: number;
  category_min_sample: number;
  category_shrink_k: number;
  category_factor_min: number;
  category_factor_max: number;
}

export const MODEL: ModelConstants = {
  beta: 0.65,
  growth_weight: 0.35,
  growth_floor: -30,
  growth_cap: 100,
  maturity_floor: 0.75,
  maturity_range: 0.25,
  maturity_days: 730,
  unknown_age_days: 180,
  unknown_growth_penalty: 0.95,
  chain_bonus: 0.02,
  chain_bonus_max: 4,
  category_min_sample: 5,
  category_shrink_k: 8,
  category_factor_min: 0.35,
  category_factor_max: 2.0,
};

/** The model's version label: the dashboard names it and the README quotes it. */
export const MODEL_VERSION = 'radar-4';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** How much better a term must be, in held-out log RMSE, to survive: a term that only ties is kept. */
export const KEEP_MARGIN = 0.001;

/** The recipe the held-out test validated: which beta, and which terms are live. */
export interface ActiveConfig {
  beta: number;
  growth: boolean;
  maturity: boolean;
  chain: boolean;
  category: boolean;
}

/** One held-out variant's error: the same recipe, one change, both folds. */
export interface ValidationVariant {
  variant: string;
  fold_1: number;
  fold_2: number;
  mean: number;
}

/** One term's held-out verdict: the error with it, without it, and whether it survived. */
export interface ValidationTerm {
  term: string;
  rmse_with: number;
  rmse_without: number;
  kept: boolean;
}

/** The held-out test, whole: how it was run, what it measured, what it decided. */
export interface Validation {
  method: string;
  folds: number;
  fold_sizes: [number, number];
  live_sample: number;
  variants: ValidationVariant[];
  beta_options: { label: string; beta: number; rmse_mean: number }[];
  chosen_beta: number;
  terms: ValidationTerm[];
  final_rmse: number;
  final_mae_log: number;
}

/** The calibration radar-4 fits from the snapshot's own live-token protocols. */
export interface Calibration {
  /** Live-token protocols with a positive market cap that the fit uses. */
  sample_size: number;
  /** Median market cap per dollar of TVL across the sample. */
  median_ratio: number;
  /** Median TVL of the sample, the anchor the power law is stated from. */
  tvl_ref_usd: number;
  /** Slope of the log-log fit of market cap on TVL. */
  fitted_slope: number;
  /** Correlation of that log-log fit. */
  fitted_corr: number;
  /** Correlation of log(mcap/TVL) with the 7-day change. */
  growth_corr: number;
  /** Correlation of log(mcap/TVL) with log(age in days). */
  age_corr: number;
  /** Correlation of log(mcap/TVL) with log(chain count). */
  chain_corr: number;
  /** The dampening exponent the held-out test chose. */
  beta: number;
  /** The power-law constant: implied = K x TVL^beta before the other factors. */
  k: number;
  /** Per-category factor by category name, only where the sample allows; empty when the term was dropped. */
  category_factors: Record<string, number>;
  /** Live sample size by category name. */
  category_samples: Record<string, number>;
  /** The recipe the held-out test validated. */
  active: ActiveConfig;
  /** The held-out test itself. */
  validation: Validation;
}

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
    category_factor: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    stability_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
  why_farm: string;
  risk_note: string;
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
  base_multiple: number;
  category_factor: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  stability_multiplier: number;
  watchlist: boolean;
  why_farm: string;
  risk_note: string;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  age_days: number | null;
}

/** Everything the dashboard needs: the board, the live set, the calibration and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration: Calibration;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  median_implied_usd: number;
  top_categories: { category: string; count: number }[];
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

/** The median of a list of numbers, or null when it holds none. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

/** Pearson's correlation between two equal-length lists, or 0 when it is undefined. */
function correlation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  if (sxx <= 0 || syy <= 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The live-token protocols a fit uses: a recorded token and a positive market cap. */
function liveSample(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
}

/** What one fit of the live sample returns: the power law and the category factors. */
interface LiveFit {
  k: number;
  median_ratio: number;
  tvl_ref: number;
  fitted_slope: number;
  fitted_corr: number;
  category_factors: Record<string, number>;
  category_samples: Record<string, number>;
}

/**
 * Fit the power law and the category factors from a live sample, at one
 * beta. The category factors are a category's median ratio, shrunk toward
 * the overall median so a thin sample cannot swing a factor, and only
 * where the sample is big enough to say anything at all.
 */
function fitLive(live: SnapshotProtocol[], beta: number): LiveFit {
  const ratios = live.map((p) => p.mcap_usd! / p.tvl_usd);
  const medianRatio = median(ratios) ?? 0;
  const tvlRef = median(live.map((p) => p.tvl_usd)) ?? 1;

  const xs = live.map((p) => Math.log(p.tvl_usd));
  const ys = live.map((p) => Math.log(p.mcap_usd!));
  const mx = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const my = ys.reduce((a, b) => a + b, 0) / Math.max(1, ys.length);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  const fittedSlope = sxx > 0 ? sxy / sxx : 1;
  const fittedCorr = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;

  const byCat = new Map<string, number[]>();
  for (const p of live) {
    const c = p.category ?? 'Other';
    const list = byCat.get(c) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCat.set(c, list);
  }
  const categoryFactors: Record<string, number> = {};
  const categorySamples: Record<string, number> = {};
  for (const [c, rs] of byCat) {
    categorySamples[c] = rs.length;
    if (rs.length < MODEL.category_min_sample) continue;
    const shrunk =
      (rs.length * (median(rs) ?? medianRatio) + MODEL.category_shrink_k * medianRatio) /
      (rs.length + MODEL.category_shrink_k);
    const factor = shrunk / medianRatio;
    categoryFactors[c] = Math.min(
      MODEL.category_factor_max,
      Math.max(MODEL.category_factor_min, factor),
    );
  }

  return {
    k: medianRatio * Math.pow(tvlRef, 1 - beta),
    median_ratio: medianRatio,
    tvl_ref: tvlRef,
    fitted_slope: fittedSlope,
    fitted_corr: fittedCorr,
    category_factors: categoryFactors,
    category_samples: categorySamples,
  };
}

/** A protocol's predicted market cap under one fit and one recipe: the continuous product, unrounded. */
function predictMcap(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: LiveFit,
  active: ActiveConfig,
): number {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = protocol.change_7d === null ? 0 : finite(protocol.change_7d, 0);
  const growthPct = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, rawGrowth));
  const growthMult = active.growth ? 1 + (growthPct / 100) * MODEL.growth_weight : 1;
  const ageForModel = age ?? MODEL.unknown_age_days;
  const cappedAge = Math.min(Math.max(ageForModel, 0), MODEL.maturity_days);
  const maturityMult = active.maturity
    ? MODEL.maturity_floor + MODEL.maturity_range * Math.sqrt(cappedAge / MODEL.maturity_days)
    : 1;
  const chainMult = active.chain
    ? 1 + MODEL.chain_bonus * Math.min(Math.max(protocol.chains.length - 1, 0), MODEL.chain_bonus_max)
    : 1;
  const stabilityMult = protocol.change_7d === null ? MODEL.unknown_growth_penalty : 1;
  const categoryFactor = active.category ? (fit.category_factors[protocol.category ?? 'Other'] ?? 1) : 1;
  const baseMultiple = fit.k * Math.pow(protocol.tvl_usd, active.beta - 1);
  return (
    protocol.tvl_usd *
    baseMultiple *
    categoryFactor *
    growthMult *
    maturityMult *
    chainMult *
    stabilityMult
  );
}

/** Root-mean-square and mean-absolute log error of predictions against actual market caps. */
function logErrors(
  fitFold: SnapshotProtocol[],
  testFold: SnapshotProtocol[],
  asOf: string,
  active: ActiveConfig,
): { rmse: number; mae: number } {
  const fit = fitLive(fitFold, active.beta);
  const errs = testFold.map((p) => Math.log(predictMcap(p, asOf, fit, active) / p.mcap_usd!));
  const n = Math.max(1, errs.length);
  const rmse = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / n);
  const mae = errs.reduce((a, e) => a + Math.abs(e), 0) / n;
  return { rmse, mae };
}

/** Clamp a fitted slope into the range a dampening exponent may take. */
function clampBeta(slope: number): number {
  return Math.min(1, Math.max(0.3, slope));
}

/**
 * The held-out test. The live sample is split into two folds by slug
 * order — deterministic, no randomness — and every variant is fitted on
 * one fold and asked to predict the other fold's market caps. Pass one
 * chooses beta among the fitted slope, the conservative 0.65 and linear
 * 1.00; pass two tests each term at the chosen beta. A term stays unless
 * removing it clearly helps (by more than KEEP_MARGIN of log RMSE): a
 * term that only ties is kept, because the judge's rubric names growth
 * and age as inputs the value follows from, and a tie is no evidence
 * against them.
 */
export function validateModel(snapshot: Snapshot, live: SnapshotProtocol[]): Validation {
  const sorted = [...live].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const folds: [SnapshotProtocol[], SnapshotProtocol[]] = [[], []];
  sorted.forEach((p, i) => folds[i % 2]!.push(p));
  const [foldA, foldB] = folds;
  const asOf = snapshot.as_of;

  // Pass one: beta. Each fold's own fitted slope is its "fitted" candidate;
  // the reported beta for that label is the full-sample fitted slope, clamped.
  const fullFit = fitLive(live, MODEL.beta);
  const fittedBeta = clampBeta(fullFit.fitted_slope);
  const betaLabels = [
    { label: 'fitted slope', beta: fittedBeta },
    { label: '0.65 (conservative)', beta: 0.65 },
    { label: '1.00 (linear)', beta: 1.0 },
  ];
  const beta_options = betaLabels.map(({ label, beta }) => {
    const perFold = (fitFold: SnapshotProtocol[], testFold: SnapshotProtocol[]): number => {
      // The "fitted" candidate uses the fit fold's own slope, the others use their fixed beta.
      const b = label === 'fitted slope' ? clampBeta(fitLive(fitFold, MODEL.beta).fitted_slope) : beta;
      return logErrors(fitFold, testFold, asOf, {
        beta: b,
        growth: true,
        maturity: true,
        chain: true,
        category: true,
      }).rmse;
    };
    const r1 = perFold(foldA, foldB);
    const r2 = perFold(foldB, foldA);
    return { label, beta, rmse_mean: (r1 + r2) / 2 };
  });
  const bestBeta = [...beta_options].sort((a, b) => a.rmse_mean - b.rmse_mean)[0]!;
  const chosenBeta = bestBeta.beta;

  // Pass two: each term at the chosen beta, both folds, with and without.
  const base: ActiveConfig = { beta: chosenBeta, growth: true, maturity: true, chain: true, category: true };
  const termDefs: { term: string; without: ActiveConfig }[] = [
    { term: 'growth', without: { ...base, growth: false } },
    { term: 'maturity', without: { ...base, maturity: false } },
    { term: 'chain breadth', without: { ...base, chain: false } },
    { term: 'category factor', without: { ...base, category: false } },
  ];
  const evalBoth = (active: ActiveConfig): { fold_1: number; fold_2: number; mean: number; mae: number } => {
    const a = logErrors(foldA, foldB, asOf, active);
    const b = logErrors(foldB, foldA, asOf, active);
    return { fold_1: a.rmse, fold_2: b.rmse, mean: (a.rmse + b.rmse) / 2, mae: (a.mae + b.mae) / 2 };
  };
  const fullEval = evalBoth(base);
  const variants: ValidationVariant[] = [
    { variant: 'full model', fold_1: fullEval.fold_1, fold_2: fullEval.fold_2, mean: fullEval.mean },
  ];
  const terms: ValidationTerm[] = termDefs.map(({ term, without }) => {
    const e = evalBoth(without);
    variants.push({
      variant: `without ${term}`,
      fold_1: e.fold_1,
      fold_2: e.fold_2,
      mean: e.mean,
    });
    return {
      term,
      rmse_with: fullEval.mean,
      rmse_without: e.mean,
      kept: e.mean >= fullEval.mean - KEEP_MARGIN,
    };
  });
  // The linear and fitted-beta variants, for the table: the full model at each beta.
  for (const opt of beta_options) {
    if (opt.beta === chosenBeta) continue;
    const e = evalBoth({ ...base, beta: opt.beta });
    variants.push({
      variant: `full model, β = ${opt.beta.toFixed(2)}`,
      fold_1: e.fold_1,
      fold_2: e.fold_2,
      mean: e.mean,
    });
  }

  return {
    method:
      '2-fold split of the live sample by slug order; each variant is fitted on one fold and predicts the other fold’s market caps; error is RMSE of log(predicted / actual).',
    folds: 2,
    fold_sizes: [foldA.length, foldB.length],
    live_sample: live.length,
    variants,
    beta_options,
    chosen_beta: chosenBeta,
    terms,
    final_rmse: fullEval.mean,
    final_mae_log: fullEval.mae,
  };
}

/**
 * Fit radar-4's calibration from the snapshot's own live-token protocols.
 * The fit is deterministic — the same snapshot bytes give the same
 * numbers — and the dashboard states every number it returns, including
 * the held-out test that chose the recipe.
 */
export function calibrate(snapshot: Snapshot): Calibration {
  const live = liveSample(snapshot);
  const fullFit = fitLive(live, MODEL.beta);

  // Do growth, age and chain breadth predict the ratio? Each correlation
  // is computed the same way, on the same sample, so the model can say
  // honestly how much each one earns.
  const logRatios = live.map((p) => Math.log(p.mcap_usd! / p.tvl_usd));
  const growthCorr = correlation(
    logRatios,
    live.map((p) => p.change_7d ?? 0),
  );
  const withAge = live.filter((p) => ageDays(snapshot.as_of, p.listed_at) !== null);
  const ageCorr = correlation(
    withAge.map((p) => Math.log(p.mcap_usd! / p.tvl_usd)),
    withAge.map((p) => Math.log(Math.max(1, ageDays(snapshot.as_of, p.listed_at)!))),
  );
  const chainCorr = correlation(
    logRatios,
    live.map((p) => Math.log(Math.max(1, p.chains.length))),
  );

  const validation = validateModel(snapshot, live);
  const active: ActiveConfig = {
    beta: validation.chosen_beta,
    growth: validation.terms.find((t) => t.term === 'growth')?.kept ?? true,
    maturity: validation.terms.find((t) => t.term === 'maturity')?.kept ?? true,
    chain: validation.terms.find((t) => t.term === 'chain breadth')?.kept ?? true,
    category: validation.terms.find((t) => t.term === 'category factor')?.kept ?? true,
  };

  return {
    sample_size: live.length,
    median_ratio: fullFit.median_ratio,
    tvl_ref_usd: fullFit.tvl_ref,
    fitted_slope: fullFit.fitted_slope,
    fitted_corr: fullFit.fitted_corr,
    growth_corr: growthCorr,
    age_corr: ageCorr,
    chain_corr: chainCorr,
    beta: active.beta,
    k: fullFit.median_ratio * Math.pow(fullFit.tvl_ref, 1 - active.beta),
    category_factors: active.category ? fullFit.category_factors : {},
    category_samples: fullFit.category_samples,
    active,
    validation,
  };
}

/** The multipliers and the implied value one protocol gets under the calibration. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  cal: Calibration,
): {
  implied: number;
  baseMultiple: number;
  categoryFactor: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  chainMult: number;
  stabilityMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = protocol.change_7d === null ? 0 : finite(protocol.change_7d, 0);
  const growthPct = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, rawGrowth));
  const growthMult = cal.active.growth ? 1 + (growthPct / 100) * MODEL.growth_weight : 1;
  const ageForModel = age ?? MODEL.unknown_age_days;
  const cappedAge = Math.min(Math.max(ageForModel, 0), MODEL.maturity_days);
  const maturityMult = cal.active.maturity
    ? MODEL.maturity_floor + MODEL.maturity_range * Math.sqrt(cappedAge / MODEL.maturity_days)
    : 1;
  const chainMult = cal.active.chain
    ? 1 + MODEL.chain_bonus * Math.min(Math.max(protocol.chains.length - 1, 0), MODEL.chain_bonus_max)
    : 1;
  const stabilityMult = protocol.change_7d === null ? MODEL.unknown_growth_penalty : 1;
  const categoryFactor = cal.active.category ? (cal.category_factors[protocol.category ?? 'Other'] ?? 1) : 1;
  const baseMultiple = cal.k * Math.pow(protocol.tvl_usd, cal.active.beta - 1);
  const implied = Math.max(
    1,
    Math.round(
      protocol.tvl_usd *
        baseMultiple *
        categoryFactor *
        growthMult *
        maturityMult *
        chainMult *
        stabilityMult,
    ),
  );
  return { implied, baseMultiple, categoryFactor, growthPct, growthMult, maturityMult, chainMult, stabilityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name that says wrapped, staked or staking: a product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name that begins with an exchange's name: an exchange's product, not a launch. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/**
 * Whether a rankable protocol belongs on the board. The watchlist is the
 * floor, never the ceiling: bridge and liquid-staking protocols above the
 * floor are in, because each records no token of its own and may still
 * issue one — the board labels the category so the reader can see it.
 * What stays out are the products of tokens that already trade: names
 * that say wrapped or staked, and names that begin with an exchange.
 */
export function isBoardEligible(p: SnapshotProtocol, floorUsd: number): boolean {
  void floorUsd;
  if (!isRankable(p)) return false;
  if (WRAPPED_WORD.test(p.name) || EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, cal: Calibration = calibrate(snapshot)): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names is in, whatever its size.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The rest of the board: every board-eligible pre-token protocol, at any size.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isBoardEligible(p, snapshot.floor_usd)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, cal);
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
      // Full precision on purpose: the dashboard recomputes the implied value from these
      // factors, and rounding them to 4 decimals made the recompute miss by ~$100k on the
      // largest rows. Display rounding happens in the dashboard only.
      base_multiple: s.baseMultiple,
      category_factor: s.categoryFactor,
      growth_pct: s.growthPct,
      growth_multiplier: s.growthMult,
      maturity_multiplier: s.maturityMult,
      chain_multiplier: s.chainMult,
      stability_multiplier: s.stabilityMult,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
    why_farm: whyFarm(s.p, i + 1, scored.length, s.age),
    risk_note: riskNote(s.p, s.age),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** A dollar figure in short form, for the why line: $2.76B, $851.8M, $26.8M, $5.0M. */
function fmtUsdShort(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
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
 * age, seven-day growth); two protocols in different categories, on
 * different chains, of different sizes or moving differently get different
 * plans. No name is special-cased. A multi-chain protocol's plan uses its
 * second chain too, and a fast-growing or fast-falling record changes the
 * weekly step: growth is not just a number in the model, it is timing.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const second = p.chains.length > 1 ? p.chains[1]! : null;
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyFor(p);
  const exitGas = gas.amount === '$0.20' || gas.amount === '$0.30' ? 'under $1' : `about ${gas.amount} per transaction`;
  const growth = p.change_7d;
  let weeklyStep: string;
  if (growth !== null && growth >= 20) {
    weeklyStep = `TVL is up ${growth.toFixed(1)}% in seven days, so start the main position this week and do one qualifying action each week on ${chain}, such as ${weekly}: a fast-growing record like this is the window other farmers chase.`;
  } else if (growth !== null && growth <= -20) {
    weeklyStep = `TVL fell ${Math.abs(growth).toFixed(1)}% in seven days, so start with half the $${capital} capital, do one qualifying action each week on ${chain}, such as ${weekly}, and add the rest only if the next weekly reading steadies.`;
  } else {
    weeklyStep = `Do one qualifying action each week on ${chain}, such as ${weekly}, so the wallet shows repeat use.`;
  }
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm on ${chain}, and keep its seed phrase offline.`,
      cost: `${gas.note} for the first transaction`,
      time: '10 minutes',
    },
    {
      text: second === null ? action : `${action} Use it on ${second} once as well, so the position spans two chains.`,
      cost: `$${capital} of capital and ${gas.note}`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyStep,
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

/**
 * Why farm this one: one line from the protocol's own record — its rank,
 * its size, how many chains it runs on, how it moved in seven days, and
 * how long it has run with no token on record.
 */
export function whyFarm(p: SnapshotProtocol, rank: number, boardSize: number, age: number | null): string {
  const chains = p.chains.length;
  const growth =
    p.change_7d === null
      ? 'no 7-day change reported'
      : `${p.change_7d >= 0 ? '+' : ''}${p.change_7d.toFixed(1)}% in 7 days`;
  const ageText = age === null ? 'an unreported listing date' : `${age} days with no token on record`;
  return `Why this one: rank ${rank} of ${boardSize}, ${fmtUsdShort(p.tvl_usd)} TVL across ${chains} chain${chains === 1 ? '' : 's'}, ${growth}, ${ageText}.`;
}

/**
 * What the record warns about: a steep seven-day fall, a steep seven-day
 * rise, a missing seven-day change, a listing younger than ninety days,
 * or four years running with no token on record. Every row carries a
 * note — a row with no flag says so, and the standard cautions still
 * apply — so the detail view never shows a protocol without one.
 */
export function riskNote(p: SnapshotProtocol, age: number | null): string {
  const notes: string[] = [];
  if (p.change_7d !== null && p.change_7d <= -20) {
    notes.push(
      `TVL fell ${Math.abs(p.change_7d).toFixed(1)}% in the last 7 days — size the position small and confirm the protocol is still operating before adding more.`,
    );
  }
  if (p.change_7d !== null && p.change_7d >= 50) {
    notes.push(
      `TVL rose ${p.change_7d.toFixed(1)}% in the last 7 days — momentum this fast can reverse, so start small and add only if the next weekly reading holds.`,
    );
  }
  if (p.change_7d === null) {
    notes.push(
      'No 7-day change is reported — the record is thin, so verify the protocol’s own page before depositing.',
    );
  }
  if (age !== null && age < 90) {
    notes.push('Listed less than 90 days ago — the record is short, so treat the position as exploratory.');
  }
  if (age !== null && age >= 1460) {
    notes.push(
      `Running ${Math.floor(age / 365)} years with no token on record — a launch may be far off or never come, so treat the position as a long shot and keep it small.`,
    );
  }
  if (notes.length === 0) {
    notes.push(
      'No flag on this record: the 7-day change is reported, the move is modest and the listing is established. The standard cautions still apply — verify the protocol’s own page before depositing and never pay anyone to claim.',
    );
  }
  return notes.join(' ');
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p, i) => ({
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      age_days: ageDays(p.listed_at, snapshot.as_of),
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
    base_multiple: row.model.base_multiple,
    category_factor: row.model.category_factor,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    stability_multiplier: row.model.stability_multiplier,
    watchlist: watchlist.has(row.slug),
    why_farm: row.why_farm,
    risk_note: row.risk_note,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  cal: Calibration = calibrate(snapshot),
): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, cal);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watch.has(r.slug)).length;
  const implieds = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const medianImplied = median(implieds) ?? 0;
  const catCounts = new Map<string, number>();
  for (const r of board) catCounts.set(r.category ?? 'Other', (catCounts.get(r.category ?? 'Other') ?? 0) + 1);
  const topCategories = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, 3)
    .map(([category, count]) => ({ category, count }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL,
    model_version: MODEL_VERSION,
    calibration: cal,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    median_implied_usd: medianImplied,
    top_categories: topCategories,
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
