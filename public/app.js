'use strict';
// ai-usage dashboard — vanilla JS, SVG charts, no dependencies.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 86_400_000, HOUR = 3_600_000;
const TOOL_NAMES = ['Claude Code', 'Codex', 'Cursor'];
const TOOL_KEYS = ['claude', 'codex', 'cursor'];
const TOOL_VARS = ['--claude', '--codex', '--cursor'];

// ───────────────────────── default pricing ($ / 1M tokens) ─────────────────────────
// cw5 / cw1h = cache write 5 min / 1 h (Anthropic). OpenAI has no cache-write fee → same as input.
const DEFAULT_PRICES = [
  { label: 'Claude Fable / Mythos 5.1', match: '^claude-(fable|mythos)-5\\.[1-9]', in: 10, cw5: 12.5, cw1h: 20, cr: 0.25, out: 50 },
  { label: 'Claude Fable / Mythos 5', match: '^claude-(fable|mythos)', in: 10, cw5: 12.5, cw1h: 20, cr: 1, out: 50 },
  { label: 'Claude Opus 5.5', match: '^claude-opus-5\\.[5-9]', in: 4, cw5: 5, cw1h: 8, cr: 0.2, out: 20 },
  { label: 'Claude Opus 4.5 → 5', match: '^claude-opus-(4\\.[5-9]|5)', in: 5, cw5: 6.25, cw1h: 10, cr: 0.5, out: 25 },
  { label: 'Claude Opus 3 → 4.1', match: '^claude-opus', in: 15, cw5: 18.75, cw1h: 30, cr: 1.5, out: 75 },
  { label: 'Claude Sonnet 5', match: '^claude-sonnet-5', in: 2, cw5: 2.5, cw1h: 4, cr: 0.2, out: 10 },
  { label: 'Claude Sonnet 3.5 → 4.6', match: '^claude-sonnet', in: 3, cw5: 3.75, cw1h: 6, cr: 0.3, out: 15 },
  { label: 'Claude Haiku 4.5+', match: '^claude-haiku-[4-9]', in: 1, cw5: 1.25, cw1h: 2, cr: 0.1, out: 5 },
  { label: 'Claude Haiku 3.5', match: '^claude-haiku-3\\.5', in: 0.8, cw5: 1, cw1h: 1.6, cr: 0.08, out: 4 },
  { label: 'Claude Haiku 3', match: '^claude-haiku', in: 0.25, cw5: 0.3, cw1h: 0.5, cr: 0.03, out: 1.25 },
  { label: 'GPT-6 Astra', match: '^gpt-6-astra', in: 5, cw5: 5, cw1h: 5, cr: 0.5, out: 25 },
  { label: 'GPT-6 Luna', match: '^gpt-6-luna', in: 0.05, cw5: 0.05, cw1h: 0.05, cr: 0.005, out: 0.25 },
  { label: 'GPT-6 Sol', match: '^gpt-6', in: 1, cw5: 1, cw1h: 1, cr: 0.1, out: 5 },
  { label: 'GPT-5.6 Luna', match: '^gpt-5\\.6-luna', in: 0.2, cw5: 0.2, cw1h: 0.2, cr: 0.02, out: 1.2 },
  { label: 'GPT-5.6 Terra', match: '^gpt-5\\.6-terra', in: 2, cw5: 2, cw1h: 2, cr: 0.2, out: 12 },
  { label: 'GPT-5.6 Sol', match: '^gpt-5\\.6', in: 5, cw5: 5, cw1h: 5, cr: 0.5, out: 30 },
  { label: 'GPT-5.5', match: '^gpt-5\\.5', in: 5, cw5: 5, cw1h: 5, cr: 0.5, out: 30 },
  { label: 'GPT-5.4', match: '^gpt-5\\.4', in: 2.5, cw5: 2.5, cw1h: 2.5, cr: 0.25, out: 15 },
  { label: 'GPT-5.2 / 5.3 (codex)', match: '^gpt-5\\.[23]', in: 1.75, cw5: 1.75, cw1h: 1.75, cr: 0.175, out: 14 },
  { label: 'GPT-5 mini / codex-mini', match: '^(gpt-5(\\.\\d)?(-codex)?-mini|codex-mini)', in: 0.25, cw5: 0.25, cw1h: 0.25, cr: 0.025, out: 2 },
  { label: 'GPT-5 nano', match: '^gpt-5(\\.\\d)?-nano', in: 0.05, cw5: 0.05, cw1h: 0.05, cr: 0.005, out: 0.4 },
  { label: 'GPT-5 / 5.1 (codex)', match: '^gpt-5', in: 1.25, cw5: 1.25, cw1h: 1.25, cr: 0.125, out: 10 },
  { label: 'o3', match: '^o3', in: 2, cw5: 2, cw1h: 2, cr: 0.5, out: 8 },
  { label: 'o4-mini', match: '^o4-mini', in: 1.1, cw5: 1.1, cw1h: 1.1, cr: 0.275, out: 4.4 },
  { label: 'GPT-4.1', match: '^gpt-4\\.1', in: 2, cw5: 2, cw1h: 2, cr: 0.5, out: 8 },
  { label: 'GPT-4o', match: '^gpt-4o', in: 2.5, cw5: 2.5, cw1h: 2.5, cr: 1.25, out: 10 },
  { label: 'Grok 4.x Fast (Cursor, tarif ×2)', match: '^grok-4\\.\\d+.*-fast', in: 4, cw5: 4, cw1h: 4, cr: 1, out: 12, since: 2 },
  { label: 'Grok 4.6 / 4.7', match: '^grok-4\\.[67]', in: 2, cw5: 2, cw1h: 2, cr: 0.5, out: 6, since: 2 },
  { label: 'Grok 4.5', match: '^grok-4\\.5', in: 2, cw5: 2, cw1h: 2, cr: 0.3, out: 6, since: 2 },
  { label: 'Grok 4.3', match: '^grok-4\\.3', in: 1.25, cw5: 1.25, cw1h: 1.25, cr: 0.2, out: 2.5, since: 2 },
  { label: 'Kimi K3', match: '^kimi-k3', in: 3, cw5: 3, cw1h: 3, cr: 0.3, out: 15, since: 2 },
  { label: 'Kimi K2.6 / K2.7', match: '^kimi-k2', in: 0.95, cw5: 0.95, cw1h: 0.95, cr: 0.16, out: 4, since: 2 },
  { label: 'DeepSeek V4 Pro (tarif heures pleines)', match: '^deepseek-v4-pro', in: 1.32, cw5: 1.32, cw1h: 1.32, cr: 0.044, out: 3.96, since: 2 },
  { label: 'DeepSeek Flash', match: '^deepseek-(v4-)?flash', in: 0.3, cw5: 0.3, cw1h: 0.3, cr: 0.006, out: 1.2, since: 2 },
  { label: 'GLM 5.1 → 5.3', match: '^glm-5\\.[1-9]', in: 1.4, cw5: 1.4, cw1h: 1.4, cr: 0.26, out: 4.4, since: 2 },
  { label: 'GLM 5', match: '^glm-5', in: 1, cw5: 1, cw1h: 1, cr: 0.2, out: 3.2, since: 2 },
  { label: 'GLM 4.5 → 4.7', match: '^glm-4\\.[5-7]', in: 0.6, cw5: 0.6, cw1h: 0.6, cr: 0.11, out: 2.2, since: 2 },
  { label: 'Cursor Composer', match: 'composer', in: 1.25, cw5: 1.25, cw1h: 1.25, cr: 0.125, out: 10 },
  { label: 'Cursor Auto', match: '^(cursor-auto|auto|default)$', in: 1.25, cw5: 1.25, cw1h: 1.25, cr: 0.25, out: 6 },
  { label: 'Gemini 3 Pro', match: 'gemini-3.*pro', in: 2, cw5: 2, cw1h: 2, cr: 0.2, out: 12 },
  { label: 'Gemini 2.5 Pro', match: 'gemini-2\\.5-pro', in: 1.25, cw5: 1.25, cw1h: 1.25, cr: 0.125, out: 10 },
  { label: 'Gemini Flash', match: 'gemini.*flash', in: 0.3, cw5: 0.3, cw1h: 0.3, cr: 0.03, out: 2.5 },
  { label: 'Grok Code Fast', match: 'grok-code', in: 0.2, cw5: 0.2, cw1h: 0.2, cr: 0.02, out: 1.5 },
];
const PLANS = {
  claude: [{ id: 'none', name: 'Aucun', price: 0 }, { id: 'pro', name: 'Claude Pro', price: 20 }, { id: 'max5', name: 'Claude Max 5x', price: 100 }, { id: 'max20', name: 'Claude Max 20x', price: 200 }, { id: 'team', name: 'Team (siège)', price: 30 }, { id: 'api', name: 'API (pay-as-you-go)', price: null }],
  codex: [{ id: 'none', name: 'Aucun', price: 0 }, { id: 'go', name: 'ChatGPT Go', price: 8 }, { id: 'plus', name: 'ChatGPT Plus', price: 20 }, { id: 'pro', name: 'ChatGPT Pro', price: 200 }, { id: 'business', name: 'ChatGPT Business', price: 30 }, { id: 'api', name: 'API (pay-as-you-go)', price: null }],
  cursor: [{ id: 'hobby', name: 'Hobby', price: 0 }, { id: 'pro', name: 'Cursor Pro', price: 20 }, { id: 'proplus', name: 'Cursor Pro+', price: 60 }, { id: 'ultra', name: 'Cursor Ultra', price: 200 }, { id: 'teams', name: 'Teams', price: 40 }],
};
const PRICES_VERSION = 2; // bump when new default rules are added → merged into saved grids
const DEFAULT_SETTINGS = () => ({
  prices: DEFAULT_PRICES.map((p) => ({ ...p })), pricesVersion: PRICES_VERSION,
  plans: { claude: { id: 'max5', price: 100 }, codex: { id: 'plus', price: 20 }, cursor: { id: 'pro', price: 20 } },
  wsPrice: 10, eurRate: 0.86, currency: 'USD',
  gain: { rate: 60, mult: 3 }, // rate in USD/h, mult = manual hours per active AI hour
});

// ───────────────────────── state ─────────────────────────
const st = {
  data: null, settings: DEFAULT_SETTINGS(), range: '30d', customFrom: null, customTo: null,
  tools: [true, true, true], project: 'all', model: 'all', metric: 'cost',
  sessSort: { k: 'start', asc: false }, sessLimit: 25, showAllPrices: false, sessQuery: '', openSess: new Set(),
  modelSort: null, auto: false, timer: null,
  rowCost: null, priceIdx: null, agg: null,
};
const store = {
  get(k, d) { try { const v = localStorage.getItem('ai-usage:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ai-usage:' + k, JSON.stringify(v)); } catch {} },
};

// ───────────────────────── formatting ─────────────────────────
const nfInt = new Intl.NumberFormat('fr-FR');
function fmtN(n) {
  if (!Number.isFinite(n)) return '–';
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 1 : 2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return nfInt.format(Math.round(n));
}
function money(usd, opts = {}) {
  if (!Number.isFinite(usd)) return '–';
  const eur = st.settings.currency === 'EUR';
  const v = eur ? usd * (st.settings.eurRate || 0.86) : usd;
  const a = Math.abs(v);
  const digits = opts.compact && a >= 10000 ? 0 : a >= 100 ? (opts.compact ? 0 : 2) : a >= 1 ? 2 : a >= 0.01 ? 2 : a > 0 ? 4 : 0;
  if (opts.compact && a >= 1e5) { const s = (Math.abs(v) / 1e3).toFixed(1) + 'k', sign = v < 0 ? '−' : ''; return eur ? sign + s + ' €' : sign + '$' + s; }
  const s = Math.abs(v).toLocaleString(eur ? 'fr-FR' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const sign = v < 0 ? '−' : '';
  return eur ? sign + s + ' €' : sign + '$' + s;
}
function dur(ms) {
  if (!ms || ms < 60000) return ms ? '<1 min' : '0';
  const m = Math.round(ms / 60000);
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), r = m % 60;
  return h >= 100 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')}`;
}
const dfDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const dfDayW = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const dfMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' });
const dfMonthL = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const dfDT = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const dfHour = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const pct = (x, d = 0) => (Number.isFinite(x) ? (x * 100).toFixed(d) + ' %' : '–');
function fmtMetric(v, metric = st.metric, compact = false) { return metric === 'cost' ? money(v, { compact }) : fmtN(v); }
const metricLabel = () => ({ cost: 'Coût', tokens: 'Tokens', req: 'Requêtes' }[st.metric]);

// ───────────────────────── dates ─────────────────────────
const sod = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
const som = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(1); return d.getTime(); };
const addMonths = (t, n) => { const d = new Date(t); d.setMonth(d.getMonth() + n); return d.getTime(); };
const isoDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const daysInMonth = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };

function rangeBounds() {
  const now = Date.now(), today = sod(now), tomorrow = addDays(today, 1);
  const minT = st.data?.minHour ?? addDays(today, -30);
  switch (st.range) {
    case '1d': return [now - DAY, now + 1];
    case '7d': return [addDays(today, -6), tomorrow];
    case '30d': return [addDays(today, -29), tomorrow];
    case '90d': return [addDays(today, -89), tomorrow];
    case 'mtd': return [som(now), tomorrow];
    case 'ytd': { const d = new Date(now); return [new Date(d.getFullYear(), 0, 1).getTime(), tomorrow]; }
    case 'custom': return [st.customFrom ?? sod(minT), st.customTo ?? tomorrow];
    default: return [sod(minT), tomorrow];
  }
}
function buckets(from, to) {
  const hourly = to - from <= 2 * DAY + 1;
  const starts = [];
  if (hourly) { for (let t = Math.floor(from / HOUR) * HOUR; t < to; t += HOUR) starts.push(t); }
  else { for (let t = sod(from); t < to; t = addDays(t, 1)) starts.push(t); }
  return { hourly, starts };
}
function bucketOf(starts, t) {
  let lo = 0, hi = starts.length - 1;
  if (t < starts[0]) return -1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= t) lo = mid; else hi = mid - 1; }
  return lo;
}

// ───────────────────────── pricing ─────────────────────────
function canon(m) {
  const s = String(m || '').toLowerCase().trim().replace(/^([\w.-]+\/)+/, '').replace(/^cursor-(?!auto$)/, '');
  const fam = s.match(/(opus|sonnet|haiku|fable|mythos)/);
  if (fam) {
    const t = s.replace(/-?\d{8}\b/g, '').replace(/@.*$/, '').replace(/\[.*?\]/g, '');
    const v = t.match(/(\d+)(?:[.-](\d{1,2}))?(?!\d)/);
    return `claude-${fam[1]}-${v ? v[1] + (v[2] ? '.' + v[2] : '') : ''}`.replace(/-$/, '');
  }
  return s;
}
function compilePrices() {
  const rules = st.settings.prices.map((p) => { try { return new RegExp(p.match, 'i'); } catch { return null; } });
  const models = st.data.models;
  st.priceIdx = models.map((m) => {
    const c = canon(m), raw = String(m).toLowerCase();
    return rules.findIndex((r) => r && (r.test(c) || r.test(raw)));
  });
  const ws = (st.settings.wsPrice ?? 10) / 1000;
  const rows = st.data.rows;
  const cost = new Float64Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], pi = st.priceIdx[r[2]];
    if (pi < 0) { cost[i] = 0; continue; }
    const p = st.settings.prices[pi];
    const cw5 = p.cw5 ?? p.in, cw1h = p.cw1h ?? p.in;
    cost[i] = (r[5] * p.in + r[6] * cw5 + r[7] * cw1h + r[8] * p.cr + r[9] * p.out) / 1e6 + r[11] * ws;
  }
  st.rowCost = cost;
}

// ───────────────────────── aggregation ─────────────────────────
function passes(r, withRange, from, to) {
  if (!st.tools[r[0]]) return false;
  if (withRange && (r[3] < from || r[3] >= to)) return false;
  if (st.project !== 'all' && st.data.sessions[r[1]].p !== +st.project) return false;
  if (st.model !== 'all' && r[2] !== +st.model) return false;
  return true;
}
const tokTotal = (r) => r[5] + r[6] + r[7] + r[8] + r[9];
const metricOf = (r, i, m = st.metric) => (m === 'cost' ? st.rowCost[i] : m === 'tokens' ? tokTotal(r) : r[4]);

function aggregate() {
  const D = st.data, rows = D.rows;
  const [from, to] = rangeBounds();
  const { hourly, starts } = buckets(from, to);
  const nb = starts.length;
  const A = {
    from, to, hourly, starts,
    byBucket: [0, 1, 2].map(() => ({ cost: new Float64Array(nb), tokens: new Float64Array(nb), req: new Float64Array(nb) })),
    tot: { cost: 0, tokens: 0, req: 0, in: 0, cw: 0, cr: 0, out: 0, rs: 0, ws: 0, billed: 0, cacheSave: 0, unpricedTok: 0 },
    byTool: [0, 1, 2].map(() => ({ cost: 0, tokens: 0, req: 0, in: 0, cw: 0, cr: 0, out: 0, rs: 0 })),
    byModel: new Map(), byProject: new Map(), bySess: new Map(),
    punch: Array.from({ length: 7 }, () => new Float64Array(24)),
    prev: { cost: 0, tokens: 0, req: 0, sessions: new Set(), active: 0 },
    active: 0, activeB: new Float64Array(nb), activeByTool: [0, 0, 0],
  };
  const pFrom = from - (to - from), pTo = from;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!passes(r, false)) continue;
    const t = r[3];
    const c = st.rowCost[i], tk = tokTotal(r);
    if (t >= pFrom && t < pTo) { A.prev.cost += c; A.prev.tokens += tk; A.prev.req += r[4]; A.prev.sessions.add(r[1]); }
    if (t < from || t >= to) continue;
    const b = bucketOf(starts, t);
    if (b >= 0) { const bb = A.byBucket[r[0]]; bb.cost[b] += c; bb.tokens[b] += tk; bb.req[b] += r[4]; }
    const T = A.tot, TT = A.byTool[r[0]];
    for (const X of [T, TT]) { X.cost += c; X.tokens += tk; X.req += r[4]; X.in += r[5]; X.cw += r[6] + r[7]; X.cr += r[8]; X.out += r[9]; X.rs += r[10]; }
    T.ws += r[11]; if (r[12] != null) T.billed += r[12];
    const pi = st.priceIdx[r[2]];
    if (pi >= 0) { const p = st.settings.prices[pi]; T.cacheSave += (r[8] * (p.in - p.cr)) / 1e6; } else T.unpricedTok += tk;
    const v = metricOf(r, i);
    const d = new Date(t); A.punch[(d.getDay() + 6) % 7][d.getHours()] += v;
    let M = A.byModel.get(r[2]); if (!M) A.byModel.set(r[2], (M = { mi: r[2], tool: r[0], cost: 0, tokens: 0, req: 0, in: 0, out: 0, cr: 0, cw: 0 }));
    M.cost += c; M.tokens += tk; M.req += r[4]; M.in += r[5]; M.out += r[9]; M.cr += r[8]; M.cw += r[6] + r[7];
    const S = D.sessions[r[1]];
    let P = A.byProject.get(S.p); if (!P) A.byProject.set(S.p, (P = { p: S.p, cost: 0, tokens: 0, req: 0, sess: new Set(), tools: new Set(), last: 0 }));
    P.cost += c; P.tokens += tk; P.req += r[4]; P.sess.add(r[1]); P.tools.add(r[0]); P.last = Math.max(P.last, t + HOUR);
    let SS = A.bySess.get(r[1]); if (!SS) A.bySess.set(r[1], (SS = { si: r[1], cost: 0, tokens: 0, req: 0, active: 0 }));
    SS.cost += c; SS.tokens += tk; SS.req += r[4];
  }
  // active time
  for (const [tool, si, h, ms] of D.activity) {
    if (!st.tools[tool]) continue;
    const S = D.sessions[si];
    if (st.project !== 'all' && S.p !== +st.project) continue;
    if (st.model !== 'all' && !S.models.includes(+st.model)) continue;
    if (h >= pFrom && h < pTo) A.prev.active += ms;
    if (h < from || h >= to) continue;
    A.active += ms; A.activeByTool[tool] += ms;
    const b = bucketOf(starts, h); if (b >= 0) A.activeB[b] += ms;
    const SS = A.bySess.get(si); if (SS) SS.active += ms;
  }
  st.agg = A;
  return A;
}

// Daily series over arbitrary window, ignoring the date filter (projection, heatmap, monthly)
function dailyAll(metric = 'cost') {
  const map = new Map();
  const rows = st.data.rows;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!passes(r, false)) continue;
    const k = sod(r[3]);
    let e = map.get(k); if (!e) map.set(k, (e = [0, 0, 0, 0]));
    const v = metricOf(r, i, metric); e[r[0]] += v; e[3] += v;
  }
  return map;
}

// ───────────────────────── tooltip ─────────────────────────
const tip = $('#tip');
function showTip(html, ev) {
  tip.innerHTML = html; tip.classList.add('on');
  const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
  if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
}
const hideTip = () => tip.classList.remove('on');
const tipRow = (color, label, val, cls = '') => `<div class="r ${cls}">${color ? `<i style="background:${color}"></i>` : ''}<span>${esc(label)}</span><b>${val}</b></div>`;

// ───────────────────────── colors ─────────────────────────
let C = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const g = (v) => cs.getPropertyValue(v).trim();
  C = { tool: TOOL_VARS.map(g), tin: g('--t-in'), tcw: g('--t-cw'), tcr: g('--t-cr'), tout: g('--t-out'), heat: ['--h0', '--h1', '--h2', '--h3', '--h4'].map(g),
    surface: g('--surface'), muted: g('--muted'), text: g('--text'), text2: g('--text-2'), accent: g('--accent'), grid: g('--grid'), axis: g('--axis'), warn: g('--warn'), bad: g('--bad'), good: g('--good') };
}

// ───────────────────────── chart primitives ─────────────────────────
function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const e = raw / mag, step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
  const out = []; for (let v = 0; v <= max + step * 0.999; v += step) out.push(+v.toPrecision(12));
  if (out.length < 2) out.push(step);
  return out;
}
const roundTop = (x, y, w, h, r) => { r = Math.max(0, Math.min(r, w / 2, h)); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };

// Stacked columns. series: [{name, color, values}] bottom→top
function colChart(el, { labels, series, fmtY, tipTitle, height = 230, ref = null, xLabel, minBand = 0 }) {
  const W = Math.max(280, el.clientWidth), H = height, m = { l: 56, r: 8, t: 12, b: 26 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b, n = labels.length;
  const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] || 0), 0));
  const maxV = Math.max(0, ...totals, ref?.value || 0);
  const ticks = niceTicks(maxV), ymax = ticks[ticks.length - 1];
  const y = (v) => m.t + ih - (v / ymax) * ih;
  const band = iw / Math.max(1, n), bw = Math.max(1, Math.min(24, band * 0.72)), gap = band < 6 ? 0 : 2;
  let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img">`;
  for (const t of ticks) s += `<line class="gridl" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l - 8}" y="${y(t) + 3.5}" text-anchor="end">${esc(fmtY(t, true))}</text>`;
  for (let i = 0; i < n; i++) {
    const x = m.l + i * band + (band - bw) / 2;
    let base = y(0);
    const vis = series.map((sr, k) => [k, sr.values[i] || 0]).filter(([, v]) => v > 0);
    vis.forEach(([k, v], j) => {
      const h = (v / ymax) * ih; const top = base - h;
      const last = j === vis.length - 1;
      const hh = Math.max(0, h - (last ? 0 : gap));
      if (hh > 0) s += last ? `<path d="${roundTop(x, top, bw, hh, 4)}" fill="${series[k].color}"/>` : `<rect x="${x}" y="${top + gap}" width="${bw}" height="${hh}" fill="${series[k].color}"/>`;
      base = top;
    });
  }
  s += `<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  if (ref && ref.value > 0) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(ref.value)}" y2="${y(ref.value)}" stroke="${C.text2}" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - m.r}" y="${y(ref.value) - 5}" text-anchor="end" style="fill:${C.text2}">${esc(ref.label)}</text>`;
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / (xLabel?.width || 64)))));
  for (let i = 0; i < n; i += every) s += `<text x="${m.l + i * band + band / 2}" y="${H - 8}" text-anchor="middle">${esc(xLabel ? xLabel.fmt(labels[i], i) : labels[i])}</text>`;
  for (let i = 0; i < n; i++) s += `<rect class="hov" data-i="${i}" x="${m.l + i * band}" y="${m.t}" width="${band}" height="${ih}"/>`;
  s += '</svg>';
  el.innerHTML = s;
  el.onmousemove = (ev) => {
    const i = ev.target?.dataset?.i; if (i == null) return hideTip();
    let h = `<div class="tt">${esc(tipTitle(+i))}</div>`;
    for (let k = series.length - 1; k >= 0; k--) if (series[k].values[+i]) h += tipRow(series[k].color, series[k].name, fmtY(series[k].values[+i]));
    if (series.length > 1) h += tipRow('', 'Total', fmtY(totals[+i]), 'tot');
    if (ref && ref.value > 0) h += tipRow('', ref.label, fmtY(ref.value));
    showTip(h, ev);
  };
  el.onmouseleave = hideTip;
  if (maxV === 0) el.insertAdjacentHTML('beforeend', '<div class="empty" style="position:absolute;inset:0;padding-top:80px">aucune donnée sur la période</div>');
}

function lineChart(el, { labels, series, fmtY, tipTitle, height = 230, xLabel }) {
  const W = Math.max(280, el.clientWidth), H = height, m = { l: 56, r: 12, t: 12, b: 26 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b, n = labels.length;
  const maxV = Math.max(0, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(maxV), ymax = ticks[ticks.length - 1];
  const x = (i) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => m.t + ih - (v / ymax) * ih;
  let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}">`;
  for (const t of ticks) s += `<line class="gridl" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l - 8}" y="${y(t) + 3.5}" text-anchor="end">${esc(fmtY(t, true))}</text>`;
  s += `<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  for (const sr of series) {
    const pts = sr.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    if (!sr.dash) s += `<polygon points="${x(0)},${y(0)} ${pts} ${x(n - 1)},${y(0)}" fill="${sr.color}" opacity=".08"/>`;
    s += `<polyline points="${pts}" fill="none" stroke="${sr.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${sr.dash ? 'stroke-dasharray="5 4" opacity=".85"' : ''}/>`;
    if (!sr.dash && n) { const lv = sr.values[n - 1]; s += `<circle cx="${x(n - 1)}" cy="${y(lv)}" r="4" fill="${sr.color}" stroke="${C.surface}" stroke-width="2"/>`; }
  }
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / (xLabel?.width || 64)))));
  for (let i = 0; i < n; i += every) s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(xLabel ? xLabel.fmt(labels[i], i) : labels[i])}</text>`;
  s += `<g class="cross" style="display:none"><line x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" stroke="${C.axis}"/>${series.map((sr) => `<circle r="4" fill="${sr.color}" stroke="${C.surface}" stroke-width="2"/>`).join('')}</g>`;
  s += `<rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" class="ov"/></svg>`;
  el.innerHTML = s;
  const svg = el.querySelector('svg'), cross = el.querySelector('.cross');
  el.onmousemove = (ev) => {
    const rect = svg.getBoundingClientRect(); const px = ((ev.clientX - rect.left) / rect.width) * W;
    if (px < m.l - 4 || px > W - m.r + 4 || !n) { cross.style.display = 'none'; return hideTip(); }
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
    cross.style.display = '';
    cross.querySelector('line').setAttribute('x1', x(i)); cross.querySelector('line').setAttribute('x2', x(i));
    cross.querySelectorAll('circle').forEach((c, k) => { c.setAttribute('cx', x(i)); c.setAttribute('cy', y(series[k].values[i])); });
    let h = `<div class="tt">${esc(tipTitle(i))}</div>`;
    for (const sr of series) h += tipRow(sr.dash ? '' : sr.color, sr.name, fmtY(sr.values[i]));
    showTip(h, ev);
  };
  el.onmouseleave = () => { cross.style.display = 'none'; hideTip(); };
}

function barList(el, items, { fmt, max, onClick } = {}) {
  if (!items.length) { el.innerHTML = '<div class="empty">aucune donnée</div>'; return; }
  const mx = max ?? Math.max(...items.map((i) => i.value), 1e-9);
  el.innerHTML = `<div class="bars">${items.map((it, k) => `
    <div class="bar-row" data-k="${k}" ${onClick ? 'style="cursor:pointer"' : ''}>
      <div class="lab" title="${esc(it.title || it.label)}">${it.color ? `<i style="background:${it.color}"></i>` : ''}${esc(it.label)}</div>
      <div class="track"><div class="fill" style="width:${Math.max(0.4, (it.value / mx) * 100)}%;background:${it.color || C.text2}"></div></div>
      <div class="val">${fmt(it.value)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>
    </div>`).join('')}</div>`;
  el.onmousemove = (ev) => { const row = ev.target.closest('.bar-row'); if (!row) return hideTip(); const it = items[+row.dataset.k]; if (it.tip) showTip(it.tip, ev); else hideTip(); };
  el.onmouseleave = hideTip;
  if (onClick) el.onclick = (ev) => { const row = ev.target.closest('.bar-row'); if (row) onClick(items[+row.dataset.k]); };
}

function sparkline(values, color) {
  const n = values.length; if (n < 2) return '';
  const W = 200, H = 28, mx = Math.max(...values, 1e-9);
  const pts = values.map((v, i) => `${((i / (n - 1)) * W).toFixed(1)},${(H - 3 - (v / mx) * (H - 6)).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polygon points="0,${H} ${pts.join(' ')} ${W},${H}" fill="${color}" opacity=".10"/><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

// ───────────────────────── renderers ─────────────────────────
function renderKPIs(A) {
  const T = A.tot, P = A.prev;
  const nSess = A.bySess.size, prompts = [...A.bySess.keys()].reduce((s, si) => s + (st.data.sessions[si].userMsgs || 0), 0);
  const sumB = (k) => A.starts.map((_, i) => A.byBucket.reduce((s, b, t) => s + (st.tools[t] ? b[k][i] : 0), 0));
  const delta = (cur, prev) => {
    if (!prev) return cur ? '<span class="m">nouveau vs période préc.</span>' : '';
    const d = (cur - prev) / prev;
    return `<span>${d >= 0 ? '▲' : '▼'} ${Math.abs(d * 100).toFixed(0)} %</span> vs période préc.`;
  };
  const inputAll = T.in + T.cw + T.cr;
  const hit = inputAll ? T.cr / inputAll : NaN;
  const pr = projection();
  const planTotal = planMonthlyTotal();
  const days = (A.to - A.from) / DAY;
  const planPeriod = planTotal * Math.min(days, 3650) / 30.44;
  const tiles = [
    { hero: true, l: 'Coût équivalent API', v: money(T.cost), d: delta(T.cost, P.cost), spark: sumB('cost'), c: C.accent, extra: T.billed ? `facturé Cursor (CSV) : ${money(T.billed)}` : null },
    { l: 'Tokens', v: fmtN(T.tokens), d: `in ${fmtN(T.in + T.cw)} · cache ${fmtN(T.cr)} · out ${fmtN(T.out)}`, spark: sumB('tokens'), c: C.text2 },
    { l: 'Requêtes modèle', v: fmtN(T.req), d: `${fmtN(prompts)} prompts · ${delta(T.req, P.req)}`, spark: sumB('req'), c: C.text2 },
    { l: 'Sessions', v: fmtN(nSess), d: nSess ? `${money(T.cost / nSess)} / session en moyenne` : '–', c: C.text2 },
    { l: 'Temps actif', v: dur(A.active), d: A.active ? `${money(T.cost / (A.active / HOUR))} / heure active` : `inactivité > ${st.data.meta.idleGapMinutes} min exclue`, spark: [...A.activeB], c: C.text2 },
    { l: 'Taux de cache', v: pct(hit, 1), d: `économie grâce au cache : ${money(T.cacheSave)}`, c: C.text2 },
    { l: 'Projection fin de mois', v: money(pr.projected), d: `${money(pr.mtd)} déjà · ${money(pr.avg7)}/jour (7 j)`, c: C.text2 },
    { l: 'Rentabilité abonnements', v: planPeriod > 0 ? `×${(T.cost / planPeriod).toFixed(1)}` : '–', d: planPeriod > 0 ? `${money(T.cost)} API vs ${money(planPeriod)} d'abonnements au prorata` : 'aucun abonnement renseigné', c: C.text2 },
  ];
  $('#kpis').innerHTML = tiles.map((t) => `<div class="kpi ${t.hero ? 'hero' : ''}"><div class="l"><span>${t.l}</span></div><div class="v">${t.v}</div><div class="d" title="${esc((t.d || '').replace(/<[^>]+>/g, ''))}">${t.d || '&nbsp;'}</div>${t.extra ? `<div class="d">${esc(t.extra)}</div>` : ''}${t.spark ? sparkline(t.spark, t.c) : ''}</div>`).join('');
}

function bucketTitle(A, i) {
  return A.hourly ? dfHour.format(A.starts[i]) : dfDayW.format(A.starts[i]);
}
const xFmt = (A) => ({ fmt: (t) => (A.hourly ? `${new Date(t).getHours()}h` : dfDay.format(t)), width: A.hourly ? 40 : 60 });

function renderDaily(A) {
  $('#tDaily').textContent = `${metricLabel()} par ${A.hourly ? 'heure' : 'jour'}`;
  const series = [0, 1, 2].filter((t) => st.tools[t]).map((t) => ({ name: TOOL_NAMES[t], color: C.tool[t], values: [...A.byBucket[t][st.metric]] }));
  const tot = A.starts.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
  const nz = tot.filter((v) => v > 0).length;
  $('#dailySub').textContent = nz ? `moy. ${fmtMetric(tot.reduce((a, b) => a + b, 0) / Math.max(1, nz))} / ${A.hourly ? 'h' : 'jour'} actif · pic ${fmtMetric(Math.max(...tot))}` : '';
  colChart($('#cDaily'), { labels: A.starts, series, fmtY: (v, c) => fmtMetric(v, st.metric, c), tipTitle: (i) => bucketTitle(A, i), xLabel: xFmt(A) });
  $('#lgDaily').innerHTML = series.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('');
}

function renderShare(A) {
  const items = [0, 1, 2].filter((t) => st.tools[t]).map((t) => {
    const X = A.byTool[t], v = st.metric === 'cost' ? X.cost : st.metric === 'tokens' ? X.tokens : X.req;
    const tot = st.metric === 'cost' ? A.tot.cost : st.metric === 'tokens' ? A.tot.tokens : A.tot.req;
    return { label: TOOL_NAMES[t], value: v, color: C.tool[t], sub: tot ? pct(v / tot) : '',
      tip: `<div class="tt">${TOOL_NAMES[t]}</div>${tipRow('', 'Coût', money(X.cost))}${tipRow('', 'Tokens', fmtN(X.tokens))}${tipRow('', 'Requêtes', fmtN(X.req))}${tipRow('', 'Temps actif', dur(A.activeByTool[t]))}` };
  });
  barList($('#cShare'), items, { fmt: (v) => fmtMetric(v) });
  // token composition per tool (stacked horizontal)
  const types = [['in', 'Input', C.tin], ['cw', 'Cache write', C.tcw], ['cr', 'Cache read', C.tcr], ['out', 'Output', C.tout]];
  const el = $('#cTokens');
  const rows = [0, 1, 2].filter((t) => st.tools[t] && A.byTool[t].tokens > 0);
  if (!rows.length) { el.innerHTML = '<div class="empty">aucun token</div>'; $('#lgTokens').innerHTML = ''; return; }
  el.innerHTML = rows.map((t) => {
    const X = A.byTool[t], tot = X.in + X.cw + X.cr + X.out;
    return `<div class="bar-row" data-t="${t}" style="margin-bottom:8px"><div class="lab"><i style="background:${C.tool[t]}"></i>${TOOL_NAMES[t]}</div>
      <div style="display:flex;height:10px;gap:2px">${types.filter(([k]) => X[k] > 0).map(([k, , c], j, arr) => `<div style="flex:${X[k] / tot};background:${c};min-width:2px;${j === arr.length - 1 ? 'border-radius:0 4px 4px 0' : ''}"></div>`).join('')}</div>
      <div class="val">${fmtN(tot)}</div></div>`;
  }).join('');
  el.onmousemove = (ev) => {
    const row = ev.target.closest('[data-t]'); if (!row) return hideTip();
    const X = A.byTool[+row.dataset.t], tot = X.in + X.cw + X.cr + X.out;
    showTip(`<div class="tt">${TOOL_NAMES[+row.dataset.t]}</div>${types.map(([k, n, c]) => tipRow(c, n, `${fmtN(X[k])} · ${pct(X[k] / tot, 1)}`)).join('')}${X.rs ? tipRow('', 'dont raisonnement', fmtN(X.rs)) : ''}`, ev);
  };
  el.onmouseleave = hideTip;
  $('#lgTokens').innerHTML = types.map(([, n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('');
}

function renderCum(A) {
  const series = [0, 1, 2].filter((t) => st.tools[t]).map((t) => {
    let acc = 0; return { name: TOOL_NAMES[t], color: C.tool[t], values: [...A.byBucket[t][st.metric]].map((v) => (acc += v)) };
  });
  if (series.length > 1) { const tot = A.starts.map((_, i) => series.reduce((s, x) => s + x.values[i], 0)); series.push({ name: 'Total', color: C.text, values: tot }); }
  const planTotal = planMonthlyTotal();
  if (st.metric === 'cost' && planTotal > 0) {
    const step = A.hourly ? HOUR : DAY;
    series.push({ name: 'Abonnements (prorata)', color: C.text2, dash: true, values: A.starts.map((_, i) => (planTotal * ((i + 1) * step)) / (30.44 * DAY)) });
  }
  lineChart($('#cCum'), { labels: A.starts, series, fmtY: (v, c) => fmtMetric(v, st.metric, c), tipTitle: (i) => bucketTitle(A, i), xLabel: xFmt(A) });
  $('#lgCum').innerHTML = series.map((s) => `<span><i class="${s.dash ? 'dash' : 'line'}" style="background:${s.color}"></i>${s.name}</span>`).join('');
}

function renderPunch(A) {
  const el = $('#cPunch');
  const W = Math.max(280, el.clientWidth), m = { l: 30, t: 6, b: 20, r: 6 };
  const cw = (W - m.l - m.r) / 24, ch = Math.min(26, cw * 1.05), H = m.t + ch * 7 + m.b;
  const mx = Math.max(0, ...A.punch.flatMap((r) => [...r]));
  const days = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
  const maxR = Math.min(cw, ch) / 2 - 1.5;
  let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}">`;
  days.forEach((d, r) => { s += `<text x="${m.l - 6}" y="${m.t + r * ch + ch / 2 + 3.5}" text-anchor="end">${d}</text>`; });
  for (let h = 0; h < 24; h += 3) s += `<text x="${m.l + h * cw + cw / 2}" y="${H - 5}" text-anchor="middle">${h}h</text>`;
  for (let r = 0; r < 7; r++) for (let h = 0; h < 24; h++) {
    const v = A.punch[r][h], cx = m.l + h * cw + cw / 2, cy = m.t + r * ch + ch / 2;
    s += `<circle cx="${cx}" cy="${cy}" r="1.2" fill="${C.axis}"/>`;
    if (v > 0 && mx > 0) s += `<circle cx="${cx}" cy="${cy}" r="${Math.max(2, Math.sqrt(v / mx) * maxR)}" fill="${C.accent}" opacity="${0.35 + 0.65 * Math.sqrt(v / mx)}"/>`;
    s += `<rect class="hov" data-r="${r}" data-h="${h}" x="${cx - cw / 2}" y="${cy - ch / 2}" width="${cw}" height="${ch}"/>`;
  }
  el.innerHTML = s + '</svg>';
  let best = [0, 0, 0]; A.punch.forEach((row, r) => row.forEach((v, h) => { if (v > best[0]) best = [v, r, h]; }));
  $('#punchSub').textContent = best[0] ? `pic : ${days[best[1]]} ${best[2]}h–${best[2] + 1}h` : '';
  el.onmousemove = (ev) => { const d = ev.target.dataset; if (d.r == null) return hideTip(); showTip(`<div class="tt">${days[+d.r]} · ${d.h}h–${+d.h + 1}h</div>${tipRow('', metricLabel(), fmtMetric(A.punch[+d.r][+d.h]))}`, ev); };
  el.onmouseleave = hideTip;
}

function renderHeat() {
  const el = $('#cHeat');
  const map = dailyAll(st.metric);
  const today = sod(Date.now());
  const dow = (new Date(today).getDay() + 6) % 7;
  const start = addDays(today, -(52 * 7 + dow));
  const W = Math.max(300, el.clientWidth), m = { l: 30, t: 16, r: 4, b: 4 };
  const cols = 53, step = Math.min(17, (W - m.l - m.r) / cols), cell = step - 3, H = m.t + step * 7 + m.b + 22;
  const vals = []; for (const [k, e] of map) if (k >= start && e[3] > 0) vals.push(e[3]);
  vals.sort((a, b) => a - b);
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] || 0;
  const th = [q(0.25), q(0.5), q(0.75)];
  const level = (v) => (v <= 0 ? 0 : v <= th[0] ? 1 : v <= th[1] ? 2 : v <= th[2] ? 3 : 4);
  let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}">`;
  ['lun', '', 'mer', '', 'ven', '', 'dim'].forEach((d, r) => { if (d) s += `<text x="${m.l - 6}" y="${m.t + r * step + cell / 2 + 3.5}" text-anchor="end">${d}</text>`; });
  let lastMonth = -1, lastLabelCol = -9, activeDays = 0, total = 0;
  for (let c = 0; c < cols; c++) for (let r = 0; r < 7; r++) {
    const t = addDays(start, c * 7 + r);
    if (t > today) continue;
    const e = map.get(t), v = e ? e[3] : 0;
    if (v > 0) { activeDays++; total += v; }
    const mo = new Date(t).getMonth();
    if (r === 0 && mo !== lastMonth) {
      if (lastMonth !== -1 && c < cols - 2 && c - lastLabelCol >= 3) { s += `<text x="${m.l + c * step}" y="${m.t - 5}">${dfMonth.format(t).replace('.', '')}</text>`; lastLabelCol = c; }
      lastMonth = mo;
    }
    s += `<rect data-t="${t}" x="${m.l + c * step}" y="${m.t + r * step}" width="${cell}" height="${cell}" rx="2.5" fill="${C.heat[level(v)]}"/>`;
  }
  const ly = m.t + step * 7 + 10;
  s += `<text x="${W - m.r - 5 * (cell + 3) - 44}" y="${ly + cell - 2}">moins</text>`;
  for (let i = 0; i < 5; i++) s += `<rect x="${W - m.r - (5 - i) * (cell + 3) - 32}" y="${ly}" width="${cell}" height="${cell}" rx="2.5" fill="${C.heat[i]}"/>`;
  s += `<text x="${W - m.r}" y="${ly + cell - 2}" text-anchor="end">plus</text>`;
  el.innerHTML = s + '</svg>';
  $('#heatSub').textContent = `${activeDays} jours actifs · ${fmtMetric(total)} · série en cours : ${streak(map)} j`;
  el.onmousemove = (ev) => {
    const t = ev.target.dataset?.t; if (!t) return hideTip();
    const e = map.get(+t) || [0, 0, 0, 0];
    let h = `<div class="tt">${dfDayW.format(+t)}</div>`;
    [0, 1, 2].forEach((k) => { if (e[k]) h += tipRow(C.tool[k], TOOL_NAMES[k], fmtMetric(e[k])); });
    h += tipRow('', 'Total', fmtMetric(e[3]), 'tot');
    showTip(h, ev);
  };
  el.onmouseleave = hideTip;
}
function streak(map) {
  let t = sod(Date.now()), n = 0;
  if (!(map.get(t)?.[3] > 0)) t = addDays(t, -1);
  while (map.get(t)?.[3] > 0) { n++; t = addDays(t, -1); }
  return n;
}

function sortableTable(el, cols, rows, state, onSort, rowHtml) {
  const thead = `<tr>${cols.map((c) => `<th data-k="${c.k}" class="${c.n ? 'n' : ''} ${state && state.k === c.k ? 'sorted' + (state.asc ? ' asc' : '') : ''}">${c.label}</th>`).join('')}</tr>`;
  el.innerHTML = `<thead>${thead}</thead><tbody>${rows.map(rowHtml).join('') || `<tr><td colspan="${cols.length}" class="empty">aucune donnée</td></tr>`}</tbody>`;
  el.querySelectorAll('th').forEach((th) => th.onclick = () => onSort(th.dataset.k));
}
function sortRows(rows, s, getters) {
  const g = getters[s.k] || ((r) => r[s.k]);
  return rows.sort((a, b) => { const x = g(a), y = g(b); const c = typeof x === 'string' ? x.localeCompare(y) : (x ?? -Infinity) - (y ?? -Infinity); return s.asc ? c : -c; });
}

function renderModels(A) {
  const D = st.data;
  const s = st.modelSort || { k: st.metric === 'req' ? 'req' : st.metric === 'tokens' ? 'tokens' : 'cost', asc: false };
  const rows = sortRows([...A.byModel.values()], s, { name: (r) => D.models[r.mi] });
  const mx = Math.max(...rows.map((r) => r.cost), 1e-9);
  $('#modelSub').textContent = `${rows.length} modèles`;
  sortableTable($('#tModels'), [{ k: 'name', label: 'modèle' }, { k: 'req', label: 'req.', n: 1 }, { k: 'tokens', label: 'tokens', n: 1 }, { k: 'cost', label: 'coût', n: 1 }, { k: 'rule', label: 'tarif' }], rows, s,
    (k) => { st.modelSort = { k, asc: st.modelSort?.k === k ? !st.modelSort.asc : false }; renderModels(st.agg); },
    (r) => {
      const pi = st.priceIdx[r.mi];
      return `<tr data-mi="${r.mi}" style="cursor:pointer" title="filtrer sur ce modèle"><td><span class="tdot" style="background:${C.tool[r.tool]}"></span>${esc(D.models[r.mi])}</td><td class="n">${fmtN(r.req)}</td><td class="n">${fmtN(r.tokens)}</td>
        <td class="n">${money(r.cost)}<span class="mini" style="width:${(r.cost / mx) * 50}px"></span></td>
        <td style="color:var(--muted)">${pi >= 0 ? esc(st.settings.prices[pi].label) : '<span style="color:var(--warn)">⚠ non tarifé</span>'}</td></tr>`;
    });
  $('#tModels tbody').onclick = (ev) => { const tr = ev.target.closest('tr[data-mi]'); if (tr) { st.model = tr.dataset.mi; $('#fModel').value = st.model; render(); } };
}

function renderProjects(A) {
  const D = st.data;
  const s = st.projSort || { k: st.metric === 'req' ? 'req' : st.metric === 'tokens' ? 'tokens' : 'cost', asc: false };
  const rows = sortRows([...A.byProject.values()].map((p) => ({ ...p, nSess: p.sess.size })), s, { name: (r) => D.projects[r.p].name });
  const mx = Math.max(...rows.map((r) => r.cost), 1e-9);
  $('#projSub').textContent = `${rows.length} projets`;
  sortableTable($('#tProjects'), [{ k: 'name', label: 'projet' }, { k: 'nSess', label: 'sess.', n: 1 }, { k: 'tokens', label: 'tokens', n: 1 }, { k: 'cost', label: 'coût', n: 1 }, { k: 'last', label: 'dernière act.', n: 1 }], rows.slice(0, 60), s,
    (k) => { st.projSort = { k, asc: st.projSort?.k === k ? !st.projSort.asc : false }; renderProjects(st.agg); },
    (r) => `<tr data-p="${r.p}" style="cursor:pointer" title="${esc(D.projects[r.p].path || '')}"><td>${[...r.tools].sort().map((t) => `<span class="tdot" style="background:${C.tool[t]};margin-right:3px"></span>`).join('')} ${esc(D.projects[r.p].name)}</td>
      <td class="n">${r.nSess}</td><td class="n">${fmtN(r.tokens)}</td><td class="n">${money(r.cost)}<span class="mini" style="width:${(r.cost / mx) * 50}px"></span></td><td class="n" style="color:var(--muted)">${dfDay.format(r.last)}</td></tr>`);
  $('#tProjects tbody').onclick = (ev) => { const tr = ev.target.closest('tr[data-p]'); if (tr) { st.project = tr.dataset.p; $('#fProject').value = st.project; render(); } };
}

function renderToolCalls(A) {
  const counts = new Map();
  for (const si of A.bySess.keys()) {
    const S = st.data.sessions[si];
    for (const [k, v] of Object.entries(S.tools || {})) { let e = counts.get(k); if (!e) counts.set(k, (e = [0, 0, 0])); e[S.tool] += v; }
  }
  const items = [...counts.entries()].map(([k, e]) => { const t = e.indexOf(Math.max(...e)); const tot = e[0] + e[1] + e[2];
    return { label: k, value: tot, color: C.tool[t], tip: `<div class="tt">${esc(k)}</div>${[0, 1, 2].filter((i) => e[i]).map((i) => tipRow(C.tool[i], TOOL_NAMES[i], fmtN(e[i]))).join('')}` }; })
    .sort((a, b) => b.value - a.value).slice(0, 12);
  barList($('#cToolCalls'), items, { fmt: fmtN });
}

function renderDurations(A) {
  const edges = [5, 15, 30, 60, 120, 240, Infinity], labels = ['<5m', '5–15m', '15–30m', '30m–1h', '1–2h', '2–4h', '>4h'];
  const counts = [0, 1, 2].map(() => new Array(edges.length).fill(0));
  const act = [];
  for (const SS of A.bySess.values()) {
    const S = st.data.sessions[SS.si];
    const minutes = (SS.active || 0) / 60000;
    if (S.csv) continue;
    act.push(SS.active || 0);
    counts[S.tool][edges.findIndex((e) => minutes < e)]++;
  }
  const series = [0, 1, 2].filter((t) => st.tools[t]).map((t) => ({ name: TOOL_NAMES[t], color: C.tool[t], values: counts[t] }));
  colChart($('#cDur'), { labels, series, fmtY: (v) => fmtN(v), tipTitle: (i) => `Sessions ${labels[i]} actives`, height: 180, xLabel: { fmt: (l) => l, width: 40 } });
  act.sort((a, b) => a - b);
  $('#durNote').textContent = act.length ? `médiane ${dur(act[Math.floor(act.length / 2)])} · max ${dur(act[act.length - 1])} · temps actif = écarts < ${st.data.meta.idleGapMinutes} min entre messages` : '';
}

function renderStats(A) {
  const D = st.data, T = A.tot;
  const sess = [...A.bySess.values()];
  const prompts = sess.reduce((s, x) => s + (D.sessions[x.si].userMsgs || 0), 0);
  const lines = sess.reduce((s, x) => { const l = D.sessions[x.si].lines; if (l) { s[0] += l[0]; s[1] += l[1]; } return s; }, [0, 0]);
  const top = sess.slice().sort((a, b) => b.cost - a.cost)[0];
  const dayTot = A.starts.map((_, i) => A.byBucket.reduce((s, b, t) => s + (st.tools[t] ? b.cost[i] : 0), 0));
  const bestI = dayTot.indexOf(Math.max(...dayTot));
  const activeBuckets = dayTot.filter((v) => v > 0).length;
  const kv = [
    ['Prompts utilisateur', fmtN(prompts)],
    ['Requêtes / prompt', prompts ? (T.req / prompts).toFixed(1) : '–'],
    ['Ratio output / input', T.in + T.cw + T.cr ? (T.out / (T.in + T.cw + T.cr) * 100).toFixed(2) + ' %' : '–'],
    ['Tokens de raisonnement', T.rs ? `${fmtN(T.rs)} (${pct(T.rs / Math.max(1, T.out))} de l'output)` : '–'],
    ['Coût / prompt', prompts ? money(T.cost / prompts) : '–'],
    ['Coût / 1M tokens (moy.)', T.tokens ? money((T.cost / T.tokens) * 1e6) : '–'],
    [A.hourly ? 'Heures actives' : 'Jours actifs', `${activeBuckets} / ${A.starts.length}`],
    [A.hourly ? 'Heure la plus chère' : 'Jour le plus cher', dayTot[bestI] > 0 ? `${A.hourly ? dfHour.format(A.starts[bestI]) : dfDay.format(A.starts[bestI])} · ${money(dayTot[bestI])}` : '–'],
    ['Session la plus chère', top ? `${money(top.cost)} · ${esc(D.projects[D.sessions[top.si].p].name)}` : '–'],
    ['Recherches web (Claude)', fmtN(T.ws)],
    ['Lignes Cursor (+/−)', lines[0] || lines[1] ? `+${fmtN(lines[0])} / −${fmtN(lines[1])}` : '–'],
  ];
  $('#kvStats').innerHTML = kv.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
}

function renderSessions(A) {
  const D = st.data;
  const q = st.sessQuery.trim().toLowerCase();
  let rows = [...A.bySess.values()].map((x) => { const S = D.sessions[x.si]; return { ...x, S, start: S.start, title: S.title || '', proj: D.projects[S.p].name, tool: S.tool, prompts: S.userMsgs }; });
  if (q) rows = rows.filter((r) => `${r.title} ${r.proj} ${r.S.id} ${r.S.branch || ''} ${TOOL_NAMES[r.tool]} ${r.S.models.map((m) => D.models[m]).join(' ')}`.toLowerCase().includes(q));
  sortRows(rows, st.sessSort, {});
  $('#sessSub').textContent = `${rows.length} sessions`;
  const shown = rows.slice(0, st.sessLimit);
  const mx = Math.max(...rows.map((r) => r.cost), 1e-9);
  const cols = [{ k: 'start', label: 'début' }, { k: 'tool', label: 'outil' }, { k: 'proj', label: 'projet' }, { k: 'title', label: 'titre / premier prompt' }, { k: 'active', label: 'actif', n: 1 }, { k: 'prompts', label: 'prompts', n: 1 }, { k: 'req', label: 'req.', n: 1 }, { k: 'tokens', label: 'tokens', n: 1 }, { k: 'cost', label: 'coût', n: 1 }];
  sortableTable($('#tSessions'), cols, shown, st.sessSort, (k) => { st.sessSort = { k, asc: st.sessSort.k === k ? !st.sessSort.asc : false }; renderSessions(st.agg); }, (r) => {
    const open = st.openSess.has(r.si);
    const S = r.S;
    let h = `<tr data-si="${r.si}" style="cursor:pointer"><td class="tab" style="color:var(--muted)">${S.start ? dfDT.format(S.start) : '–'}</td><td><span class="tdot" style="background:${C.tool[r.tool]}"></span>${TOOL_NAMES[r.tool]}</td>
      <td>${esc(r.proj)}</td><td class="title" title="${esc(r.title)}">${esc(r.title) || '<span style="color:var(--muted)">—</span>'}</td>
      <td class="n">${dur(r.active)}</td><td class="n">${fmtN(r.prompts)}</td><td class="n">${fmtN(r.req)}</td><td class="n">${fmtN(r.tokens)}</td><td class="n">${money(r.cost)}<span class="mini" style="width:${(r.cost / mx) * 40}px"></span></td></tr>`;
    if (open) {
      const tools = Object.entries(S.tools || {}).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `<span class="tag">${esc(k)} ${v}</span>`).join('');
      h += `<tr class="row-detail"><td colspan="9"><div class="kv" style="grid-template-columns:auto 1fr auto 1fr;max-width:1000px">
        <span>id</span><b style="text-align:left">${esc(S.id)}</b><span>modèles</span><b style="text-align:left">${S.models.map((m) => esc(D.models[m])).join(', ')}</b>
        <span>chemin</span><b style="text-align:left">${esc(D.projects[S.p].path || '–')}</b><span>branche · version</span><b style="text-align:left">${esc(S.branch || '–')} · ${esc(S.version || '–')}</b>
        <span>période</span><b style="text-align:left">${S.start ? dfDT.format(S.start) : ''} → ${S.end ? dfDT.format(S.end) : ''}</b><span>lignes</span><b style="text-align:left">${S.lines ? `+${S.lines[0]} / −${S.lines[1]}` : '–'}</b>
        </div><div style="margin-top:8px">${tools}</div></td></tr>`;
    }
    return h;
  });
  $('#tSessions tbody').onclick = (ev) => { const tr = ev.target.closest('tr[data-si]'); if (!tr) return; const si = +tr.dataset.si; st.openSess.has(si) ? st.openSess.delete(si) : st.openSess.add(si); renderSessions(st.agg); };
  const more = $('#sessMore');
  more.classList.toggle('hide', rows.length <= st.sessLimit);
  more.textContent = `afficher plus (${rows.length - st.sessLimit} restantes)`;
}

// ───────────────────────── pricing / plans ─────────────────────────
function planMonthlyTotal() {
  let t = 0;
  TOOL_KEYS.forEach((k, i) => { if (!st.tools[i]) return; const p = st.settings.plans[k]; if (p && p.id !== 'api' && p.price > 0) t += p.price; });
  return t;
}
function projection() {
  const map = dailyAll('cost');
  const today = sod(Date.now()), m0 = som(today);
  let mtd = 0, last7 = 0, last30 = 0;
  for (const [k, e] of map) {
    if (k >= m0) mtd += e[3];
    if (k > addDays(today, -7)) last7 += e[3];
    if (k > addDays(today, -30)) last30 += e[3];
  }
  const dim = daysInMonth(today), dayOfMonth = new Date(today).getDate();
  const avg7 = last7 / 7;
  const projected = mtd + avg7 * (dim - dayOfMonth + (1 - (Date.now() - today) / DAY));
  return { mtd, avg7, last30, projected, dim, dayOfMonth, map };
}
function perToolMonth(monthStart) {
  const end = addMonths(monthStart, 1), out = [0, 0, 0];
  const rows = st.data.rows;
  for (let i = 0; i < rows.length; i++) { const r = rows[i]; if (r[3] < monthStart || r[3] >= end || !passes(r, false)) continue; out[r[0]] += st.rowCost[i]; }
  return out;
}

function renderPlans() {
  const now = Date.now(), m0 = som(now);
  const cur = perToolMonth(m0), prev = perToolMonth(addMonths(m0, -1));
  const frac = (now - m0) / (addMonths(m0, 1) - m0);
  $('#planSub').textContent = `${dfMonthL.format(m0)} · ${(frac * 100).toFixed(0)} % du mois écoulé`;
  const M = st.data.meta;
  const detected = [null, M.codexRateLimits?.plan_type || null, M.cursorPlan || null];
  $('#plans').innerHTML = TOOL_KEYS.map((k, i) => {
    const sel = st.settings.plans[k] || { id: 'none', price: 0 };
    const api = cur[i], proj = frac > 0.02 ? api / frac : api, price = sel.id === 'api' ? null : sel.price;
    const ratio = price > 0 ? proj / price : null;
    return `<div class="plan" style="${st.tools[i] ? '' : 'opacity:.45'}">
      <div class="ph"><i style="background:${C.tool[i]}"></i>${TOOL_NAMES[i]}${detected[i] ? `<span class="tag" style="margin-left:auto" title="détecté dans tes fichiers locaux">plan détecté : ${esc(detected[i])}</span>` : ''}</div>
      <div class="ctrl"><select data-plan="${k}">${PLANS[k].map((p) => `<option value="${p.id}" ${p.id === sel.id ? 'selected' : ''}>${p.name}${p.price != null ? ` — $${p.price}` : ''}</option>`).join('')}</select>
        ${sel.id !== 'api' ? `<input type="number" min="0" step="1" data-price="${k}" value="${sel.price ?? 0}" title="Prix mensuel ($)"><span class="flabel" style="margin:0">$/mois</span>` : ''}</div>
      <div class="roi">
        <div>API ce mois<b>${money(api)}</b></div>
        <div>projeté fin de mois<b>${money(proj)}</b></div>
        <div>mois dernier<b>${money(prev[i])}</b></div>
        <div>${price > 0 ? 'valeur / prix' : price === 0 ? 'abonnement' : 'facturation'}<b class="${ratio == null ? '' : ratio >= 1 ? 'pos' : 'neg'}">${ratio != null ? `×${ratio.toFixed(1)}` : price === 0 ? 'gratuit' : 'à l\'usage'}</b></div>
      </div>
      ${i === 2 && !M.cursorHasTokens ? `<div class="warnbox" style="margin:10px 0 0">Cursor ne stocke pas les tokens en local : <b>importe l'export CSV</b> de cursor.com (section sources) pour un coût réel.</div>` : ''}
      <div class="note">${price > 0 ? (proj >= price ? `Tu consommes l'équivalent de <b>${money(proj - price)}</b> de plus que ton abonnement.` : `En API tu paierais <b>${money(price - proj)}</b> de moins ce mois-ci.`) : sel.id === 'api' ? `Coût réel estimé : <b>${money(proj)}</b> ce mois.` : ''}</div>
    </div>`;
  }).join('');
  $$('#plans select').forEach((s) => s.onchange = () => {
    const k = s.dataset.plan, p = PLANS[k].find((x) => x.id === s.value);
    st.settings.plans[k] = { id: p.id, price: p.price };
    saveSettings(); render();
  });
  $$('#plans input[data-price]').forEach((inp) => inp.onchange = () => { st.settings.plans[inp.dataset.price].price = Math.max(0, +inp.value || 0); saveSettings(); render(); });
}

function renderMonthly() {
  const m0 = som(Date.now());
  const months = Array.from({ length: 6 }, (_, i) => addMonths(m0, i - 5));
  const vals = months.map(perToolMonth);
  const series = [0, 1, 2].filter((t) => st.tools[t]).map((t) => ({ name: TOOL_NAMES[t], color: C.tool[t], values: vals.map((v) => v[t]) }));
  const plan = planMonthlyTotal();
  colChart($('#cMonthly'), { labels: months, series, fmtY: (v, c) => money(v, { compact: c }), tipTitle: (i) => dfMonthL.format(months[i]) + (i === 5 ? ' (en cours)' : ''), ref: plan > 0 ? { value: plan, label: `abonnements ${money(plan)}/mois` } : null, xLabel: { fmt: (t) => dfMonth.format(t), width: 50 }, height: 220 });
  $('#lgMonthly').innerHTML = series.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('') + (plan > 0 ? '<span><i class="dash"></i>Total abonnements</span>' : '');
}

function renderProjection() {
  const pr = projection();
  const plan = planMonthlyTotal();
  const A = st.agg;
  const kv = [
    ['Dépensé ce mois (équiv. API)', money(pr.mtd)],
    ['Moyenne / jour (7 derniers j)', money(pr.avg7)],
    ['Projection fin de mois', money(pr.projected)],
    ['30 derniers jours', money(pr.last30)],
    ['Projection annuelle (rythme 30 j)', money((pr.last30 / 30) * 365)],
    ['Abonnements / mois', plan ? money(plan) : '–'],
    ['Économie projetée ce mois', plan ? `<span class="${pr.projected - plan >= 0 ? 'pos' : 'neg'}">${money(pr.projected - plan)}</span>` : '–'],
    ['Coût / heure active (période)', A.active ? money(A.tot.cost / (A.active / HOUR)) : '–'],
  ];
  $('#kvProj').innerHTML = kv.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
  // Codex rate limits snapshot
  const rl = st.data.meta.codexRateLimits;
  const box = $('#rateBox');
  if (!rl || !(rl.primary || rl.secondary)) { box.innerHTML = ''; return; }
  const one = (w, name) => {
    if (!w) return '';
    const used = Math.max(0, Math.min(100, w.used_percent ?? 0));
    const resetAt = w.resets_at ? w.resets_at * 1000 : w.resets_in_seconds != null ? rl.ts + w.resets_in_seconds * 1000 : null;
    const col = used >= 90 ? C.bad : used >= 70 ? C.warn : C.tool[1];
    const label = w.window_minutes ? (w.window_minutes >= 1440 ? `${Math.round(w.window_minutes / 1440)} j` : `${Math.round(w.window_minutes / 60)} h`) : name;
    const past = resetAt && resetAt < Date.now();
    return `<div style="margin-bottom:10px"><div class="srow" style="justify-content:space-between"><span>Fenêtre ${label} ${used >= 90 ? '⛔' : used >= 70 ? '⚠' : ''}</span><b>${used.toFixed(0)} %</b></div>
      <div class="meter" style="background:color-mix(in srgb, ${C.tool[1]} 18%, transparent)"><div style="width:${used}%;background:${col}"></div></div>
      <div class="note" style="margin:0">${resetAt ? (past ? `réinitialisée le ${dfHour.format(resetAt)} (relevé plus ancien)` : `reset ${dfHour.format(resetAt)}`) : ''}</div></div>`;
  };
  box.innerHTML = `<h2><span class="h">//</span> Limites Codex <span class="sub">relevé du ${dfHour.format(rl.ts)}${rl.plan_type ? ' · plan ' + esc(rl.plan_type) : ''}</span></h2>${one(rl.primary, 'principale')}${one(rl.secondary, 'secondaire')}`;
}

// ───────────────────────── time / money saved ─────────────────────────
// Real AI spend over [from, to): subscriptions prorated + API equivalent for pay-as-you-go tools
function aiSpend(from, to, apiByTool) {
  let s = 0;
  TOOL_KEYS.forEach((k, i) => {
    if (!st.tools[i]) return;
    const p = st.settings.plans[k];
    if (p?.id === 'api') s += apiByTool[i];
    else if (p?.price > 0) s += p.price * Math.min((to - from) / DAY, 3650) / 30.44;
  });
  return s;
}
function gainOf(activeMs, spend) {
  const g = st.settings.gain, h = activeMs / HOUR;
  const saved = h * Math.max(0, g.mult - 1), value = saved * g.rate;
  return { h, manual: h * g.mult, saved, value, spend, net: value - spend, roi: spend > 0 ? value / spend : null };
}
function renderGain(A) {
  const g = st.settings.gain, eur = st.settings.currency === 'EUR', fx = eur ? st.settings.eurRate || 0.86 : 1;
  $('#gRate').value = Math.round(g.rate * fx); $('#gRateU').textContent = eur ? '€/h' : '$/h'; $('#gMult').value = g.mult;
  const to = Math.min(A.to, Date.now());
  const G = gainOf(A.active, aiSpend(A.from, to, A.byTool.map((t) => t.cost)));
  const days = Math.max(1, (to - A.from) / DAY);
  $('#gainSub').textContent = `période filtrée · ${Math.round(days)} j`;
  const perTool = [0, 1, 2].filter((t) => st.tools[t] && A.activeByTool[t]).map((t) => `${TOOL_NAMES[t]} ${dur(A.activeByTool[t] * Math.max(0, g.mult - 1))}`).join(' · ');
  const kv = [
    ['Temps actif avec IA', dur(A.active)],
    ['Temps estimé sans IA', dur(G.manual * HOUR)],
    ['Temps gagné', `<span class="pos">${dur(G.saved * HOUR)}</span>${G.saved ? ` · ≈ ${(G.saved / 7).toFixed(1)} j de 7 h` : ''}`],
    ['dont par outil', perTool || '–'],
    ['Valeur du temps gagné', money(G.value)],
    ['Coût IA réel (abonnements)', money(G.spend)],
    ['Coût équivalent API', money(A.tot.cost)],
    ['Gain net', `<span class="${G.net >= 0 ? 'pos' : 'neg'}">${money(G.net)}</span>`],
    ['Retour sur investissement', G.roi != null ? `×${G.roi.toFixed(1)}` : '–'],
    ['Gain net si payé en API', `<span class="${G.value - A.tot.cost >= 0 ? 'pos' : 'neg'}">${money(G.value - A.tot.cost)}</span>`],
    ['Projection annuelle (rythme période)', money((G.net / days) * 365)],
  ];
  $('#kvGain').innerHTML = kv.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');

  // monthly comparison
  const m0 = som(Date.now());
  const months = Array.from({ length: 6 }, (_, i) => addMonths(m0, i - 5));
  const act = new Float64Array(6);
  for (const [tool, si, h, ms] of st.data.activity) {
    if (!st.tools[tool] || h < months[0]) continue;
    const S = st.data.sessions[si];
    if (st.project !== 'all' && S.p !== +st.project) continue;
    if (st.model !== 'all' && !S.models.includes(+st.model)) continue;
    const b = bucketOf(months, h); if (b >= 0) act[b] += ms;
  }
  const rows = months.map((m, i) => {
    const api = perToolMonth(m);
    return { m, api: api.reduce((s, v, t) => s + (st.tools[t] ? v : 0), 0), ...gainOf(act[i], aiSpend(m, Math.min(addMonths(m, 1), Date.now()), api)) };
  });
  colChart($('#cGain'), {
    labels: months, height: 200,
    series: [{ name: 'Valeur du temps gagné', color: C.accent, values: rows.map((r) => r.value) }, { name: 'Coût IA réel', color: C.bad, values: rows.map((r) => r.spend) }],
    fmtY: (v, c) => money(v, { compact: c }), tipTitle: (i) => dfMonthL.format(months[i]) + (i === 5 ? ' (en cours)' : ''),
    xLabel: { fmt: (t) => dfMonth.format(t), width: 50 },
  });
  $('#lgGain').innerHTML = `<span><i style="background:${C.accent}"></i>Valeur du temps gagné</span><span><i style="background:${C.bad}"></i>Coût IA réel</span>`;
  $('#tGain').innerHTML = `<thead><tr><th>mois</th><th class="n">actif</th><th class="n">gagné</th><th class="n">valeur</th><th class="n">coût IA</th><th class="n">équiv. API</th><th class="n">gain net</th><th class="n">ROI</th></tr></thead><tbody>${rows.slice().reverse().map((r) => `<tr><td>${dfMonthL.format(r.m)}</td><td class="n">${dur(r.h * HOUR)}</td><td class="n">${dur(r.saved * HOUR)}</td><td class="n">${money(r.value)}</td><td class="n">${money(r.spend)}</td><td class="n">${money(r.api)}</td><td class="n ${r.net >= 0 ? 'pos' : 'neg'}">${money(r.net)}</td><td class="n">${r.roi != null ? `×${r.roi.toFixed(1)}` : '–'}</td></tr>`).join('')}</tbody>`;
}

function renderPrices() {
  const D = st.data;
  const usage = st.settings.prices.map(() => ({ n: 0, cost: 0, models: new Set() }));
  D.rows.forEach((r, i) => { const pi = st.priceIdx[r[2]]; if (pi >= 0) { usage[pi].models.add(r[2]); usage[pi].cost += st.rowCost[i]; } });
  usage.forEach((u) => { u.n = u.models.size; });
  const hidden = st.showAllPrices ? 0 : usage.filter((u) => !u.n).length;
  const unp = [...new Set(D.rows.filter((r) => st.priceIdx[r[2]] < 0).map((r) => r[2]))];
  $('#unpriced').innerHTML = unp.length ? `<div class="warnbox"><b>⚠ ${unp.length} modèle(s) sans tarif</b> — comptés à 0 : ${unp.map((mi) => `<code>${esc(D.models[mi])}</code> <button class="btn ghost" data-add="${mi}" style="padding:1px 6px">+ tarif</button>`).join(' ')}</div>` : '';
  const f = (v) => (v == null ? '' : v);
  $('#tPrices').innerHTML = `<thead><tr><th>libellé</th><th>regex (nom canonique)</th><th class="n">input</th><th class="n">cache write 5m</th><th class="n">cache write 1h</th><th class="n">cache read</th><th class="n">output</th><th class="n">utilisé</th><th></th></tr></thead><tbody>${st.settings.prices.map((p, i) => (!st.showAllPrices && !usage[i].n && !p._new) ? '' : `
    <tr data-i="${i}"><td><input class="w" data-f="label" value="${esc(p.label)}"></td><td><input class="w" data-f="match" value="${esc(p.match)}" spellcheck="false"></td>
    ${['in', 'cw5', 'cw1h', 'cr', 'out'].map((k) => `<td class="n"><input type="number" step="0.001" min="0" data-f="${k}" value="${f(p[k])}"></td>`).join('')}
    <td class="n cnt" title="${esc([...usage[i].models].map((m) => D.models[m]).join(', '))}">${usage[i].n ? `${usage[i].n} mod. · ${money(usage[i].cost)}` : '–'}</td>
    <td><button class="btn ghost" data-up="${i}" title="monter" style="padding:1px 6px">↑</button><button class="btn ghost" data-del="${i}" title="supprimer" style="padding:1px 6px">✕</button></td></tr>`).join('')}
    <tr><td colspan="9" style="border:0;padding-top:8px"><button class="btn ghost" id="togglePrices">${st.showAllPrices ? 'masquer les règles inutilisées' : `afficher toutes les règles (${hidden} inutilisées masquées)`}</button></td></tr></tbody>`;
  $('#togglePrices').onclick = () => { st.showAllPrices = !st.showAllPrices; renderPrices(); };
  $('#tPrices').onchange = (ev) => {
    const inp = ev.target; const tr = inp.closest('tr[data-i]'); if (!tr) return;
    const p = st.settings.prices[+tr.dataset.i], k = inp.dataset.f;
    if (k === 'label' || k === 'match') p[k] = inp.value; else p[k] = inp.value === '' ? null : Math.max(0, +inp.value);
    if (k === 'match') { try { new RegExp(inp.value); inp.style.borderColor = ''; } catch { inp.style.borderColor = 'var(--bad)'; return; } }
    saveSettings(); recomputeAll();
  };
  $('#tPrices').onclick = (ev) => {
    const b = ev.target.closest('button'); if (!b || b.id === 'togglePrices') return;
    if (b.dataset.del) st.settings.prices.splice(+b.dataset.del, 1);
    if (b.dataset.up && +b.dataset.up > 0) { const i = +b.dataset.up; [st.settings.prices[i - 1], st.settings.prices[i]] = [st.settings.prices[i], st.settings.prices[i - 1]]; }
    saveSettings(); recomputeAll();
  };
  $('#unpriced').onclick = (ev) => {
    const b = ev.target.closest('[data-add]'); if (!b) return;
    const name = canon(D.models[+b.dataset.add]);
    st.settings.prices.unshift({ _new: true, label: D.models[+b.dataset.add], match: '^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', in: 1, cw5: 1.25, cw1h: 2, cr: 0.1, out: 5 });
    saveSettings(); recomputeAll();
    setTimeout(() => $('#tPrices input[data-f="in"]')?.focus(), 30);
  };
  $('#wsPrice').value = st.settings.wsPrice ?? 10;
  $('#eurRate').value = st.settings.eurRate ?? 0.86;
}

function renderSources() {
  const M = st.data.meta;
  const lines = [`<span class="m">$</span> node ai-usage.mjs <span class="m"># v${esc(M.version)} · ${esc(M.host)} · ${esc(M.platform)} · node ${esc(M.node)}</span>`];
  for (const s of M.sources) lines.push(`<span class="ok">✓</span> ${s.tool.padEnd(7).replace(/ /g, '&nbsp;')} ${String(s.files).padStart(5).replace(/ /g, '&nbsp;')} fichiers${s.sessions != null ? ` · ${s.sessions} conv.` : ''}  <span class="m">${esc(s.path)}</span> ${s.label !== 'local' ? `<span class="c">[${esc(s.label)}]</span>` : ''}`);
  for (const t of M.missing) lines.push(`<span class="w">–</span> ${t.padEnd(7).replace(/ /g, '&nbsp;')} <span class="m">aucune donnée trouvée</span>`);
  for (const w of M.warnings) lines.push(`<span class="w">! ${esc(w)}</span>`);
  lines.push(`<span class="m">→ ${fmtN(st.data.rows.length)} lignes agrégées · ${fmtN(st.data.sessions.length)} sessions · ${st.data.models.length} modèles · scan ${M.scanMs} ms · ${dfDT.format(M.generatedAt)}</span>`);
  $('#term').innerHTML = lines.join('<br>');
  const csv = M.sources.find((s) => s.label === 'csv import');
  $('#csvState').textContent = csv ? `${csv.files} fichier(s) CSV · ${fmtN(csv.events || 0)} lignes` : 'aucun import';
}

function renderFilters() {
  $$('#range button').forEach((b) => b.classList.toggle('on', b.dataset.r === st.range));
  $$('#metric button').forEach((b) => b.classList.toggle('on', b.dataset.m === st.metric));
  $$('#currency button').forEach((b) => b.classList.toggle('on', b.dataset.c === st.settings.currency));
  const [from, to] = rangeBounds();
  $('#dFrom').value = isoDay(from); $('#dTo').value = isoDay(to - 1);
  const D = st.data;
  const hasTool = [0, 1, 2].map((t) => D.rows.some((r) => r[0] === t));
  $('#toolChips').innerHTML = [0, 1, 2].map((t) => `<span class="chip ${st.tools[t] ? '' : 'off'}" data-t="${t}" title="${hasTool[t] ? 'clic : afficher/masquer · double-clic : seul' : 'aucune donnée trouvée'}" style="${hasTool[t] ? '' : 'opacity:.3'}"><span class="sw" style="background:${C.tool[t]}"></span>${TOOL_NAMES[t]}</span>`).join('');
}
function fillSelects() {
  const D = st.data;
  const projCost = new Map(), modelCost = new Map();
  D.rows.forEach((r, i) => { const p = D.sessions[r[1]].p; projCost.set(p, (projCost.get(p) || 0) + st.rowCost[i] + 1e-9); modelCost.set(r[2], (modelCost.get(r[2]) || 0) + st.rowCost[i] + 1e-9); });
  $('#fProject').innerHTML = '<option value="all">tous</option>' + [...projCost.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => `<option value="${p}">${esc(D.projects[p].name)}</option>`).join('');
  $('#fModel').innerHTML = '<option value="all">tous</option>' + [...modelCost.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => `<option value="${m}">${esc(D.models[m])}</option>`).join('');
  $('#fProject').value = projCost.has(+st.project) ? st.project : (st.project = 'all');
  $('#fModel').value = modelCost.has(+st.model) ? st.model : (st.model = 'all');
}

// ───────────────────────── orchestration ─────────────────────────
function render() {
  if (!st.data) return;
  readColors();
  renderFilters();
  const A = aggregate();
  renderKPIs(A); renderDaily(A); renderShare(A); renderCum(A); renderPunch(A); renderHeat();
  renderModels(A); renderProjects(A); renderToolCalls(A); renderDurations(A); renderStats(A); renderSessions(A);
  renderPlans(); renderMonthly(); renderProjection(); renderGain(A); renderPrices(); renderSources();
  store.set('view', { range: st.range, tools: st.tools, metric: st.metric });
}
function recomputeAll() { compilePrices(); render(); }

let saveT = null;
function saveSettings() {
  clearTimeout(saveT);
  $('#saveState').textContent = '…';
  saveT = setTimeout(async () => {
    try { await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(st.settings) }); $('#saveState').textContent = '✓ enregistré dans data/settings.json'; }
    catch { $('#saveState').textContent = '⚠ non enregistré'; }
  }, 350);
}

function setStatus(busy, text) {
  $('#status').classList.toggle('busy', busy);
  $('#statusText').textContent = text;
}
async function load(refresh = false) {
  setStatus(true, refresh ? 'scan en cours…' : 'chargement…');
  const res = await fetch('/api/data' + (refresh ? '?refresh=1' : ''));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  data.minHour = data.rows.reduce((m, r) => Math.min(m, r[3]), Infinity);
  if (!Number.isFinite(data.minHour)) data.minHour = Date.now() - 30 * DAY;
  st.data = data;
  compilePrices(); fillSelects(); render();
  const M = data.meta;
  const files = M.sources.reduce((s, x) => s + x.files, 0);
  setStatus(false, `${fmtN(files)} fichiers · scan ${M.scanMs} ms · ${new Date(M.generatedAt).toLocaleTimeString('fr-FR')}`);
  $('#prompt').innerHTML = `<b>${esc(M.host)}</b> $ usage --since ${st.range}<span class="caret"></span>`;
}

function bind() {
  $('#range').onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; st.range = b.dataset.r; st.sessLimit = 25; render(); };
  $('#metric').onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; st.metric = b.dataset.m; render(); };
  $('#currency').onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; st.settings.currency = b.dataset.c; saveSettings(); render(); };
  const onDate = () => {
    const f = $('#dFrom').value, t = $('#dTo').value; if (!f || !t) return;
    const [fy, fm, fd] = f.split('-').map(Number), [ty, tm, td] = t.split('-').map(Number);
    st.customFrom = new Date(fy, fm - 1, fd).getTime(); st.customTo = addDays(new Date(ty, tm - 1, td).getTime(), 1);
    if (st.customTo <= st.customFrom) return;
    st.range = 'custom'; render();
  };
  $('#dFrom').onchange = onDate; $('#dTo').onchange = onDate;
  let clickT = null;
  $('#toolChips').onclick = (ev) => {
    const c = ev.target.closest('.chip'); if (!c) return; const t = +c.dataset.t;
    clearTimeout(clickT); clickT = setTimeout(() => { st.tools[t] = !st.tools[t]; if (!st.tools.some(Boolean)) st.tools[t] = true; render(); }, 220);
  };
  $('#toolChips').ondblclick = (ev) => { const c = ev.target.closest('.chip'); if (!c) return; clearTimeout(clickT); const t = +c.dataset.t; st.tools = [0, 1, 2].map((i) => i === t); render(); };
  $('#fProject').onchange = (ev) => { st.project = ev.target.value; render(); };
  $('#fModel').onchange = (ev) => { st.model = ev.target.value; render(); };
  $('#sessSearch').oninput = (ev) => { st.sessQuery = ev.target.value; renderSessions(st.agg); };
  $('#sessMore').onclick = () => { st.sessLimit += 60; renderSessions(st.agg); };
  $('#btnRefresh').onclick = () => load(true).catch(fatal);
  $('#btnTheme').onclick = toggleTheme;
  $('#btnAuto').onclick = () => {
    st.auto = !st.auto; $('#btnAuto').classList.toggle('on', st.auto); store.set('auto', st.auto);
    clearInterval(st.timer); if (st.auto) st.timer = setInterval(() => load(true).catch(() => {}), 60_000);
  };
  $('#addPrice').onclick = () => { st.settings.prices.unshift({ label: 'Nouveau modèle', match: '^mon-modele', in: 1, cw5: 1, cw1h: 1, cr: 0.1, out: 5, _new: true }); saveSettings(); recomputeAll(); };
  $('#resetPrices').onclick = () => { if (!confirmReset()) return; st.settings.prices = DEFAULT_PRICES.map((p) => ({ ...p })); saveSettings(); recomputeAll(); };
  $('#wsPrice').onchange = (ev) => { st.settings.wsPrice = Math.max(0, +ev.target.value || 0); saveSettings(); recomputeAll(); };
  $('#gRate').onchange = (ev) => { const fx = st.settings.currency === 'EUR' ? st.settings.eurRate || 0.86 : 1; st.settings.gain = { ...st.settings.gain, rate: Math.max(0, +ev.target.value || 0) / fx }; saveSettings(); render(); };
  $('#gMult').onchange = (ev) => { st.settings.gain = { ...st.settings.gain, mult: Math.max(1, +ev.target.value || 1) }; saveSettings(); render(); };
  $('#eurRate').onchange = (ev) => { st.settings.eurRate = Math.max(0.01, +ev.target.value || 0.86); saveSettings(); render(); };
  // CSV import
  const drop = $('#drop'), file = $('#csvFile');
  drop.onclick = () => file.click();
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); uploadCSV([...e.dataTransfer.files]); };
  file.onchange = () => uploadCSV([...file.files]);
  $('#csvClear').onclick = async () => { await fetch('/api/import/cursor', { method: 'DELETE' }); load(false); };
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'r' || e.key === 'R') load(true).catch(fatal);
    else if (e.key === 't' || e.key === 'T') toggleTheme();
    else if (e.key === '/') { e.preventDefault(); $('#sessSearch').focus(); }
    else if (/^[1-7]$/.test(e.key)) { st.range = ['1d', '7d', '30d', '90d', 'mtd', 'ytd', 'all'][+e.key - 1]; render(); }
  });
  let rT = null;
  new ResizeObserver(() => { clearTimeout(rT); rT = setTimeout(render, 120); }).observe($('#app'));
}
let resetArmed = 0;
function confirmReset() { // no blocking dialogs: second click within 3 s confirms
  if (Date.now() - resetArmed < 3000) { resetArmed = 0; $('#resetPrices').textContent = 'réinitialiser les tarifs par défaut'; return true; }
  resetArmed = Date.now(); $('#resetPrices').textContent = 'cliquer encore pour confirmer';
  setTimeout(() => { $('#resetPrices').textContent = 'réinitialiser les tarifs par défaut'; }, 3000);
  return false;
}
async function uploadCSV(files) {
  for (const f of files.filter((x) => x.name.toLowerCase().endsWith('.csv'))) {
    $('#csvState').textContent = `import de ${f.name}…`;
    await fetch('/api/import/cursor?name=' + encodeURIComponent(f.name), { method: 'POST', body: await f.arrayBuffer() });
  }
  await load(false);
}
function toggleTheme() {
  const cur = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = cur; store.set('theme', cur); render();
}
function fatal(e) {
  console.error(e);
  $('#app').classList.add('hide');
  const f = $('#fatal'); f.classList.remove('hide');
  f.innerHTML = `<div class="panel"><h2><span class="h">//</span> Impossible de charger les données</h2>
    <div class="term">${esc(e.message || e)}<br><br><span class="m"># Ce dashboard doit être servi par le script local :</span><br>$ node ai-usage.mjs</div>
    <p class="note">Ouvre ensuite <b>http://127.0.0.1:4321</b>. Node ≥ 22.5 requis.</p></div>`;
}

// ───────────────────────── boot ─────────────────────────
(async function boot() {
  const theme = store.get('theme', 'dark'); document.documentElement.dataset.theme = theme;
  const view = store.get('view', null);
  if (view) { st.range = view.range === 'custom' ? '30d' : view.range || '30d'; st.tools = Array.isArray(view.tools) && view.tools.length === 3 ? view.tools : st.tools; st.metric = view.metric || 'cost'; }
  if (store.get('auto', false)) { st.auto = true; $('#btnAuto').classList.add('on'); st.timer = setInterval(() => load(true).catch(() => {}), 60_000); }
  readColors(); bind();
  if (location.protocol === 'file:') return fatal(new Error('Page ouverte en file:// — aucune donnée accessible.'));
  try {
    const s = await fetch('/api/settings').then((r) => r.json()).catch(() => ({}));
    const d = DEFAULT_SETTINGS();
    st.settings = { ...d, ...s, plans: { ...d.plans, ...(s.plans || {}) }, gain: { ...d.gain, ...(s.gain || {}) }, prices: Array.isArray(s.prices) && s.prices.length ? s.prices : d.prices };
    if ((s.pricesVersion || 1) < PRICES_VERSION && Array.isArray(s.prices) && s.prices.length) {
      const have = new Set(s.prices.map((p) => p.label));
      const added = DEFAULT_PRICES.filter((p) => (p.since || 1) > (s.pricesVersion || 1) && !have.has(p.label)).map((p) => ({ ...p }));
      st.settings.prices = [...added, ...st.settings.prices];
      st.settings.pricesVersion = PRICES_VERSION;
      saveSettings();
    }
    await load(false);
    if (!s.plans) { // first run: preselect plans detected in local files
      const M = st.data.meta, map = { codex: { plus: 'plus', pro: 'pro', go: 'go', business: 'business', team: 'business' }, cursor: { pro: 'pro', pro_plus: 'proplus', 'pro+': 'proplus', ultra: 'ultra', free: 'hobby', hobby: 'hobby' } };
      const pick = (k, v) => { const id = map[k][String(v || '').toLowerCase()]; const p = id && PLANS[k].find((x) => x.id === id); if (p) st.settings.plans[k] = { id: p.id, price: p.price }; };
      pick('codex', M.codexRateLimits?.plan_type); pick('cursor', M.cursorPlan);
      saveSettings(); render();
    }
  } catch (e) { fatal(e); }
})();
