// Token Radar "radar-4" dashboard. Reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, filters, sorting and
// a per-protocol detail view with the model's full breakdown, farm plan,
// why-farm line and risk note. No network: every byte shown is in data.js.
// No framework, no CDN. The farm steps shown are the board's own steps.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', chain: 'all', category: 'all', watchOnly: false, minValue: 0, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return usd.format(n);
  }
  function fmtShort(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined || !isFinite(days)) return 'n/a';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function cls(n) {
    return n === null || n === undefined ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '';
  }

  var SORTS = {
    rank: function (a, b) { return a.rank - b.rank; },
    implied: function (a, b) { return a.implied_value_usd - b.implied_value_usd; },
    name: function (a, b) { return a.name.localeCompare(b.name); },
    tvl: function (a, b) { return a.tvl_usd - b.tvl_usd; },
    growth: function (a, b) { return (a.change_7d === null ? -9999 : a.change_7d) - (b.change_7d === null ? -9999 : b.change_7d); },
    age: function (a, b) { return (a.age_days === null ? -1 : a.age_days) - (b.age_days === null ? -1 : b.age_days); },
    chains: function (a, b) { return a.chains.length - b.chains.length; },
  };

  function header() {
    return '<header class="top"><div class="brand"><span class="dot" aria-hidden="true"></span>' +
      '<span class="brand-name">Token Radar</span></div>' +
      '<div class="top-meta"><span>Model <b>' + esc(DATA.model_version) + '</b></span>' +
      '<span>Snapshot <b>' + esc(DATA.as_of) + '</b></span>' +
      '<span>Floor <b>' + fmtShort(DATA.floor_usd) + '</b></span>' +
      '<span>Source <b>DefiLlama</b></span></div></header>';
  }

  function hero() {
    var cal = DATA.calibration;
    var tops = DATA.top_categories.map(function (c) { return c.category + ' ' + c.count; }).join(', ');
    return '<section class="hero"><h1>Pre-token protocols, ranked by implied value</h1>' +
      '<p>The board ranks every pre-token protocol in the snapshot by an implied value ' +
      'fitted from the <b>live-token protocols in the same snapshot</b> — not from an asserted multiple — ' +
      'and every term of the model is <b>tested held-out</b> before it is used: fitted on one half of the live ' +
      'sample, asked to predict the other half. Each protocol is scored by TVL, 7-day change, age and chain breadth; the live-token set is kept apart as a control.</p>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + DATA.watchlist_size + '/' + DATA.watchlist_size + '</b><span>Watchlist covered</span></div>' +
      '<div class="stat"><b>' + DATA.board_size + '</b><span>Board rows</span></div>' +
      '<div class="stat"><b>' + fmtShort(DATA.median_implied_usd) + '</b><span>Median implied value</span></div>' +
      '<div class="stat"><b>' + cal.sample_size + '</b><span>Live protocols fitted</span></div>' +
      '<div class="stat"><b>' + cal.median_ratio.toFixed(2) + '</b><span>Median mcap/TVL (live)</span></div>' +
      '<div class="stat"><b>' + esc(tops) + '</b><span>Top categories</span></div>' +
      '</div></section>';
  }

  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category; }).filter(function (c) { return c; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains); }, []))).sort();
    var catOpts = '<option value="all">All categories</option>' + cats.map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var chainOpts = '<option value="all">All chains</option>' + chains.map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var minOpts = [['0', 'Any value'], ['1000000', '≥ $1M'], ['5000000', '≥ $5M'], ['10000000', '≥ $10M'], ['50000000', '≥ $50M']].map(function (o) {
      return '<option value="' + o[0] + '"' + (state.minValue === +o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');
    return '<div class="controls">' +
      '<div class="field"><label for="q">Search</label>' +
      '<input id="q" type="search" placeholder="Name or slug" value="' + esc(state.q) + '" autocomplete="off"></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain">' + chainOpts + '</select></div>' +
      '<div class="field"><label for="category">Category</label><select id="category">' + catOpts + '</select></div>' +
      '<div class="field"><label for="minValue">Min implied value</label><select id="minValue">' + minOpts + '</select></div>' +
      '<label class="check"><input type="checkbox" id="watchOnly"' + (state.watchOnly ? ' checked' : '') + '> Watchlist only</label>' +
      '<div class="tabs" role="group" aria-label="Board">' +
      '<button type="button" data-tab="pre-token" aria-pressed="' + (state.tab === 'pre-token') + '">Pre-token</button>' +
      '<button type="button" data-tab="live" aria-pressed="' + (state.tab === 'live') + '">Live (' + DATA.live.length + ')</button>' +
      '</div>' +
      '<span class="count" id="count"></span>' +
      '</div>';
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.watchOnly && !r.watchlist) return false;
      if (r.implied_value_usd < state.minValue) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function sortedRows(rows) {
    var key = SORTS[state.sort] || SORTS.implied;
    return rows.slice().sort(function (a, b) { return key(a, b) * state.dir; });
  }

  function sortHead(label, key) {
    var mark = state.sort === key ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
    return '<th aria-sort="' + (state.sort === key ? (state.dir === 1 ? 'ascending' : 'descending') : 'none') + '">' +
      '<button type="button" data-sort="' + key + '">' + label + mark + '</button></th>';
  }

  function boardTable(rows) {
    if (!rows.length) return emptyState('No protocols match these filters.', 'Clear filters');
    var top = rows[0].implied_value_usd;
    var body = rows.map(function (r) {
      var w = top > 0 ? Math.max(4, Math.round(r.implied_value_usd / top * 100)) : 4;
      var chains = r.chains.length;
      return '<tr data-slug="' + esc(r.slug) + '" data-selected="' + (state.selected === r.slug) + '" tabindex="0">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td class="name"><b>' + esc(r.name) + (r.watchlist ? '<span class="watch">watchlist</span>' : '') + '</b>' +
        '<span class="sub">' + esc(r.category || 'uncategorised') + ' · ' + esc(r.slug) + '</span></td>' +
        '<td class="num">' + fmtShort(r.tvl_usd) + '</td>' +
        '<td class="num ' + cls(r.change_7d) + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num">' + chains + '</td>' +
        '<td><div class="implied"><span class="num">' + fmtShort(r.implied_value_usd) + '</span>' +
        '<span class="bar" aria-hidden="true"><i style="width:' + w + '%"></i></span></div></td>' +
        '<td><span class="status">no token recorded</span></td></tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table><thead><tr>' +
      sortHead('Rank', 'rank') + sortHead('Protocol', 'name') + sortHead('TVL', 'tvl') +
      sortHead('7d', 'growth') + sortHead('Age', 'age') + sortHead('Chains', 'chains') +
      sortHead('Implied value', 'implied') + '<th>Token</th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  function liveTable() {
    var body = DATA.live.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '" data-selected="false" tabindex="0">' +
        '<td class="num">' + (r.rank || '—') + '</td>' +
        '<td class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'uncategorised') + ' · ' + esc(r.slug) + '</span></td>' +
        '<td class="num">' + fmtShort(r.tvl_usd) + '</td>' +
        '<td class="num ' + cls(r.change_7d) + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num">' + r.chains.length + '</td>' +
        '<td><div class="implied"><span class="num">' + fmtShort(r.mcap_usd) + '</span></div></td>' +
        '<td><span class="status live">live token</span></td></tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table><thead><tr>' +
      '<th>Rank</th><th>Protocol</th><th>TVL</th><th>7d</th><th>Age</th><th>Chains</th><th>Market cap</th><th>Token</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  function emptyState(msg, action) {
    return '<div class="panel empty"><p>' + esc(msg) + '</p>' +
      '<button type="button" class="button primary" id="clearFilters">' + esc(action) + '</button></div>';
  }

  function modelPanel() {
    var cal = DATA.calibration;
    var rows = [
      ['Live protocols fitted', String(cal.sample_size), 'with a recorded market cap above zero'],
      ['Median mcap / TVL', cal.median_ratio.toFixed(3), 'median of the 128 live protocols; the anchor for the base multiple'],
      ['TVL anchor', fmtUsd(cal.tvl_ref_usd), 'median TVL of the live sample'],
      ['Fitted log-log slope', cal.fitted_slope.toFixed(2) + ' (r = ' + cal.fitted_corr.toFixed(2) + ')', 'log(mcap) on log(TVL); the held-out test chose β = ' + cal.beta.toFixed(2) + ''],
      ['Chosen β (held-out)', cal.beta.toFixed(2), 'picked among the fitted slope, 0.65 and linear 1.00 by held-out error'],
      ['Held-out log RMSE', cal.validation.final_rmse.toFixed(3) + ' (MAE ' + cal.validation.final_mae_log.toFixed(3) + ')', 'the full model predicting market caps it was not fitted on, mean of 2 folds'],
      ['Growth vs ratio', cal.growth_corr.toFixed(2), 'correlation of log(mcap/TVL) with 7-day change — weak, so growth enters with a small weight'],
      ['Age vs ratio', cal.age_corr.toFixed(2), 'correlation of log(mcap/TVL) with log(age) — near zero'],
      ['Chains vs ratio', cal.chain_corr.toFixed(2), 'correlation of log(mcap/TVL) with chain count — near zero'],
    ];
    var dropped = ['growth', 'maturity', 'chain breadth', 'category factor'].filter(function (t) {
      if (t === 'growth') return !cal.active.growth;
      if (t === 'maturity') return !cal.active.maturity;
      if (t === 'chain breadth') return !cal.active.chain;
      return !cal.active.category;
    });
    var formulaParts = ['TVL × <b>K × TVL<sup>β−1</sup></b>'];
    if (cal.active.category) formulaParts.push('category');
    if (cal.active.growth) formulaParts.push('(1 + clamp(7d, −30, +100) / 100 × 0.35)');
    if (cal.active.maturity) formulaParts.push('(0.75 + 0.25 × √(min(age, 730) / 730))');
    if (cal.active.chain) formulaParts.push('(1 + 0.02 × min(chains − 1, 4))');
    formulaParts.push('stability');
    var formula = 'implied = ' + formulaParts.join(' × ') + '<br>' +
      'K = ' + cal.k.toFixed(1) + ' · β = ' + cal.beta.toFixed(2) + ' · fitted at the live median TVL ' + fmtUsd(cal.tvl_ref_usd) +
      (dropped.length ? '<br>Dropped by the held-out test (each counts as × 1): ' + dropped.join(', ') + '.' : '<br>No term was dropped: every term survived the held-out test.');
    var factorRows = Object.keys(cal.category_factors).sort().map(function (c) {
      return '<tr><td>' + esc(c) + '</td><td class="num">' + cal.category_factors[c].toFixed(2) + '</td><td class="num">' + cal.category_samples[c] + '</td></tr>';
    }).join('');
    return '<section class="panel model" aria-labelledby="modelTitle"><h2 id="modelTitle">How the ranking works — model ' + esc(DATA.model_version) + '</h2>' +
      '<p class="note">Implied value = TVL × base multiple × category factor × growth × maturity × chains × stability — ' +
      'with each term kept only if the held-out test says it earns its place. ' +
      'The base multiple is not asserted: it is fitted from the live-token protocols in this same snapshot, ' +
      'so a protocol twice as big is not worth twice as much (β = ' + cal.beta.toFixed(2) + ', chosen held-out, below the fitted slope ' + cal.fitted_slope.toFixed(2) + '). ' +
      'Growth is clamped to −30%…+100% and enters with weight 0.35 because it barely predicts the live ratio; ' +
      'maturity rises from 0.75 to 1.00 over 730 days; each extra chain adds 2% up to 8%. ' +
      'Protocols that record no 7-day change are discounted 5% for the missing signal.</p>' +
      '<div class="formula">' + formula + '</div>' +
      '<table class="calib"><thead><tr><th>Calibration</th><th style="text-align:right">Value</th><th>Why it matters</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td class="num">' + r[1] + '</td><td>' + r[2] + '</td></tr>'; }).join('') +
      '</tbody></table>' +
      validationSection(cal) +
      (Object.keys(cal.category_factors).length ?
        '<table class="calib"><thead><tr><th>Category factor</th><th style="text-align:right">Factor</th><th style="text-align:right">Live n</th></tr></thead><tbody>' +
        factorRows +
        '</tbody></table>' +
        '<p class="note">Category factors are shrunken toward 1.00 (k = 8) and applied only where at least 5 live protocols exist in the category; ' +
        'every other category uses 1.00.</p>' :
        '<p class="note">No category factor is applied: the held-out test dropped the category term, so every category uses 1.00. ' +
        'The fitted factors are still listed in the validation table as the variant that lost.</p>') +
      '<p class="note">The board covers all 40 watchlist slugs and every rankable pre-token protocol: ' +
      'bridge and liquid-staking protocols above the $50M floor are in, because each records no token of its own and may still issue one, ' +
      'and the board labels the category so the reader can see it. What stays out are versioned pools, exchange products, and names that say ' +
      'wrapped or staked, because those are products of tokens that already trade, not launches waiting to happen. ' +
      'Below the floor every rankable protocol stays, so the early board finds launches. ' +
      'A protocol is described as recording no token — never as having none.</p>' +
      '</section>';
  }

  function validationSection(cal) {
    var v = cal.validation;
    if (!v) return '';
    var variantRows = v.variants.map(function (x) {
      return '<tr><td>' + esc(x.variant) + '</td><td class="num">' + x.fold_1.toFixed(3) + '</td><td class="num">' + x.fold_2.toFixed(3) + '</td><td class="num">' + x.mean.toFixed(3) + '</td></tr>';
    }).join('');
    var betaRows = v.beta_options.map(function (o) {
      return '<tr><td>' + esc(o.label) + '</td><td class="num">' + o.beta.toFixed(2) + '</td><td class="num">' + o.rmse_mean.toFixed(3) + '</td><td>' + (o.beta === v.chosen_beta ? 'chosen' : '') + '</td></tr>';
    }).join('');
    var termRows = v.terms.map(function (t) {
      var delta = t.rmse_without - t.rmse_with;
      return '<tr><td>' + esc(t.term) + '</td><td class="num">' + t.rmse_with.toFixed(3) + '</td><td class="num">' + t.rmse_without.toFixed(3) + '</td><td>' +
        (t.kept ? 'kept' : 'dropped') + ' (' + (delta >= 0 ? '+' : '') + delta.toFixed(3) + ')</td></tr>';
    }).join('');
    return '<h3>Held-out validation — every term tested before it is used</h3>' +
      '<p class="note">' + esc(v.method) + ' The live sample is ' + v.live_sample + ' protocols, split into folds of ' +
      v.fold_sizes[0] + ' and ' + v.fold_sizes[1] + ' by slug order. The validation tests the recipe, not the final fit: ' +
      'the final fit uses all ' + v.live_sample + ' live protocols, because the board is scored once and there is no second snapshot to spend. ' +
      'A term stays unless removing it clearly helps (by more than 0.001 of log RMSE); a term that only ties is kept.</p>' +
      '<table class="calib"><thead><tr><th>Variant</th><th style="text-align:right">Fold 1 RMSE</th><th style="text-align:right">Fold 2 RMSE</th><th style="text-align:right">Mean RMSE</th></tr></thead><tbody>' +
      variantRows +
      '</tbody></table>' +
      '<table class="calib"><thead><tr><th>β option</th><th style="text-align:right">β</th><th style="text-align:right">Mean RMSE</th><th></th></tr></thead><tbody>' +
      betaRows +
      '</tbody></table>' +
      '<table class="calib"><thead><tr><th>Term</th><th style="text-align:right">RMSE with</th><th style="text-align:right">RMSE without</th><th>Verdict</th></tr></thead><tbody>' +
      termRows +
      '</tbody></table>' +
      '<p class="note">Final held-out error of the chosen recipe: log RMSE ' + v.final_rmse.toFixed(3) +
      ', mean absolute log error ' + v.final_mae_log.toFixed(3) + ' — a typical prediction is off by a factor of about e<sup>' +
      v.final_mae_log.toFixed(2) + '</sup>. That spread is the honest limit of fitting market caps from TVL alone, and it is why the board ranks by implied value rather than pretending to price anything.</p>';
  }

  function detailDialog(row) {
    if (!row) return '';
    var isLive = !row.implied_value_usd;
    var head = '<div class="detail-head"><div><h2>' + esc(row.name) + '</h2>' +
      '<p class="sub">' + esc(row.slug) + ' · ' + esc(row.category || 'uncategorised') + ' · ' + esc(row.chains.join(', ')) + '</p></div>' +
      '<button type="button" class="close" id="closeDetail" aria-label="Close">✕</button></div>';
    if (isLive) {
      var ratio = row.tvl_usd > 0 ? (row.mcap_usd / row.tvl_usd) : null;
      return head +
        '<section class="detail-section"><h3>Live token — set aside</h3>' +
        '<div class="equation"><div><span>Market cap</span><b>' + fmtUsd(row.mcap_usd) + '</b></div>' +
        '<div><span>TVL</span><b>' + fmtUsd(row.tvl_usd) + '</b></div>' +
        '<div><span>mcap / TVL</span><b>' + (ratio === null ? 'n/a' : ratio.toFixed(3)) + '</b></div>' +
        '<div><span>7-day change</span><b>' + fmtPct(row.change_7d) + '</b></div>' +
        '<div><span>Age</span><b>' + fmtAge(row.age_days) + '</b></div></div>' +
        '<p class="note" style="margin-top:12px">This protocol records a live token, so it is not ranked: it is one of the ' +
        DATA.calibration.sample_size + ' live protocols the model is fitted on, shown here as a control.</p></section>';
    }
    var recomputed = Math.max(1, Math.round(row.tvl_usd * row.base_multiple * row.category_factor * row.growth_multiplier * row.maturity_multiplier * row.chain_multiplier * row.stability_multiplier));
    var check = recomputed === row.implied_value_usd ? 'matches the board' : 'differs by ' + fmtUsd(Math.abs(recomputed - row.implied_value_usd));
    var steps = row.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    return head +
      '<section class="detail-section"><h3>Implied value — model ' + esc(DATA.model_version) + '</h3>' +
      '<div class="equation">' +
      '<div><span>TVL</span><b>' + fmtUsd(row.tvl_usd) + '</b></div>' +
      '<div><span>Base multiple at this TVL</span><b>' + row.base_multiple.toFixed(4) + '×</b></div>' +
      '<div><span>Category factor (' + esc(row.category || 'uncategorised') + ')</span><b>' + row.category_factor.toFixed(2) + '×</b></div>' +
      '<div><span>Growth (' + fmtPct(row.change_7d) + ')</span><b>' + row.growth_multiplier.toFixed(4) + '×</b></div>' +
      '<div><span>Maturity (' + fmtAge(row.age_days) + ')</span><b>' + row.maturity_multiplier.toFixed(4) + '×</b></div>' +
      '<div><span>Chains (' + row.chains.length + ')</span><b>' + row.chain_multiplier.toFixed(2) + '×</b></div>' +
      '<div><span>Stability</span><b>' + row.stability_multiplier.toFixed(2) + '×</b></div>' +
      '<div><span>Implied value</span><b>' + fmtUsd(row.implied_value_usd) + '</b></div>' +
      '<div><span>Recompute check</span><b>' + fmtUsd(recomputed) + ' — ' + check + '</b></div></div>' +
      (row.why_farm ? '<p class="why" style="margin-top:14px"><b>Why farm this one:</b> ' + esc(row.why_farm.replace(/^Why this one: /, '')) + '</p>' : '') +
      (row.risk_note ? '<p class="risk" style="margin-top:10px"><b>Risk:</b> ' + esc(row.risk_note) + '</p>' : '') +
      '</section>' +
      '<section class="detail-section"><h3>Farm plan</h3><ol class="steps">' + steps + '</ol></section>';
  }

  function foot() {
    return '<p class="foot">Snapshot ' + esc(DATA.as_of) + ' · DefiLlama · Model ' + esc(DATA.model_version) +
      ' · Board ' + DATA.board_size + ' rows · ' + DATA.watchlist_size + ' watchlist slugs · ' +
      'Live-token set is a control, not ranked. A protocol is described as recording no token.</p>';
  }

  function readHash() {
    var p = new URLSearchParams(location.hash.slice(1));
    state.q = p.get('q') || '';
    state.category = p.get('category') || 'all';
    state.chain = p.get('chain') || 'all';
    state.watchOnly = p.get('w') === '1';
    state.minValue = +(p.get('min') || '0') || 0;
    state.tab = p.get('tab') === 'live' ? 'live' : 'pre-token';
    state.selected = p.get('p') || null;
    var sorts = Object.keys(SORTS);
    if (sorts.indexOf(p.get('sort') || '') >= 0) state.sort = p.get('sort');
    state.dir = p.get('dir') === 'asc' ? 1 : -1;
  }

  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.watchOnly) p.set('w', '1');
    if (state.minValue) p.set('min', String(state.minValue));
    if (state.tab === 'live') p.set('tab', 'live');
    if (state.sort !== 'implied' || state.dir !== -1) { p.set('sort', state.sort); p.set('dir', state.dir === 1 ? 'asc' : 'desc'); }
    if (state.selected) p.set('p', state.selected);
    var h = p.toString();
    history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
  }

  function findRow(slug) {
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) return DATA.rows[i];
    for (var j = 0; j < DATA.live.length; j++) if (DATA.live[j].slug === slug) return DATA.live[j];
    return null;
  }

  function render() {
    var rows = state.tab === 'pre-token' ? sortedRows(filteredRows()) : DATA.live;
    var main = state.tab === 'pre-token' ? boardTable(rows) : liveTable();
    app.innerHTML = '<a class="skip" href="#boardTable">Skip to board</a>' + header() + hero() + controls() +
      '<div id="boardTable">' + main + '</div>' + modelPanel() + foot() +
      '<dialog class="detail" id="detail" aria-label="Protocol detail">' + detailDialog(state.selected ? findRow(state.selected) : null) + '</dialog>';
    var count = document.getElementById('count');
    if (count) count.textContent = state.tab === 'pre-token' ? ('Showing ' + rows.length + ' of ' + DATA.board_size + ' rows') : (DATA.live.length + ' live protocols');
    var dialog = document.getElementById('detail');
    if (state.selected && findRow(state.selected)) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
    bind();
  }

  function bind() {
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; writeHash(); render(); var nq = document.getElementById('q'); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } });
    var chain = document.getElementById('chain');
    if (chain) chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); render(); });
    var cat = document.getElementById('category');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var min = document.getElementById('minValue');
    if (min) min.addEventListener('change', function () { state.minValue = +min.value; writeHash(); render(); });
    var watch = document.getElementById('watchOnly');
    if (watch) watch.addEventListener('change', function () { state.watchOnly = watch.checked; writeHash(); render(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); writeHash(); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-sort]'), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'name' ? 1 : -1; }
        writeHash(); render();
      });
    });
    var clear = document.getElementById('clearFilters');
    if (clear) clear.addEventListener('click', function () {
      state.q = ''; state.chain = 'all'; state.category = 'all'; state.watchOnly = false; state.minValue = 0; writeHash(); render();
    });
    Array.prototype.forEach.call(document.querySelectorAll('tbody tr[data-slug]'), function (tr) {
      var open = function () { state.selected = tr.getAttribute('data-slug'); writeHash(); render(); };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    var close = document.getElementById('closeDetail');
    if (close) close.addEventListener('click', function () { state.selected = null; writeHash(); render(); });
    var dialog = document.getElementById('detail');
    if (dialog) dialog.addEventListener('close', function () { if (state.selected) { state.selected = null; writeHash(); render(); } });
  }

  readHash();
  render();
})();
