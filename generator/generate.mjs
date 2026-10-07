// API経由のAI（Gemini / GPT / ローカルLLM など）でゲームを全自動制作する
// リポジトリを直接操作できるAI（Claude Code、ChatGPT / Codex）は factory/DAILY_TASK.md の手順で参加する。
// こちらは「APIしか使えないAI」用で、同じ憲章・仕様・テスト・自己プレイ・類似作品リサーチ・自己判定を自動で行う。
//
//   node generator/generate.mjs --provider gemini-flash [--count 1]
//   node generator/generate.mjs                 … 有効でキーのある全プロバイダで gamesPerRun 本ずつ
//   node generator/generate.mjs --provider mock … パイプライン確認（APIは呼ばない）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, gameDir, readMeta, writeMeta, writeJson, parseArgs, jstNow } from '../tools/lib.mjs';
import { validateGame } from '../tools/validate.mjs';
import { openSession, describeAction } from '../tools/play-engine.mjs';
import { createProvider } from './providers.mjs';

const args = parseArgs();
const config = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CHARTER = read('factory/CHARTER.md');
const SPEC = read('factory/GAME_SPEC.md');
const SHELF = read('lib/catalog.json');
const node = (script, list) => execFileSync(process.execPath, [path.join(ROOT, script), ...list], { cwd: ROOT, encoding: 'utf8', env: process.env }).trim();
const parseJson = (text) => { const m = text.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : text); };
const pad = (n) => String(n).padStart(2, '0');

function pickProviders() {
  if (args.provider) {
    const p = config.providers.find((x) => x.id === args.provider);
    if (!p) throw new Error('不明なプロバイダ: ' + args.provider);
    return [p];
  }
  return config.providers.filter((p) => p.enabled && (p.type === 'mock' || !p.apiKeyEnv || process.env[p.apiKeyEnv]));
}

// ---------- 企画と制作 ----------
function buildPrompt(cfg) {
  const compact = (cfg.maxTokens || 99999) <= 8000;
  const system = [
    'あなたはこの実験に参加するゲーム制作AIです。以下の憲章と仕様を必ず守ってください。',
    '', CHARTER, '', SPEC, '', '## 共有ライブラリ棚（lib/catalog.json）', SHELF, '',
    '## 出力形式（厳守）',
    '1. まず ```json コードブロックで meta: {"title","genre","concept","howToPlay","libraryDecision","i18n":{"en":{"title","concept","howToPlay","libraryDecision"}}}',
    '2. 次に ```html コードブロックでゲーム本体の完全なHTML',
    'それ以外の説明文は不要です。',
    compact ? '\n※ 出力できる長さに上限があります。コードは簡潔に（目安 300 行以内）書き、必ず </html> まで出力しきってください。' : '',
  ].join('\n');
  const recent = node('tools/recent.mjs', ['--limit', '40']);
  const user = `何を作るかはあなたが決めてください。スマホで遊んだ人間が「面白い」と言うゲームを目指してください。仕様の「企画の順番とライブラリの判断」に従い、企画を決めてからライブラリを使うかを判断し、使う場合は面白さの核を変えずにそのライブラリで核をどう強められるかを考え直してください。判断の理由（使う場合は再考で足した・変えたことも）を libraryDecision に書いてください。\n\n過去の作品（似た企画は避ける）:\n${recent}`;
  return { system, user };
}
function parseOutput(text) {
  const json = text.match(/```json\s*([\s\S]*?)```/i);
  let html = text.match(/```html\s*([\s\S]*?)```/i)?.[1];
  if (!html) html = text.match(/<!DOCTYPE html[\s\S]*<\/html>/i)?.[0];
  let meta = {};
  try { meta = JSON.parse(json?.[1] || '{}'); } catch {}
  return { meta, html: html?.trim() };
}
function pickMeta(m) {
  const out = {};
  for (const k of ['title', 'genre', 'concept', 'howToPlay', 'libraryDecision', 'libraryRequest']) if (typeof m[k] === 'string') out[k] = m[k].slice(0, 400);
  const en = m.i18n?.en;
  if (en) out.i18n = { en: Object.fromEntries(['title', 'concept', 'howToPlay', 'libraryDecision'].filter((k) => typeof en[k] === 'string').map((k) => [k, en[k].slice(0, 400)])) };
  return out;
}

// ---------- 自己プレイ ----------
const PLAY_SYSTEM = [
  'あなたは自分が作ったスマホゲームを、初めて遊ぶプレイヤーとして遊びます。ゲーム内の時間は止まっていて、操作を指定するとその操作の間だけ時間が進みます。',
  '毎ターン、現在の画面（スマホ縦画面）が与えられます。画面を見て、次の操作を1つ決めてください。',
  '操作（action）: {"tap":[x,y]} / {"tap":[x,y],"hold":600} / {"swipe":[x1,y1,x2,y2],"hold":200} / {"wait":1000} / それらの配列。座標は画面に対する割合（0〜1）。',
  '返答は JSON のみ: {"observation":"見えたこと","action":<操作>,"note":"狙い（日本語・60字以内）","note_en":"the same in English"}',
].join('\n');

async function selfPlay(provider, id, meta, steps) {
  const dir = path.join(gameDir(id), 'ai-play');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const session = { device: 'android', seed: 20261007, startedAt: new Date().toISOString(), steps: [], mode: 'in-process' };
  const s = await openSession(id, { seed: session.seed, device: 'android' });
  const shot = async (n) => { const f = path.join(dir, `step-${pad(n)}.jpg`); await s.screenshot(f); return fs.readFileSync(f).toString('base64'); };
  try {
    let img = await shot(0);
    const history = [];
    for (let i = 1; i <= steps; i++) {
      const text = `ゲーム: ${meta.title}\n遊び方: ${meta.howToPlay}\nこれまでの手:\n${history.slice(-6).join('\n') || '（まだなし）'}\n\nターン ${i}/${steps}。"action" を必ず含めて JSON で答えてください。`;
      const res = await provider.chat([{ role: 'system', text: PLAY_SYSTEM }, { role: 'user', text, images: [img] }], { json: true, maxTokens: 600, temperature: 0.4 });
      let r;
      try { r = parseJson(res.text); } catch { r = { action: { wait: 500 }, note: '（返答を解釈できなかったため待機）' }; }
      const action = r.action || { wait: 500 };
      await s.act(action);
      img = await shot(i);
      const entry = { step: i, action, desc: describeAction(action), note: String(r.note || r.observation || '').slice(0, 120), noteEn: r.note_en ? String(r.note_en).slice(0, 200) : '', image: `ai-play/step-${pad(i)}.jpg` };
      session.steps.push(entry);
      history.push(`${i}. ${entry.desc} — ${entry.note}`);
      console.log(`  play ${i}/${steps}: ${entry.desc}  ${entry.note}`);
    }
  } finally { await s.close(); }
  session.errors = [...new Set(s.errors)];
  writeJson(path.join(dir, 'session.json'), session);
  return session;
}

// ---------- 類似作品リサーチと自己判定 ----------
async function researchSimilar(provider, cfg, meta) {
  const search = cfg.type === 'gemini' && cfg.search !== false;
  const prompt = [
    '次のスマホゲームに似ている既存の作品・ルーツになった作品を調べてください。',
    `タイトル: ${meta.title}（${meta.genre}）`, `企画意図: ${meta.concept}`, `遊び方: ${meta.howToPlay}`, '',
    search ? 'Google 検索で 2〜4 回調べ、実在が確認できた作品だけを挙げてください。' : 'あなたの知識の範囲で、確実に実在する有名作品だけを挙げてください。URL は書かないでください。',
    '最大4件。返答は JSON のみ: {"similar":[{"title":"作品名","url":"https://...(確認できた場合のみ)","similarity":"高|中|低","note":"似ている点と違う点","note_en":"English"}],"research":"どう調べたか","research_en":"English"}',
  ].join('\n');
  try {
    const res = await provider.chat([{ role: 'user', text: prompt }], { search, json: !search, maxTokens: 1500, temperature: 0.2 });
    const r = parseJson(res.text);
    const similar = (r.similar || []).slice(0, 4).map((x) => ({ title: x.title, url: search ? x.url : undefined, similarity: x.similarity, note: x.note, note_en: x.note_en }))
      .filter((x) => x.title && ['高', '中', '低', 'high', 'medium', 'low'].includes(x.similarity));
    return { similar, research: `${search ? 'Google検索' : 'AIの知識のみ（ウェブ検索なし）'}: ${r.research || ''}`.slice(0, 300), researchEn: `${search ? 'Google Search' : 'AI knowledge only (no web search)'}: ${r.research_en || ''}`.slice(0, 400) };
  } catch (e) {
    return { similar: [], research: `類似作品の調査に失敗しました（${e.message.slice(0, 80)}）`, researchEn: `Research failed (${e.message.slice(0, 80)})` };
  }
}

const REVIEW_SYSTEM = [
  'あなたは今プレイしたスマホゲームを判定します。作者としてではなく、初めて遊んだ人間のつもりで正直に判定してください。',
  '返答は JSON のみ: {"verdict":"fun|meh|boring","works":"ok|buggy|broken","comment":"感想（日本語・60〜160字、実際のプレイを根拠に）","comment_en":"the same in English","thumb":サムネに最適なステップ番号}',
  'verdict: fun=面白い / meh=まあまあ / boring=つまらない。works: ok=問題なく動いた / buggy=不具合はあるが遊べた / broken=遊べなかった。',
].join('\n');

async function selfReview(provider, id, meta, session, test) {
  const n = session?.steps.length || 0;
  const pick = n ? [...new Set([1, Math.ceil(n / 2), n])] : [];
  const images = provider.vision ? pick.map((k) => fs.readFileSync(path.join(gameDir(id), 'ai-play', `step-${pad(k)}.jpg`)).toString('base64')) : [];
  const log = (session?.steps || []).map((x) => `${x.step}. ${x.desc} — ${x.note}`).join('\n') || '（プレイなし）';
  const text = `ゲーム: ${meta.title}\n企画意図: ${meta.concept}\n\nプレイログ:\n${log}\n\n自動テスト: ${test.passed ? '合格' : '不合格'}\nプレイ中のエラー: ${(session?.errors || []).join(' / ') || 'なし'}${images.length ? `\n\n添付画像はステップ ${pick.join(', ')} の画面です。` : ''}`;
  const res = await provider.chat([{ role: 'system', text: REVIEW_SYSTEM }, { role: 'user', text, images }], { json: true, maxTokens: 1000, temperature: 0.3 });
  const r = parseJson(res.text);
  const oneOf = (v, list, d) => (list.includes(v) ? v : d);
  return {
    verdict: oneOf(r.verdict, ['fun', 'meh', 'boring'], 'meh'), works: oneOf(r.works, ['ok', 'buggy', 'broken'], 'ok'),
    comment: String(r.comment || '').padEnd(10, '。'), commentEn: String(r.comment_en || r.comment || '').padEnd(10, '.'),
    thumb: Math.max(1, Math.min(n || 1, Math.round(+r.thumb) || n || 1)),
  };
}

// ---------- 1本分 ----------
async function makeGame(cfg) {
  const provider = createProvider(cfg);
  const usage = { input: 0, output: 0, thinking: 0, calls: 0 };
  const chat = provider.chat.bind(provider);
  provider.chat = async (msgs, opts = {}) => {
    const r = await chat(msgs, opts);
    usage.input += r.usage?.input || 0; usage.output += r.usage?.output || 0; usage.thinking += r.usage?.thinking || 0; usage.calls++;
    return r;
  };
  const t0 = new Date();
  console.log(`\n▶ ${cfg.label}（${cfg.model}）`);
  const id = node('tools/new-game.mjs', ['--maker', cfg.maker || cfg.id, '--model', cfg.model, '--name', cfg.label, '--vendor', cfg.vendor, '--via', cfg.via || cfg.id, '--pipeline', `api:${cfg.type}`]);
  try {
    const { system, user } = buildPrompt(cfg);
    const convo = [{ role: 'system', text: system }, { role: 'user', text: user }];
    let parsed, test;
    for (let attempt = 1; attempt <= config.maxFixAttempts; attempt++) {
      const res = await provider.chat(convo, {});
      convo.push({ role: 'assistant', text: res.text });
      const out = parseOutput(res.text);
      parsed = { meta: { ...(parsed?.meta || {}), ...out.meta }, html: out.html || parsed?.html };
      if (parsed.html) { fs.writeFileSync(path.join(gameDir(id), 'index.html'), parsed.html, 'utf8'); test = await validateGame(id); }
      else test = { passed: false, errors: ['HTMLが出力されていない'], checks: [] };
      const meta = readMeta(id);
      Object.assign(meta, pickMeta(parsed.meta));
      meta.generation.validationRuns = attempt;
      meta.autoTest = { passed: test.passed, testedAt: jstNow().iso, version: 3, checks: test.checks, errors: test.errors };
      if (test.code) meta.code = test.code;
      writeMeta(id, meta);
      const ng = [...test.checks.filter((c) => !c.ok).map((c) => c.name), ...test.errors].join(' / ');
      console.log(`  テスト ${attempt}回目: ${test.passed ? '合格' : '不合格 ' + ng.slice(0, 200)}`);
      if (test.passed) break;
      convo.push({ role: 'user', text: ['自動テストに不合格でした。問題点:', ...test.checks.filter((c) => !c.ok).map((c) => `- ${c.name} ${c.detail || ''}`), ...test.errors.map((e) => `- ${e}`), '', '修正した完全版を同じ出力形式で出力してください。'].join('\n') });
    }
    if (!test.passed) { node('tools/discard.mjs', [id, `自動テスト不合格（${config.maxFixAttempts}回）`]); return null; }

    const meta = readMeta(id);
    const session = provider.vision ? await selfPlay(provider, id, meta, config.playSteps) : null;
    const research = await researchSimilar(provider, cfg, meta);
    const r = await selfReview(provider, id, meta, session, test);
    const list = ['--verdict', r.verdict, '--works', r.works, '--comment', r.comment, '--comment-en', r.commentEn,
      '--similar', JSON.stringify(research.similar), '--research', research.research.padEnd(10, '。'), '--research-en', research.researchEn];
    if (session) list.push('--thumb', String(r.thumb));
    console.log('  ' + node('tools/review.mjs', [id, ...list]));
    // 制作記録（API の応答に含まれるトークン数）
    const done = readMeta(id);
    const to = new Date();
    done.metrics = {
      model: cfg.model, effort: null,
      thinkingTokens: usage.thinking, outputTokens: Math.max(0, usage.output - usage.thinking), contextTokens: usage.input,
      turns: usage.calls, toolCalls: null, webSearches: null,
      minutes: Math.round(((to - t0) / 60000) * 10) / 10, validationRuns: done.generation?.validationRuns ?? null,
      codeKB: done.code ? Math.round((done.code.bytes / 1024) * 10) / 10 : null,
      from: t0.toISOString(), to: to.toISOString(),
      method: 'APIの応答に含まれるトークン数を集計（企画・制作・修正・自己プレイ・リサーチ・判定）',
      methodEn: 'Summed token counts reported by the API (planning, building, fixes, self-play, research, review)',
      recordedAt: jstNow().iso,
    };
    writeMeta(id, done);
    return id;
  } catch (e) {
    node('tools/discard.mjs', [id, `制作中のエラー: ${e.message.slice(0, 200)}`]);
    throw e;
  }
}

// ---------- メイン ----------
const providers = pickProviders();
if (!providers.length) { console.log('利用可能なプロバイダがありません（APIキーの環境変数を確認してください）'); process.exit(0); }
const count = Number(args.count) || config.gamesPerRun;
const made = [];
for (const cfg of providers) {
  for (let i = 0; i < count; i++) {
    try { const id = await makeGame(cfg); if (id) made.push(id); }
    catch (e) { console.error(`✖ ${cfg.id}: ${e.message}`); }
  }
}
console.log(`\n完了: ${made.length} 本公開 ${made.join(', ')}`);
