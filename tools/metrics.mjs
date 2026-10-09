// 制作記録（AIがどれだけ考え・書き・試行錯誤したか）を集計する
// 金額ではなく、AIの世代が変わっても比べられる「作業の中身」を残す。
//
// Claude Code で制作する場合（セッション記録から自動集計）:
//   node tools/metrics.mjs mark          … 1本の企画を考え始める直前に実行（開始時刻を記録）
//   node tools/new-game.mjs …            … 雛形作成時に開始時刻が meta に引き継がれる
//   node tools/metrics.mjs end <id>      … 自己採点の後に実行（開始〜現在を集計して meta.metrics に保存）
//
// 記録する指標:
//   thinkingTokens  … 内部で考えた量（思考トークン）
//   outputTokens    … コードや文章として書いた量（思考を除く出力トークン）
//   contextTokens   … 読み込んだ量（入力＋キャッシュ読み書き）
//   turns           … AIの応答回数（APIの呼び出し回数）
//   toolCalls       … ツールの使用回数（ファイル作成・テスト・プレイ・検索など）
//   minutes         … 制作にかかった実時間
//   effort          … 思考の深さの設定（Claude の effort）
// ※ トークン数はモデルの世代でトークナイザーが変わると厳密には比較できない。
//   手数・時間・やり直し回数は区切り方に左右されない。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, readJson, writeJson, readMeta, writeMeta, parseArgs, jstNow } from './lib.mjs';

export const MARK_FILE = path.join(ROOT, '.metrics-mark.json');

export function transcriptDir(cwd = ROOT) {
  return path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
}
export function latestTranscript(cwd = ROOT) {
  const dir = transcriptDir(cwd);
  if (!fs.existsSync(dir)) return null;
  // 自分のセッションの記録を優先する（同じフォルダで別のセッションが同時に動いていても取り違えない）
  const own = process.env.CLAUDE_CODE_SESSION_ID && path.join(dir, `${process.env.CLAUDE_CODE_SESSION_ID}.jsonl`);
  if (own && fs.existsSync(own)) return own;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(dir, f));
  return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
}

// 期間内の assistant メッセージを集計（1つの応答が複数行に分かれて記録されるので message.id でまとめる）
export function sumTranscript(file, { from, to } = {}) {
  const t0 = from ? Date.parse(from) : -Infinity, t1 = to ? Date.parse(to) : Infinity;
  const msgs = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"assistant"')) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    if (j.type !== 'assistant' || !j.message) continue;
    const t = Date.parse(j.timestamp);
    if (!(t >= t0 && t <= t1)) continue;
    const id = j.message.id || j.uuid;
    const m = msgs.get(id) || { model: j.message.model, usage: null, tools: 0, effort: j.effort, first: t, last: t };
    if (j.message.usage) m.usage = j.message.usage;
    for (const b of j.message.content || []) if (b?.type === 'tool_use' || b?.type === 'server_tool_use') m.tools++;
    m.last = Math.max(m.last, t);
    msgs.set(id, m);
  }
  const out = { models: {}, efforts: {}, turns: 0, toolCalls: 0, thinkingTokens: 0, outputTokens: 0, contextTokens: 0, webSearches: 0, first: null, last: null };
  for (const m of msgs.values()) {
    if (!m.usage || !m.model || m.model === '<synthetic>') continue;
    const u = m.usage;
    const thinking = u.output_tokens_details?.thinking_tokens || 0;
    out.turns++;
    out.toolCalls += m.tools;
    out.thinkingTokens += thinking;
    out.outputTokens += Math.max(0, (u.output_tokens || 0) - thinking);
    out.contextTokens += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    out.webSearches += u.server_tool_use?.web_search_requests || 0;
    out.models[m.model] = (out.models[m.model] || 0) + 1;
    if (m.effort) out.efforts[m.effort] = (out.efforts[m.effort] || 0) + 1;
    out.first = out.first == null ? m.first : Math.min(out.first, m.first);
    out.last = out.last == null ? m.last : Math.max(out.last, m.last);
  }
  return out;
}

const top = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

export function toMetrics(s, { from, to, method, methodEn }) {
  const minutes = Math.round(((Date.parse(to) - Date.parse(from)) / 60000) * 10) / 10;
  return {
    model: top(s.models), effort: top(s.efforts),
    thinkingTokens: s.thinkingTokens, outputTokens: s.outputTokens, contextTokens: s.contextTokens,
    turns: s.turns, toolCalls: s.toolCalls, webSearches: s.webSearches, minutes,
    from, to, method, methodEn, recordedAt: jstNow().iso,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs();
  const [cmd, id] = a._;
  if (cmd === 'mark') {
    const t = latestTranscript();
    writeJson(MARK_FILE, { at: new Date().toISOString(), transcript: t ? path.basename(t) : null });
    console.log('制作開始の時刻を記録しました（このあと企画を考えて new-game.mjs を実行）');
  } else if (cmd === 'end' && id) {
    const meta = readMeta(id);
    const g = meta.generation || {};
    const from = g.metricsFrom || g.startedAt;
    const file = g.transcript ? path.join(transcriptDir(), g.transcript) : latestTranscript();
    const to = new Date().toISOString();
    if (file && fs.existsSync(file) && meta.maker === 'claude') {
      meta.metrics = toMetrics(sumTranscript(file, { from, to }), {
        from, to,
        method: 'Claude Code のセッション記録から集計（企画開始〜自己採点完了）',
        methodEn: 'Summed from the Claude Code session log (from planning to finishing the self-review)',
      });
    } else {
      // セッション記録を読めない環境（ChatGPT / Codex など）では、時間と自己申告の値だけを記録する
      const n = (k) => (a[k] !== undefined && Number.isFinite(+a[k]) ? +a[k] : null);
      meta.metrics = {
        model: meta.credits?.[0]?.model || null, effort: typeof a.effort === 'string' ? a.effort : null,
        thinkingTokens: n('thinking'), outputTokens: n('output'), contextTokens: null,
        turns: n('turns'), toolCalls: n('tools'), webSearches: null,
        minutes: Math.round(((Date.parse(to) - Date.parse(from)) / 60000) * 10) / 10,
        from, to,
        method: 'この環境ではトークン数を自動取得できないため、制作時間（と申告値）のみ記録',
        methodEn: 'Token counts are not available in this environment; only time (and any self-reported values) recorded',
        recordedAt: jstNow().iso,
      };
    }
    meta.metrics.validationRuns = g.validationRuns || null;
    meta.metrics.codeKB = meta.code ? Math.round((meta.code.bytes / 1024) * 10) / 10 : null;
    writeMeta(id, meta);
    const m = meta.metrics;
    console.log(`制作記録を保存しました: ${id}`);
      console.log(`  思考 ${m.thinkingTokens ?? '-'} / 出力 ${m.outputTokens ?? '-'} トークン、応答 ${m.turns ?? '-'} 回、ツール ${m.toolCalls ?? '-'} 回、${m.minutes} 分（effort: ${m.effort ?? '-'}）`);
  } else {
    console.error('使い方は tools/metrics.mjs の先頭コメントを参照');
    process.exit(1);
  }
}
