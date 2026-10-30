#!/usr/bin/env node
// ai-usage — local dashboard for Claude Code, Codex CLI & Cursor usage.
// Zero dependencies. Node >= 22.5 (node:sqlite is used for Cursor).
// Everything stays on this machine: the server only listens on 127.0.0.1.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import readline from 'node:readline';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Silence the "SQLite is experimental" warning — noise for an end-user tool.
const _emit = process.emitWarning;
process.emitWarning = (w, ...rest) => {
  const msg = typeof w === 'string' ? w : w?.message || '';
  if (/SQLite is an experimental feature/i.test(msg)) return;
  return _emit.call(process, w, ...rest);
};

const VERSION = '1.0.0';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.AI_USAGE_HOME || os.homedir();
const DATA_DIR = path.join(__dirname, 'data');
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const IMPORT_DIR = path.join(DATA_DIR, 'imports', 'cursor');
const CONFIG_FILE = path.join(__dirname, 'ai-usage.config.json');
const PUBLIC_FILE = path.join(__dirname, 'public', 'index.html');
const CACHE_VERSION = 4;
const TOOLS = ['claude', 'codex', 'cursor'];

// ─────────────────────────────── CLI ────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

if (flag('help') || flag('h')) {
  console.log(`ai-usage v${VERSION}
Usage: node ai-usage.mjs [options]

  --port <n>       Port (default 4321, next free port is used if busy)
  --no-open        Don't open the browser
  --no-wsl         Don't look inside running WSL distros
  --json <file>    Scan once, write the dataset to <file> and exit
  --rescan         Ignore the parse cache
  --help           This help

Config (optional): ai-usage.config.json next to this script
  { "claudeDirs": [], "codexDirs": [], "cursorUserDir": "", "wsl": true, "idleGapMinutes": 15 }`);
  process.exit(0);
}

const config = readJSON(CONFIG_FILE, {});
const IDLE_GAP = (config.idleGapMinutes || 15) * 60_000;
const log = (...a) => { if (!flag('json') || flag('verbose')) console.log(...a); };
const c = { dim: (s) => `\x1b[2m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`, cyan: (s) => `\x1b[36m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m` };

// ───────────────────────────── helpers ──────────────────────────────
function readJSON(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
const uniq = (a) => [...new Set(a)];

async function walk(dir, ext, out = []) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, ext, out);
    else if (e.isFile() && e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

async function* lines(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const l of rl) yield l;
}

function parseTs(x) {
  if (x == null) return NaN;
  if (typeof x === 'number') {
    if (x > 1e12 && x < 1e14) return x;       // ms
    if (x > 1e9 && x < 1e11) return x * 1000; // seconds
    return NaN;                                // relative perf timers etc.
  }
  if (typeof x === 'string') {
    if (/^\d+$/.test(x)) return parseTs(Number(x));
    const t = Date.parse(x);
    return Number.isFinite(t) ? t : NaN;
  }
  return NaN;
}

function cleanTitle(s) {
  if (!s) return null;
  s = String(s).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > 140 ? s.slice(0, 137) + '…' : s;
}

function projectName(p) {
  if (!p) return '(unknown)';
  const parts = String(p).replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function fileUriToPath(u) {
  if (!u) return null;
  try {
    if (u.startsWith('file://')) {
      let p = decodeURIComponent(u.replace(/^file:\/\//, ''));
      if (/^\/[a-zA-Z]:/.test(p)) p = p.slice(1).replace(/\//g, '\\');
      return p;
    }
    if (u.startsWith('vscode-remote://')) return decodeURIComponent(u.replace(/^vscode-remote:\/\/[^/]+/, ''));
    return decodeURIComponent(u);
  } catch { return u; }
}

// ───────────────────────────── discovery ────────────────────────────
function wslHomes() {
  if (process.platform !== 'win32' || flag('no-wsl') || config.wsl === false) return [];
  let distros = [];
  try {
    // --running: never boot a stopped distro just to scan it
    const raw = execFileSync('wsl.exe', ['-l', '-q', '--running'], { timeout: 4000, windowsHide: true });
    distros = raw.toString('utf16le').replace(/\0/g, '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
  const homes = [];
  for (const d of distros) {
    for (const base of [`\\\\wsl.localhost\\${d}`, `\\\\wsl$\\${d}`]) {
      if (!isDir(base)) continue;
      const h = path.join(base, 'home');
      try { for (const u of fs.readdirSync(h)) homes.push({ dir: path.join(h, u), label: `wsl:${d}/${u}` }); } catch {}
      homes.push({ dir: path.join(base, 'root'), label: `wsl:${d}/root` });
      break;
    }
  }
  return homes;
}

function cursorUserDir() {
  if (config.cursorUserDir) return config.cursorUserDir;
  if (process.env.AI_USAGE_CURSOR_DIR) return process.env.AI_USAGE_CURSOR_DIR;
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'), 'Cursor', 'User');
  if (process.platform === 'darwin') return path.join(HOME, 'Library', 'Application Support', 'Cursor', 'User');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'), 'Cursor', 'User');
}

function discover() {
  const homes = [{ dir: HOME, label: 'local' }, ...wslHomes()];
  const claude = [], codex = [];
  const envClaude = (process.env.CLAUDE_CONFIG_DIR || '').split(/[,;]/).filter(Boolean);
  for (const d of envClaude) claude.push({ root: d, label: 'CLAUDE_CONFIG_DIR' });
  if (process.env.CODEX_HOME) codex.push({ root: process.env.CODEX_HOME, label: 'CODEX_HOME' });
  for (const h of homes) {
    claude.push({ root: path.join(h.dir, '.claude'), label: h.label });
    claude.push({ root: path.join(h.dir, '.config', 'claude'), label: h.label });
    codex.push({ root: path.join(h.dir, '.codex'), label: h.label });
  }
  for (const d of config.claudeDirs || []) claude.push({ root: d, label: 'config' });
  for (const d of config.codexDirs || []) codex.push({ root: d, label: 'config' });
  const dedupe = (arr) => { const s = new Set(); return arr.filter((x) => { const k = path.resolve(x.root).toLowerCase(); if (s.has(k)) return false; s.add(k); return true; }); };
  return { claude: dedupe(claude), codex: dedupe(codex), cursor: cursorUserDir() };
}

// ─────────────────────────── Claude Code ────────────────────────────
// ~/.claude/projects/<encoded-cwd>/<session>.jsonl (+ subagent files)
// ev = [ts, model, in, cw5m, cw1h, cacheRead, out, webSearch, costUSD|null, reasoning, dedupeKey]
function claudeUserText(content) {
  if (typeof content === 'string') {
    if (/^\s*(<local-command|Caveat:|<command-message>|<system-reminder>)/.test(content)) return null;
    const m = content.match(/<command-name>([^<]+)<\/command-name>/);
    return m ? m[1].trim() : content;
  }
  if (Array.isArray(content)) {
    const texts = content.filter((x) => x && x.type === 'text' && typeof x.text === 'string').map((x) => x.text);
    if (!texts.length) return null; // tool_result only
    return claudeUserText(texts.join(' '));
  }
  return null;
}

async function parseClaudeFile(file) {
  const msgs = new Map();
  const ts = [];
  const meta = { id: null, cwd: null, title: null, summary: null, branch: null, version: null, userMsgs: 0, tools: {}, sidechain: false };
  for await (const line of lines(file)) {
    if (!line || line.charCodeAt(0) !== 123) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const t = parseTs(o.timestamp);
    if (o.sessionId && !meta.id) meta.id = o.sessionId;
    if (o.cwd && !meta.cwd) meta.cwd = o.cwd;
    if (o.gitBranch && !meta.branch) meta.branch = o.gitBranch;
    if (o.version) meta.version = o.version;
    if (o.isSidechain) meta.sidechain = true;
    if (o.type === 'summary' && o.summary && !meta.summary) meta.summary = o.summary;
    if (o.type === 'user' && !o.isMeta && o.message?.role === 'user') {
      const text = claudeUserText(o.message.content);
      if (text != null && !o.isSidechain) {
        meta.userMsgs++;
        if (!meta.title && !text.startsWith('/')) meta.title = cleanTitle(text);
        if (Number.isFinite(t)) ts.push(t);
      }
      continue;
    }
    if (o.type !== 'assistant' || !o.message) continue;
    const m = o.message;
    if (Number.isFinite(t)) ts.push(t);
    if (Array.isArray(m.content)) for (const cItem of m.content) if (cItem?.type === 'tool_use' && cItem.name) meta.tools[cItem.name] = (meta.tools[cItem.name] || 0) + 1;
    const u = m.usage;
    if (!u || m.model === '<synthetic>' || !Number.isFinite(t)) continue;
    const key = `${m.id || ''}:${o.requestId || ''}`;
    const cw1h = u.cache_creation?.ephemeral_1h_input_tokens || 0;
    const cwAll = u.cache_creation_input_tokens || 0;
    const ev = [t, m.model || 'unknown', u.input_tokens || 0, Math.max(0, cwAll - cw1h), cw1h, u.cache_read_input_tokens || 0,
      u.output_tokens || 0, u.server_tool_use?.web_search_requests || 0, typeof o.costUSD === 'number' ? o.costUSD : null, 0, key];
    const prev = msgs.get(key);
    if (!prev) msgs.set(key, ev);
    else if (ev[6] > prev[6]) { ev[0] = prev[0]; msgs.set(key, ev); } // streamed chunks: keep final usage, first ts
  }
  if (!meta.id) meta.id = path.basename(file, '.jsonl');
  if (!meta.title) meta.title = cleanTitle(meta.summary);
  delete meta.summary;
  return { tool: 'claude', sessions: [{ ...meta, ts }], events: [...msgs.values()].map((e) => [...e, meta.id]) };
}

// ───────────────────────────── Codex CLI ────────────────────────────
function codexTitle(msg) {
  if (!msg) return null;
  let s = String(msg);
  const cmd = s.match(/<command-name>([^<]+)<\/command-name>/);
  if (cmd) return null; // slash command: not a meaningful title
  const req = s.split(/##\s*My request for Codex:?/i);
  if (req.length > 1) s = req[req.length - 1];
  s = s.split(/\r?\n/).filter((l) => !/^\s*(#|<|\s*$)/.test(l) && !/^\s*[A-Z]:[\\/]/.test(l)).join(' ');
  return cleanTitle(s);
}
// ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
async function parseCodexFile(file) {
  const meta = { id: null, cwd: null, title: null, branch: null, version: null, userMsgs: 0, tools: {}, provider: null };
  const events = [], recEvents = [], ts = [];
  let userEv = 0, userItems = 0;
  let model = null, prevTotal = null, prevTot = null, rate = null;
  const mkEv = (t, u, key) => {
    const inp = u.input_tokens || 0;
    const cached = u.cached_input_tokens || u.cache_read_input_tokens || 0;
    const cw = u.cache_write_input_tokens || u.cache_creation_input_tokens || 0;
    return [t, model, Math.max(0, inp - cached - cw), cw, 0, cached, u.output_tokens || 0, 0, null, u.reasoning_output_tokens || 0, key];
  };
  for await (const line of lines(file)) {
    if (!line || line.charCodeAt(0) !== 123) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const t = parseTs(o.timestamp);
    const p = o.payload;
    if (!p) continue;
    switch (o.type) {
      case 'session_meta':
        meta.id = meta.id || p.id; meta.cwd = meta.cwd || p.cwd; meta.version = p.cli_version || meta.version;
        meta.branch = meta.branch || p.git?.branch || null; meta.provider = p.model_provider || meta.provider;
        if (p.model) model = p.model;
        break;
      case 'turn_context':
        if (p.model) model = p.model;
        if (p.cwd && !meta.cwd) meta.cwd = p.cwd;
        break;
      case 'token_usage_record': // newer Codex: one record per model response
        if (p.usage && Number.isFinite(t)) { recEvents.push(mkEv(t, p.usage, p.response_id ? `cx:${p.response_id}` : null)); ts.push(t); }
        break;
      case 'event_msg':
        if (p.type === 'token_count') {
          if (p.rate_limits && (p.rate_limits.primary || p.rate_limits.secondary) && Number.isFinite(t)) rate = { ts: t, ...p.rate_limits };
          const info = p.info;
          if (!info || !Number.isFinite(t)) break;
          const tot = info.total_token_usage, last = info.last_token_usage;
          const totN = tot?.total_tokens ?? null;
          if (totN != null && prevTotal != null && totN === prevTotal) break; // duplicate snapshot
          let u = last;
          if (!u && tot) {
            u = {};
            for (const k of ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens']) u[k] = Math.max(0, (tot[k] || 0) - (prevTot?.[k] || 0));
          }
          prevTotal = totN; prevTot = tot;
          if (!u || !((u.input_tokens || 0) + (u.output_tokens || 0))) break;
          events.push(mkEv(t, u, null));
          ts.push(t);
        } else if (p.type === 'user_message') {
          userEv++;
          const msg = typeof p.message === 'string' ? p.message : '';
          if (!meta.title) meta.title = codexTitle(msg);
          if (Number.isFinite(t)) ts.push(t);
        } else if (p.type === 'item_completed' && p.item?.type === 'UserMessage') { // Codex desktop / app-server
          userItems++;
          const msg = (p.item.content || []).map((x) => (typeof x?.text === 'string' ? x.text : '')).join(' ');
          if (!meta.title) meta.title = codexTitle(msg);
          if (Number.isFinite(t)) ts.push(t);
        } else if (p.type === 'agent_message' && Number.isFinite(t)) ts.push(t);
        break;
      case 'response_item':
        if (/_call$/.test(p.type || '') && !/_output$/.test(p.type)) {
          const n = p.name || p.type.replace(/_call$/, '');
          meta.tools[n] = (meta.tools[n] || 0) + 1;
          if (Number.isFinite(t)) ts.push(t);
        }
        break;
    }
  }
  meta.userMsgs = Math.max(userEv, userItems);
  const use = recEvents.length ? recEvents : events; // prefer per-response records when present
  const fallback = use.find((e) => e[1])?.[1] || model || 'gpt-5';
  for (const e of use) if (!e[1]) e[1] = fallback;
  if (!meta.id) meta.id = path.basename(file, '.jsonl');
  return { tool: 'codex', sessions: [{ ...meta, ts }], events: use.map((e) => [...e, meta.id]), rate };
}

// ────────────────────────────── Cursor ──────────────────────────────
// <User>/globalStorage/state.vscdb  → cursorDiskKV: composerData:* and bubbleId:*
// <User>/workspaceStorage/*/        → workspace.json + state.vscdb (composer ↔ project)
let sqliteMod = null;
async function sqlite() {
  if (sqliteMod !== null) return sqliteMod;
  try { sqliteMod = await import('node:sqlite'); } catch { sqliteMod = false; }
  return sqliteMod;
}

function openDb(mod, file) {
  try { return new mod.DatabaseSync(file, { readOnly: true }); }
  catch (e) {
    // Locked or WAL-only: work on a temp copy
    const tmp = path.join(os.tmpdir(), `ai-usage-${process.pid}-${path.basename(path.dirname(file))}.vscdb`);
    fs.copyFileSync(file, tmp);
    for (const ext of ['-wal', '-shm']) if (exists(file + ext)) fs.copyFileSync(file + ext, tmp + ext);
    return new mod.DatabaseSync(tmp, { readOnly: true });
  }
}

function normCursorModel(m) {
  if (!m) return null;
  const s = String(m).trim().toLowerCase();
  if (!s || s === 'default' || s === 'auto') return 'cursor-auto';
  return s;
}

async function parseCursor(userDir) {
  const out = { tool: 'cursor', sessions: [], events: [], warnings: [], files: 0 };
  const gdb = path.join(userDir, 'globalStorage', 'state.vscdb');
  if (!exists(gdb)) return { ...out, missing: true };
  const mod = await sqlite();
  if (!mod) { out.warnings.push(`Cursor: node:sqlite indisponible (Node ${process.version}). Installe Node >= 22.5.`); return out; }

  // composer → project (workspaceStorage)
  const composerProject = new Map();
  const wsRoot = path.join(userDir, 'workspaceStorage');
  let wsDirs = [];
  try { wsDirs = fs.readdirSync(wsRoot); } catch {}
  for (const d of wsDirs) {
    const wsJson = readJSON(path.join(wsRoot, d, 'workspace.json'), null);
    const folder = fileUriToPath(wsJson?.folder || wsJson?.workspace || wsJson?.configuration);
    const dbFile = path.join(wsRoot, d, 'state.vscdb');
    if (!folder || !exists(dbFile)) continue;
    try {
      const db = openDb(mod, dbFile);
      const row = db.prepare("SELECT CAST(value AS TEXT) v FROM ItemTable WHERE key = 'composer.composerData'").get();
      db.close();
      const data = row?.v ? JSON.parse(row.v) : null;
      for (const cmp of data?.allComposers || []) if (cmp?.composerId) composerProject.set(cmp.composerId, folder);
    } catch {}
  }

  let db;
  try { db = openDb(mod, gdb); } catch (e) { out.warnings.push(`Cursor: impossible d'ouvrir state.vscdb (${e.message})`); return out; }
  out.files = 1;
  try { out.plan = db.prepare("SELECT CAST(value AS TEXT) v FROM ItemTable WHERE key = 'cursorAuth/stripeMembershipType'").get()?.v || null; } catch {}
  const hasKV = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cursorDiskKV'").get();
  if (!hasKV) { db.close(); return out; }

  const composers = new Map();
  const iter = (stmt) => (typeof stmt.iterate === 'function' ? stmt.iterate() : stmt.all());
  for (const r of iter(db.prepare("SELECT key, CAST(value AS TEXT) v FROM cursorDiskKV WHERE key >= 'composerData:' AND key < 'composerData;'"))) {
    let d; try { d = JSON.parse(r.v); } catch { continue; }
    if (!d) continue;
    const id = d.composerId || r.key.slice('composerData:'.length);
    composers.set(id, {
      id, title: cleanTitle(d.name || d.subtitle), start: parseTs(d.createdAt), end: parseTs(d.lastUpdatedAt),
      cwd: d.workspaceIdentifier?.uri?.fsPath || fileUriToPath(d.workspaceIdentifier?.uri?.external) || null,
      model: normCursorModel(d.modelConfig?.modelName), headers: (d.fullConversationHeadersOnly || []).map((h) => h.bubbleId),
      inline: Array.isArray(d.conversation) ? d.conversation : null,
      lines: [d.totalLinesAdded || 0, d.totalLinesRemoved || 0], mode: d.unifiedMode || d.forceMode || null,
      bubbles: new Map(),
    });
  }

  const addBubble = (cid, b) => {
    let cmp = composers.get(cid);
    if (!cmp) { cmp = { id: cid, title: null, start: NaN, end: NaN, model: null, headers: [], inline: null, lines: [0, 0], bubbles: new Map() }; composers.set(cid, cmp); }
    cmp.bubbles.set(b.id, b);
  };

  try {
    const stmt = db.prepare(`SELECT key,
        json_extract(v,'$.type') t, json_extract(v,'$.tokenCount.inputTokens') i, json_extract(v,'$.tokenCount.outputTokens') o,
        json_extract(v,'$.createdAt') c, json_extract(v,'$.timingInfo.clientStartTime') s, json_extract(v,'$.timingInfo.clientRpcSendTime') s2,
        json_extract(v,'$.modelInfo.modelName') m, json_extract(v,'$.toolFormerData.name') tn
      FROM (SELECT key, CAST(value AS TEXT) v FROM cursorDiskKV WHERE key >= 'bubbleId:' AND key < 'bubbleId;') WHERE json_valid(v)`);
    for (const r of iter(stmt)) {
      const parts = r.key.split(':');
      if (parts.length < 3) continue;
      addBubble(parts[1], { id: parts[2], type: r.t, i: r.i || 0, o: r.o || 0, ts: parseTs(r.c) || parseTs(r.s) || parseTs(r.s2), model: normCursorModel(r.m), tool: r.tn || null });
    }
  } catch (e) { out.warnings.push(`Cursor: lecture des messages impossible (${e.message})`); }
  db.close();

  for (const cmp of composers.values()) {
    // Older Cursor builds kept the conversation inline in composerData
    if (!cmp.bubbles.size && cmp.inline) {
      for (const b of cmp.inline) {
        if (!b) continue;
        cmp.bubbles.set(b.bubbleId || Math.random().toString(36), {
          id: b.bubbleId, type: b.type, i: b.tokenCount?.inputTokens || 0, o: b.tokenCount?.outputTokens || 0,
          ts: parseTs(b.createdAt) || parseTs(b.timingInfo?.clientStartTime), model: normCursorModel(b.modelInfo?.modelName), tool: b.toolFormerData?.name || null,
        });
      }
      cmp.headers = cmp.inline.map((b) => b?.bubbleId);
    }
    if (!cmp.bubbles.size) continue;
    let list = [];
    const seen = new Set();
    for (const h of cmp.headers) { const b = cmp.bubbles.get(h); if (b) { list.push(b); seen.add(h); } }
    const rest = [...cmp.bubbles.values()].filter((b) => !seen.has(b.id)).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    list = list.concat(rest);
    // time bounds
    const known = list.map((b) => b.ts).filter(Number.isFinite);
    let start = Number.isFinite(cmp.start) ? cmp.start : Math.min(...known);
    let end = Number.isFinite(cmp.end) ? cmp.end : Math.max(...known);
    if (!Number.isFinite(start) && !Number.isFinite(end)) continue;
    if (!Number.isFinite(start)) start = end;
    if (!Number.isFinite(end) || end < start) end = start;
    // interpolate missing timestamps along the conversation order
    const n = list.length;
    list.forEach((b, i) => { if (!Number.isFinite(b.ts)) b.ts = start + ((end - start) * i) / Math.max(1, n - 1); });

    const sess = { id: cmp.id, cwd: cmp.cwd || composerProject.get(cmp.id) || null, title: cmp.title, branch: null, version: null, userMsgs: 0, tools: {}, lines: cmp.lines, ts: [] };
    for (const b of list) {
      sess.ts.push(b.ts);
      if (b.type === 1) sess.userMsgs++;
      if (b.tool) sess.tools[b.tool] = (sess.tools[b.tool] || 0) + 1;
      // Cursor "requests" = user prompts; AI bubbles (thinking/tool steps) only carry tokens when Cursor stored them
      if (b.type === 1) out.events.push([b.ts, b.model || cmp.model || 'cursor-auto', 0, 0, 0, 0, 0, 0, null, 0, null, cmp.id, 1]);
      else if (b.type === 2 && (b.i || b.o)) out.events.push([b.ts, b.model || cmp.model || 'cursor-auto', b.i, 0, 0, 0, b.o, 0, null, 0, null, cmp.id, 0]);
    }
    if (!sess.title) {
      sess.title = null;
    }
    out.sessions.push(sess);
  }
  return out;
}

// Cursor dashboard CSV export (cursor.com/dashboard → Usage → Export CSV)
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

function parseCursorCSVs() {
  const out = { tool: 'cursor', sessions: [], events: [], files: 0, csv: true };
  let files = [];
  try { files = fs.readdirSync(IMPORT_DIR).filter((f) => f.toLowerCase().endsWith('.csv')); } catch { return out; }
  const seen = new Set();
  const days = new Map();
  for (const f of files) {
    const rows = parseCSV(fs.readFileSync(path.join(IMPORT_DIR, f), 'utf8'));
    if (rows.length < 2) continue;
    out.files++;
    const H = rows[0].map((h) => h.trim().toLowerCase());
    const col = (...names) => {
      for (const n of names) { const i = H.indexOf(n); if (i >= 0) return i; }
      for (const n of names) { const i = H.findIndex((h) => h.startsWith(n)); if (i >= 0) return i; }
      return -1;
    };
    const iDate = col('date'), iModel = col('model'), iKind = col('kind'), iCW = col('input (w/ cache write)'), iIn = col('input (w/o cache write)', 'input tokens', 'input'),
      iCR = col('cache read'), iOut = col('output'), iCost = col('cost'), iReq = col('requests');
    if (iDate < 0) continue;
    for (const r of rows.slice(1)) {
      const k = r.join('|');
      if (seen.has(k)) continue; seen.add(k);
      const t = parseTs(r[iDate]);
      if (!Number.isFinite(t)) continue;
      const num = (i) => (i >= 0 ? Number(String(r[i]).replace(/[$,\s]/g, '')) || 0 : 0);
      const kind = iKind >= 0 ? r[iKind] : '';
      if (/errored|no charge/i.test(kind) && !num(iOut)) continue;
      const costRaw = iCost >= 0 ? String(r[iCost]) : '';
      const billed = /included|-/i.test(costRaw) && !/\d/.test(costRaw) ? 0 : num(iCost);
      const model = normCursorModel(iModel >= 0 ? r[iModel] : '') || 'cursor-auto';
      const day = new Date(t); const dayKey = `csv-${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
      out.events.push([t, model, num(iIn), num(iCW), 0, num(iCR), num(iOut), 0, billed, 0, null, dayKey, Math.max(1, num(iReq) || 1)]);
      if (!days.has(dayKey)) days.set(dayKey, { id: dayKey, cwd: null, title: `Cursor dashboard · ${day.toISOString().slice(0, 10)}`, userMsgs: 0, tools: {}, ts: [], csv: true });
      days.get(dayKey).ts.push(t);
    }
  }
  out.sessions = [...days.values()];
  return out;
}

// ───────────────────────────── scanning ─────────────────────────────
let fileCache = new Map(); // path → { m, s, r }
function loadCache() {
  if (flag('rescan')) return;
  const c0 = readJSON(CACHE_FILE, null);
  if (c0?.v === CACHE_VERSION) fileCache = new Map(Object.entries(c0.files));
}
async function saveCache() {
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.writeFile(CACHE_FILE, JSON.stringify({ v: CACHE_VERSION, files: Object.fromEntries(fileCache) }));
  } catch {}
}

async function parseCached(file, parser, seenPaths) {
  seenPaths.add(file);
  let st; try { st = await fsp.stat(file); } catch { return null; }
  const hit = fileCache.get(file);
  if (hit && hit.m === st.mtimeMs && hit.s === st.size) return hit.r;
  try {
    const r = await parser(file);
    fileCache.set(file, { m: st.mtimeMs, s: st.size, r });
    return r;
  } catch (e) { return { error: e.message }; }
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

let scanning = null;
async function scan() {
  if (scanning) return scanning;
  scanning = (async () => {
    const t0 = Date.now();
    const disc = discover();
    const sources = [], warnings = [], results = [];
    const seenPaths = new Set();
    let latestRate = null, cursorPlan = null, cursorTokens = false;

    for (const src of disc.claude) {
      const dir = path.join(src.root, 'projects');
      if (!isDir(dir)) continue;
      const files = await walk(dir, '.jsonl');
      const rs = await pool(files, 8, (f) => parseCached(f, parseClaudeFile, seenPaths));
      rs.forEach((r) => r && !r.error && results.push(r));
      sources.push({ tool: 'claude', path: dir, label: src.label, files: files.length });
    }
    for (const src of disc.codex) {
      for (const sub of ['sessions', 'archived_sessions']) {
        const dir = path.join(src.root, sub);
        if (!isDir(dir)) continue;
        const files = await walk(dir, '.jsonl');
        const rs = await pool(files, 8, (f) => parseCached(f, parseCodexFile, seenPaths));
        for (const r of rs) {
          if (!r || r.error) continue;
          results.push(r);
          if (r.rate && (!latestRate || r.rate.ts > latestRate.ts)) latestRate = r.rate;
        }
        sources.push({ tool: 'codex', path: dir, label: src.label, files: files.length });
      }
    }
    // Cursor (not cached by mtime: the DB changes constantly and is read in one pass)
    try {
      const cur = await parseCursor(disc.cursor);
      warnings.push(...(cur.warnings || []));
      if (!cur.missing) { results.push(cur); cursorPlan = cur.plan || null; cursorTokens = cur.events.some((e) => e[2] || e[6]); sources.push({ tool: 'cursor', path: disc.cursor, label: 'local', files: cur.files, sessions: cur.sessions.length }); }
    } catch (e) { warnings.push(`Cursor: ${e.message}`); }
    const csv = parseCursorCSVs();
    if (csv.files) { results.push(csv); sources.push({ tool: 'cursor', path: IMPORT_DIR, label: 'csv import', files: csv.files, events: csv.events.length }); }

    for (const k of fileCache.keys()) if (!seenPaths.has(k)) fileCache.delete(k);
    saveCache();

    const data = build(results);
    data.meta = {
      version: VERSION, generatedAt: Date.now(), scanMs: Date.now() - t0, host: os.hostname(), platform: process.platform, node: process.version,
      sources, warnings, codexRateLimits: latestRate, idleGapMinutes: IDLE_GAP / 60000,
      cursorPlan, cursorHasTokens: csv.events.length > 0,
      missing: TOOLS.filter((t) => !sources.some((s) => s.tool === t && s.files > 0)),
    };
    scanning = null;
    return data;
  })();
  try { return await scanning; } finally { scanning = null; }
}

// Aggregate: rows keyed by (tool, session, model, hour)
function build(results) {
  const projects = [], projIdx = new Map();
  const models = [], modelIdx = new Map();
  const sessions = [], sessIdx = new Map();
  const rowMap = new Map(), actMap = new Map();
  const seenClaude = new Set();
  const HOUR = 3_600_000;

  const proj = (cwd) => {
    const key = cwd ? String(cwd).toLowerCase() : '(unknown)';
    if (!projIdx.has(key)) { projIdx.set(key, projects.length); projects.push({ name: cwd ? projectName(cwd) : '(inconnu)', path: cwd || null }); }
    return projIdx.get(key);
  };
  const mdl = (m) => { if (!modelIdx.has(m)) { modelIdx.set(m, models.length); models.push(m); } return modelIdx.get(m); };

  // CSV import is authoritative for Cursor tokens/cost within its date range
  let csvMin = Infinity, csvMax = -Infinity;
  for (const r of results) if (r.csv) for (const e of r.events) { csvMin = Math.min(csvMin, e[0]); csvMax = Math.max(csvMax, e[0] + 86_400_000); }

  // sort so that the earliest file wins on Claude duplicates (resumed sessions copy history)
  results.sort((a, b) => (a.sessions[0]?.ts?.[0] || 0) - (b.sessions[0]?.ts?.[0] || 0));

  for (const r of results) {
    const tIdx = TOOLS.indexOf(r.tool);
    for (const s of r.sessions) {
      const key = `${r.tool}:${s.id}`;
      let si = sessIdx.get(key);
      if (si == null) {
        si = sessions.length; sessIdx.set(key, si);
        sessions.push({ tool: tIdx, id: s.id, p: proj(s.cwd), title: s.title || null, branch: s.branch || null, version: s.version || null,
          userMsgs: 0, req: 0, tools: {}, lines: s.lines || null, csv: !!s.csv, _ts: [] });
      }
      const S = sessions[si];
      if (!S.title && s.title) S.title = s.title;
      if (S.p === projIdx.get('(unknown)') && s.cwd) S.p = proj(s.cwd);
      S.userMsgs += s.userMsgs || 0;
      for (const [k, v] of Object.entries(s.tools || {})) S.tools[k] = (S.tools[k] || 0) + v;
      for (const t of s.ts) S._ts.push(t);
    }
    for (const e of r.events) {
      const [t, model, inp, cw5, cw1h, cr, out, ws, cost, rs, dk, sid, nReq] = e;
      if (dk && dk !== ':') { if (seenClaude.has(dk)) continue; seenClaude.add(dk); }
      const si = sessIdx.get(`${r.tool}:${sid}`);
      if (si == null) continue;
      const zero = r.tool === 'cursor' && !r.csv && t >= csvMin && t <= csvMax;
      const hour = Math.floor(t / HOUR) * HOUR;
      const mi = mdl(model);
      const k = `${tIdx}|${si}|${mi}|${hour}`;
      let row = rowMap.get(k);
      if (!row) { row = [tIdx, si, mi, hour, 0, 0, 0, 0, 0, 0, 0, 0, null]; rowMap.set(k, row); }
      row[4] += nReq ?? 1;
      if (!zero) { row[5] += inp; row[6] += cw5; row[7] += cw1h; row[8] += cr; row[9] += out; row[10] += rs || 0; row[11] += ws || 0; }
      if (cost != null) row[12] = (row[12] || 0) + cost;
      sessions[si].req += nReq ?? 1;
    }
  }

  // Sessions: bounds + active time (gaps ≤ idle threshold), attributed per hour
  for (let si = 0; si < sessions.length; si++) {
    const S = sessions[si];
    const ts = S._ts.filter(Number.isFinite).sort((a, b) => a - b);
    delete S._ts;
    S.start = ts[0] ?? null; S.end = ts[ts.length - 1] ?? null; S.active = 0;
    for (let i = 1; i < ts.length; i++) {
      const gap = ts[i] - ts[i - 1];
      if (gap <= 0 || gap > IDLE_GAP) continue;
      S.active += gap;
      const hour = Math.floor(ts[i - 1] / HOUR) * HOUR;
      const k = `${si}|${hour}`;
      actMap.set(k, (actMap.get(k) || 0) + gap);
    }
    S.models = [];
  }
  const rows = [...rowMap.values()];
  for (const r of rows) { const S = sessions[r[1]]; if (!S.models.includes(r[2])) S.models.push(r[2]); }
  const activity = [...actMap.entries()].map(([k, ms]) => { const [si, h] = k.split('|').map(Number); return [sessions[si].tool, si, h, Math.round(ms)]; });
  return { tools: TOOLS, projects, models, sessions, rows, activity };
}

// ───────────────────────────── server ───────────────────────────────
function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req, limit = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c0) => { n += c0.length; if (n > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c0); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

let lastData = null;
async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  // Only same-origin browser calls: block cross-site POSTs (DNS rebinding / CSRF)
  const host = (req.headers.host || '').split(':')[0];
  if (!['127.0.0.1', 'localhost'].includes(host)) return send(res, 403, { error: 'forbidden host' });
  if (req.method !== 'GET' && req.headers.origin && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.origin)) return send(res, 403, { error: 'forbidden origin' });

  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return send(res, 200, await fsp.readFile(PUBLIC_FILE), 'text/html; charset=utf-8');
    }
    if (url.pathname === '/app.js') {
      return send(res, 200, await fsp.readFile(path.join(__dirname, 'public', 'app.js')), 'text/javascript; charset=utf-8');
    }
    if (url.pathname === '/api/data') {
      if (!lastData || url.searchParams.has('refresh')) lastData = await scan();
      return send(res, 200, lastData);
    }
    if (url.pathname === '/api/settings') {
      if (req.method === 'GET') return send(res, 200, readJSON(SETTINGS_FILE, {}));
      if (req.method === 'PUT' || req.method === 'POST') {
        const body = JSON.parse((await readBody(req, 1024 * 1024)).toString('utf8') || '{}');
        await fsp.mkdir(DATA_DIR, { recursive: true });
        await fsp.writeFile(SETTINGS_FILE, JSON.stringify(body, null, 2));
        return send(res, 200, { ok: true });
      }
    }
    if (url.pathname === '/api/import/cursor' && req.method === 'POST') {
      const name = (url.searchParams.get('name') || `cursor-${Date.now()}.csv`).replace(/[^\w.-]+/g, '_');
      if (!name.toLowerCase().endsWith('.csv')) return send(res, 400, { error: 'CSV attendu' });
      const buf = await readBody(req);
      await fsp.mkdir(IMPORT_DIR, { recursive: true });
      await fsp.writeFile(path.join(IMPORT_DIR, name), buf);
      lastData = await scan();
      return send(res, 200, { ok: true, file: name });
    }
    if (url.pathname === '/api/import/cursor' && req.method === 'DELETE') {
      try { for (const f of fs.readdirSync(IMPORT_DIR)) fs.unlinkSync(path.join(IMPORT_DIR, f)); } catch {}
      lastData = await scan();
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message });
  }
}

function openBrowser(u) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', u]] : process.platform === 'darwin' ? ['open', [u]] : ['xdg-open', [u]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true, windowsHide: true }).unref(); } catch {}
}

function listen(port, tries = 20) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(handler);
    srv.once('error', (e) => { if (e.code === 'EADDRINUSE' && tries > 0) resolve(listen(port + 1, tries - 1)); else reject(e); });
    srv.listen(port, '127.0.0.1', () => resolve({ srv, port }));
  });
}

// ─────────────────────────────── main ───────────────────────────────
loadCache();
if (flag('json')) {
  const data = await scan();
  const out = opt('json', 'ai-usage.json');
  fs.writeFileSync(out, JSON.stringify(data));
  console.error(`wrote ${out}: ${data.rows.length} rows, ${data.sessions.length} sessions, ${data.meta.scanMs}ms`);
  process.exit(0);
}

console.log(c.bold(`\n  ai-usage v${VERSION}`) + c.dim('  — Claude Code · Codex · Cursor'));
process.stdout.write(c.dim('  scanning… '));
lastData = await scan();
const m = lastData.meta;
console.log(c.green('done') + c.dim(` in ${m.scanMs}ms`));
for (const s of m.sources) console.log(`  ${c.cyan(s.tool.padEnd(7))} ${String(s.files).padStart(5)} files  ${c.dim(s.path)}`);
for (const t of m.missing) console.log(`  ${c.yellow(t.padEnd(7))}     – ${c.dim('aucune donnée trouvée')}`);
for (const w of m.warnings) console.log(`  ${c.yellow('!')} ${w}`);

const { port } = await listen(Number(opt('port', 4321)));
const u = `http://127.0.0.1:${port}`;
console.log(`\n  ${c.bold('→')} ${c.cyan(u)}   ${c.dim('(Ctrl+C pour quitter)')}\n`);
if (!flag('no-open')) openBrowser(u);
