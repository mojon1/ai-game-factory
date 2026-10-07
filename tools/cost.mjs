// 制作コスト（使用トークン数と、API定価での金額換算）を記録する
//
// Claude Code で制作する場合（セッション記録から自動集計）:
//   node tools/cost.mjs start <id>     … 制作開始時に実行（開始時刻を記録）
//   node tools/cost.mjs end <id>       … 自己採点の後に実行（開始〜現在のトークンを集計して meta.cost に保存）
//
// 期間を指定して集計（過去の作品の再計算など）:
//   node tools/cost.mjs range <id> --from <ISO時刻> --to <ISO時刻> [--transcript <jsonl>] [--match <文字列>]
//
// API 経由（generator）の場合は computeCost() を直接呼ぶ。
// 金額は「API定価換算」。実際の支払いはサブスクリプション/無料枠のため追加費用は発生しない。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, readJson, readMeta, writeMeta, parseArgs, jstNow } from './lib.mjs';

const PRICING = readJson(path.join(ROOT, 'factory', 'pricing.json'));
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// ---------- 為替レート（制作日のUSD/JPY） ----------
export async function usdJpy() {
  const urls = ['https://api.frankfurter.dev/v1/latest?base=USD&symbols=JPY', 'https://api.frankfurter.app/latest?from=USD&to=JPY'];
  for (const u of urls) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const d = await r.json();
      if (d?.rates?.JPY) return { usdJpy: d.rates.JPY, date: d.date, source: 'Frankfurter（欧州中央銀行の参照レート）' };
    } catch {}
  }
  return { usdJpy: PRICING.fallbackUsdJpy, date: jstNow().date, source: '取得失敗のため既定値' };
}

// ---------- 金額換算 ----------
// usage: { model: { input, output, cacheWrite5m, cacheWrite1h, cacheRead, webSearches } }
export async function computeCost(usageByModel, { method, paid }) {
  const fx = await usdJpy();
  const tokens = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  let usd = 0, webSearches = 0;
  const breakdown = [];
  for (const [model, u] of Object.entries(usageByModel)) {
    const p = PRICING.models[model] || PRICING.models[model.replace(/-\d{8}$/, '')];
    const w5 = u.cacheWrite5m || 0, w1 = u.cacheWrite1h || 0;
    const m = p ? ((u.input || 0) * p.input + (u.output || 0) * p.output
      + w5 * (p.cacheWrite5m ?? p.input * 1.25) + w1 * (p.cacheWrite1h ?? p.input * 2)
      + (u.cacheRead || 0) * (p.cacheRead ?? p.input)) / 1e6 : null;
    const ws = ((u.webSearches || 0) * (PRICING.webSearchPer1k || 0)) / 1000;
    if (m != null) usd += m + ws;
    webSearches += u.webSearches || 0;
    tokens.input += u.input || 0; tokens.output += u.output || 0;
    tokens.cacheWrite += w5 + w1; tokens.cacheRead += u.cacheRead || 0;
    breakdown.push({ model, ...u, usd: m == null ? null : round(m + ws, 4), pricing: p ? { input: p.input, output: p.output, cacheWrite5m: p.cacheWrite5m, cacheWrite1h: p.cacheWrite1h, cacheRead: p.cacheRead, asOf: p.asOf, source: p.source } : null });
  }
  tokens.total = tokens.input + tokens.output + tokens.cacheWrite + tokens.cacheRead;
  return {
    tokens, webSearches,
    usd: round(usd, 4), jpy: Math.round(usd * fx.usdJpy),
    fx, breakdown, method, paid,
    priceUnit: 'USD / 1M tokens（API定価）',
    calculatedAt: jstNow().iso,
  };
}

// ---------- Claude Code のセッション記録 ----------
export function transcriptDir(cwd = ROOT) {
  return path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
}
export function latestTranscript(cwd = ROOT) {
  const dir = transcriptDir(cwd);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(dir, f));
  return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
}
// 期間内の assistant メッセージの usage を集計（同じ message.id は1回だけ数える）
export function sumTranscript(file, { from, to, match } = {}) {
  const t0 = from ? Date.parse(from) : -Infinity, t1 = to ? Date.parse(to) : Infinity;
  const byId = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"usage"')) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    if (j.type !== 'assistant' || !j.message?.usage) continue;
    const t = Date.parse(j.timestamp);
    if (!(t >= t0 && t <= t1)) continue;
    const id = j.message.id || j.uuid;
    const prev = byId.get(id) || { model: j.message.model, usage: j.message.usage, text: '' };
    prev.usage = j.message.usage;
    if (match) prev.text += JSON.stringify(j.message.content || '');
    byId.set(id, prev);
  }
  const out = {};
  let calls = 0;
  for (const { model, usage: u, text } of byId.values()) {
    if (!model || model === '<synthetic>') continue;
    let share = 1;
    if (match) {
      const hits = match.filter((m) => m.ids.some((s) => text.includes(s)));
      const me = hits.find((h) => h.self);
      if (!me) continue;
      share = 1 / hits.length; // 複数の作品をまとめて扱ったメッセージは等分
    }
    calls++;
    const o = (out[model] ||= { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, webSearches: 0, calls: 0 });
    const cc = u.cache_creation || {};
    const w1 = cc.ephemeral_1h_input_tokens ?? 0;
    const w5 = cc.ephemeral_5m_input_tokens ?? Math.max(0, (u.cache_creation_input_tokens || 0) - w1);
    o.input += (u.input_tokens || 0) * share;
    o.output += (u.output_tokens || 0) * share;
    o.cacheWrite5m += w5 * share;
    o.cacheWrite1h += w1 * share;
    o.cacheRead += (u.cache_read_input_tokens || 0) * share;
    o.webSearches += (u.server_tool_use?.web_search_requests || 0) * share;
    o.calls += share;
  }
  for (const o of Object.values(out)) for (const k of Object.keys(o)) o[k] = Math.round(o[k] * 100) / 100;
  return { usage: out, calls };
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs();
  const [cmd, id] = a._;
  if (!cmd || !id) { console.error('使い方は tools/cost.mjs の先頭コメントを参照'); process.exit(1); }
  const meta = readMeta(id);
  meta.generation ||= {};
  if (cmd === 'start') {
    meta.generation.costStartedAt = new Date().toISOString();
    meta.generation.transcript = latestTranscript() ? path.basename(latestTranscript()) : null;
    writeMeta(id, meta);
    console.log(`コスト計測を開始しました: ${id}（${meta.generation.costStartedAt}）`);
  } else if (cmd === 'end' || cmd === 'range') {
    const file = typeof a.transcript === 'string' ? a.transcript
      : meta.generation.transcript ? path.join(transcriptDir(), meta.generation.transcript) : latestTranscript();
    if (!file || !fs.existsSync(file)) { console.error('セッション記録が見つかりません'); process.exit(1); }
    const from = cmd === 'range' ? a.from : meta.generation.costStartedAt;
    const to = cmd === 'range' ? a.to : new Date().toISOString();
    if (!from) { console.error('開始時刻がありません（先に cost.mjs start を実行）'); process.exit(1); }
    let match;
    if (typeof a.match === 'string') match = JSON.parse(a.match); // [{ids:[...], self:true}, {ids:[...]}]
    const { usage, calls } = sumTranscript(file, { from, to, match });
    const method = cmd === 'range'
      ? (typeof a.method === 'string' ? a.method : `Claude Code のセッション記録から集計（${from}〜${to}）`)
      : `Claude Code のセッション記録から集計（制作開始〜自己採点完了、API呼び出し ${calls} 回）`;
    meta.cost = await computeCost(usage, { method, paid: 'Claude サブスクリプション内（追加費用なし）' });
    writeMeta(id, meta);
    const c = meta.cost;
    console.log(`制作コストを記録しました: ${id}`);
    console.log(`  トークン: 入力 ${c.tokens.input.toLocaleString()} / 出力 ${c.tokens.output.toLocaleString()} / キャッシュ書込 ${c.tokens.cacheWrite.toLocaleString()} / キャッシュ読込 ${c.tokens.cacheRead.toLocaleString()}`);
    console.log(`  API定価換算: $${c.usd.toFixed(2)} ≒ ¥${c.jpy.toLocaleString()}（1ドル=${c.fx.usdJpy}円 ${c.fx.date}）`);
  } else {
    console.error('不明なコマンド: ' + cmd); process.exit(1);
  }
}
