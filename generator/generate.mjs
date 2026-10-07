// API経由のAI（GPT / Gemini / ローカルLLM など）でゲームを自動制作する
// Claude Code の日次タスク（factory/DAILY_TASK.md）と同じ仕様・同じテスト・同じ自己プレイ（PC＋スマホ）・
// 類似作品リサーチ・自己採点を行う。
//
//   node generator/generate.mjs --provider github-gpt-4.1 [--count 1]
//   node generator/generate.mjs                … 有効でキーのある全プロバイダで gamesPerRun 本ずつ
//   node generator/generate.mjs --provider mock … パイプライン確認（APIは呼ばない）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, gameDir, readMeta, writeMeta, writeJson, parseArgs, launchBrowser } from '../tools/lib.mjs';
import { makeIdea, recentTitles } from '../tools/ideas.mjs';
import { validateGame } from '../tools/validate.mjs';
import { openSession, describeAction } from '../tools/play-engine.mjs';
import { createProvider } from './providers.mjs';
import { computeCost } from '../tools/cost.mjs';

const args = parseArgs();
const config = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const SPEC = fs.readFileSync(path.join(ROOT, 'factory', 'GAME_SPEC.md'), 'utf8');
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

// ---------- 生成 ----------
function buildPrompt(idea, cfg) {
  const compact = (cfg.maxTokens || 99999) <= 8000;
  const system = [
    'あなたは優秀なブラウザゲーム開発者です。以下の仕様に厳密に従って、遊んで楽しいミニゲームを1本作ってください。',
    'PC（横長・キーボード）とスマホ（縦長・タッチのみ）の両方で快適に遊べることが必須です。',
    '', SPEC, '',
    '## 出力形式（厳守）',
    '1. まず ```json コードブロックで meta（title, genre, tags, description, howToPlay, controls, i18n.en）',
    '   genre は日本語のジャンル名。i18n.en には英語版の title, tags, description, howToPlay, controls を入れる。',
    '2. 次に ```html コードブロックでゲーム本体の完全なHTML',
    'それ以外の説明文は不要です。',
    compact ? '\n※ 出力できる長さに上限があります。コードは簡潔に（目安 300 行以内）書き、必ず </html> まで出力しきってください。' : '',
  ].join('\n');
  const user = [
    `今日のお題: ${idea.text}`,
    '',
    `最近のタイトル（似た内容は避ける）: ${recentTitles().join(' / ') || 'なし'}`,
    '',
    `お題は出発点です。面白くなるなら解釈を広げて構いません（ジャンルは「${idea.genre}」を守る）。`,
  ].join('\n');
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

// ---------- 自己プレイ ----------
const PLAY_SYSTEM = [
  'あなたはブラウザゲームを初めて遊ぶプレイヤーです。ゲーム内の時間は止まっていて、あなたが操作を指定すると、その操作の間だけ時間が進みます。',
  '毎ターン、現在の画面が与えられます。画面をよく見て、次の操作を1つ決めてください。',
  '',
  '操作（action）の書き方:',
  '- {"keys":["Space"],"hold":100}               キーを100ms押す（その後150ms経過）※PCのみ',
  '- {"keys":["ArrowLeft"],"hold":500,"wait":0}  ←を500ms押し続ける ※PCのみ',
  '- {"tap":[0.5,0.8],"hold":120}                画面の(横50%,縦80%)をクリック/タップ',
  '- {"swipe":[0.5,0.7,0.8,0.7],"hold":200}      (50%,70%)から(80%,70%)へドラッグ/スワイプ',
  '- {"wait":1000}                               何もせず1秒待つ',
  '- 上記の配列 [ {...}, {...} ]                 1ターンで複数の操作を順に実行',
  '使えるキー: ArrowLeft ArrowRight ArrowUp ArrowDown Space Enter KeyW KeyA KeyS KeyD',
  '',
  '返答は JSON のみ: {"observation":"画面から読み取れること","action":<操作>,"note":"この操作の狙い（日本語・60字以内）","note_en":"the same in English"}',
].join('\n');

async function selfPlay(provider, id, meta, steps, device) {
  const dirName = device === 'mobile' ? 'ai-play-mobile' : 'ai-play';
  const dir = path.join(gameDir(id), dirName);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const session = { device, seed: 20261007, startedAt: new Date().toISOString(), steps: [], mode: 'in-process' };
  const s = await openSession(id, { seed: session.seed, device });
  const deviceNote = device === 'mobile'
    ? 'あなたはスマホ（360x640 縦画面）で遊んでいます。キーボードは使えません。tap / swipe / wait だけで操作してください。'
    : 'あなたはPC（640x400）で遊んでいます。キーボードとマウスが使えます。';
  const shot = async (n) => { const f = path.join(dir, `step-${pad(n)}.jpg`); await s.screenshot(f); return fs.readFileSync(f).toString('base64'); };
  try {
    let img = await shot(0);
    const history = [];
    for (let i = 1; i <= steps; i++) {
      const text = [
        deviceNote,
        `ゲーム: ${meta.title}`,
        `遊び方: ${meta.howToPlay}`,
        `操作: ${(meta.controls || []).map((c) => `${c.input}=${c.action}`).join(' / ')}`,
        'これまでの手:',
        history.slice(-6).join('\n') || '（まだなし）',
        '',
        `ターン ${i}/${steps}。現在の画面を見て、次の操作を JSON で答えてください。"action" を必ず含めること。`,
      ].join('\n');
      const res = await provider.chat([{ role: 'system', text: PLAY_SYSTEM }, { role: 'user', text, images: [img] }], { json: true, maxTokens: 600, temperature: 0.4 });
      let r;
      try { r = parseJson(res.text); } catch { r = { action: { wait: 500 }, note: '（返答を解釈できなかったため待機）' }; }
      const action = r.action || { wait: 500 };
      await s.act(action);
      img = await shot(i);
      const entry = { step: i, action, desc: describeAction(action), note: String(r.note || r.observation || '').slice(0, 120), noteEn: r.note_en ? String(r.note_en).slice(0, 200) : undefined, image: `${dirName}/step-${pad(i)}.jpg` };
      session.steps.push(entry);
      history.push(`${i}. ${entry.desc} — ${entry.note}`);
      console.log(`  play[${device}] ${i}/${steps}: ${entry.desc}  ${entry.note}`);
    }
  } finally { await s.close(); }
  session.errors = [...new Set(s.errors)];
  writeJson(path.join(dir, 'session.json'), session);
  return session;
}

// ---------- 類似作品リサーチ ----------
// Gemini は Google 検索グラウンディング（無料枠）を使う。他は AI の知識のみ（URL は付けない）。
async function researchSimilar(provider, cfg, meta) {
  const search = cfg.type === 'gemini' && cfg.search !== false;
  const prompt = [
    '次のブラウザゲームに似ている既存の作品・ルーツになった作品を調べてください。',
    `タイトル: ${meta.title}（${meta.genre}）`,
    `説明: ${meta.description}`,
    `遊び方: ${meta.howToPlay}`,
    '',
    search ? 'Google 検索で 2〜4 回調べ、実在が確認できた作品だけを挙げてください。' : 'あなたの知識の範囲で、確実に実在する有名作品だけを挙げてください。URL は書かないでください。',
    '最大4件。返答は JSON のみ:',
    '{"similar":[{"title":"作品名","url":"https://...(確認できた場合のみ)","similarity":"高|中|低","note":"似ている点と違う点（日本語）","note_en":"the same in English"}],"research":"どう調べたか（検索語など）","research_en":"the same in English"}',
  ].join('\n');
  try {
    const res = await provider.chat([{ role: 'user', text: prompt }], { search, json: !search, maxTokens: 1500, temperature: 0.2 });
    const r = parseJson(res.text);
    const similar = (r.similar || []).slice(0, 4)
      .map((x) => ({ title: x.title, url: search ? x.url : undefined, similarity: x.similarity, note: x.note, note_en: x.note_en }))
      .filter((x) => x.title && ['高', '中', '低', 'high', 'medium', 'low'].includes(x.similarity));
    return {
      similar,
      research: `${search ? 'Google検索グラウンディング' : 'AIの知識のみ（ウェブ検索なし）'}: ${r.research || ''}`.slice(0, 300),
      researchEn: `${search ? 'Google Search grounding' : 'AI knowledge only (no web search)'}: ${r.research_en || ''}`.slice(0, 400),
    };
  } catch (e) {
    return { similar: [], research: `類似作品の調査に失敗しました（${e.message.slice(0, 80)}）`, researchEn: `Similar-work research failed (${e.message.slice(0, 80)})` };
  }
}

// ---------- 自己採点 ----------
const REVIEW_SYSTEM = [
  'あなたは今プレイしたブラウザゲームを採点します。作者としてではなく、初めて遊んだプレイヤーとして正直に評価してください。',
  '基準: 3 = 無料のブラウザミニゲームとして平均的。5 はめったに付けない。',
  '独創性は、類似作品の調査結果を踏まえて付ける（類似度「高」があれば 1〜2）。',
  '返答は JSON のみ:',
  '{"playable_pc":0-2,"playable_mobile":0-2（それぞれ 2=問題なく遊べた,1=不具合はあるが遊べた,0=遊べなかった）,',
  ' "fun":1-5,"quality":1-5,"originality":1-5,',
  ' "comment":"総評（日本語・80〜200字、実際のプレイ体験を根拠に）","good":"良かった点","bad":"気になった点",',
  ' "comment_en":"the review in English","good_en":"...","bad_en":"...","thumb":サムネに最適なPCのステップ番号}',
].join('\n');

async function selfReview(provider, id, meta, pc, mobile, html, test, research) {
  const n = pc?.steps.length || 0;
  const pickSteps = n ? [...new Set([1, Math.ceil(n / 3), Math.ceil((2 * n) / 3), n])] : [];
  const images = [];
  if (provider.vision) {
    for (const k of pickSteps) images.push(fs.readFileSync(path.join(gameDir(id), 'ai-play', `step-${pad(k)}.jpg`)).toString('base64'));
    if (mobile?.steps.length) images.push(fs.readFileSync(path.join(gameDir(id), 'ai-play-mobile', `step-${pad(mobile.steps.length)}.jpg`)).toString('base64'));
  }
  const log = (s) => (s?.steps || []).map((x) => `${x.step}. ${x.desc} — ${x.note}`).join('\n') || '（プレイなし）';
  const text = [
    `ゲーム: ${meta.title}（${meta.genre}）`,
    `説明: ${meta.description}`,
    '', 'PCでのプレイログ:', log(pc),
    '', 'スマホでのプレイログ:', log(mobile),
    '', '類似作品の調査結果:', JSON.stringify(research.similar),
    '',
    images.length ? `添付画像は PC のステップ ${pickSteps.join(', ')} の画面${mobile?.steps.length ? 'と、スマホの最後の画面' : ''}です。` : `ゲームのコード（抜粋）:\n${html.slice(0, 6000)}`,
    '',
    `自動テスト: ${test.passed ? '合格' : '不合格'}（PC ${test.platforms?.pc ? '○' : '×'} / スマホ ${test.platforms?.mobile ? '○' : '×'}）`,
    `プレイ中のエラー: ${[...(pc?.errors || []), ...(mobile?.errors || [])].join(' / ') || 'なし'}`,
  ].join('\n');
  const res = await provider.chat([{ role: 'system', text: REVIEW_SYSTEM }, { role: 'user', text, images }], { json: true, maxTokens: 1200, temperature: 0.3 });
  const r = parseJson(res.text);
  const clamp = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : d);
  return {
    playablePc: clamp(r.playable_pc ?? r.playable, 0, 2, 1),
    playableMobile: clamp(r.playable_mobile ?? r.playable, 0, 2, 1),
    fun: clamp(r.fun, 1, 5, 3), quality: clamp(r.quality, 1, 5, 3), originality: clamp(r.originality, 1, 5, 3),
    comment: String(r.comment || '').padEnd(10, '。'), good: String(r.good || ''), bad: String(r.bad || ''),
    commentEn: String(r.comment_en || ''), goodEn: String(r.good_en || ''), badEn: String(r.bad_en || ''),
    thumb: clamp(r.thumb, 1, Math.max(1, n), n),
  };
}

// ---------- 1本分の制作 ----------
async function makeGame(cfg) {
  const provider = createProvider(cfg);
  // 生成・修正・自己プレイ・リサーチ・採点のすべての呼び出しのトークンを集計する
  const usage = { input: 0, output: 0, cacheRead: 0, webSearches: 0, calls: 0 };
  const chat = provider.chat.bind(provider);
  provider.chat = async (msgs, opts = {}) => {
    const r = await chat(msgs, opts);
    usage.input += r.usage?.input || 0; usage.output += r.usage?.output || 0; usage.calls++;
    if (opts.search) usage.webSearches++;
    return r;
  };
  provider.usage = usage;
  const idea = makeIdea();
  const t0 = Date.now();
  console.log(`\n▶ ${cfg.label}（${cfg.model}）: ${idea.text}`);
  const id = node('tools/new-game.mjs', ['--model', cfg.model, '--name', cfg.label, '--vendor', cfg.vendor, '--via', cfg.via || cfg.id, '--pipeline', `api:${cfg.type}`, '--prompt', idea.text, '--prompt-en', idea.textEn]);
  try { return await buildGame(cfg, provider, idea, id, t0); }
  catch (e) { node('tools/discard.mjs', [id, `制作中のエラー: ${e.message.slice(0, 200)}`]); throw e; }
}

async function buildGame(cfg, provider, idea, id, t0) {
  const { system, user } = buildPrompt(idea, cfg);
  const convo = [{ role: 'system', text: system }, { role: 'user', text: user }];
  const tokens = { input: 0, output: 0 };
  let parsed, test, modelVersion = cfg.model;

  for (let attempt = 1; attempt <= config.maxFixAttempts; attempt++) {
    const res = await provider.chat(convo, {});
    tokens.input += res.usage?.input || 0; tokens.output += res.usage?.output || 0; modelVersion = res.modelVersion || modelVersion;
    convo.push({ role: 'assistant', text: res.text });
    const out = parseOutput(res.text);
    parsed = { meta: { ...(parsed?.meta || {}), ...out.meta }, html: out.html || parsed?.html };
    if (!parsed.html) test = { passed: false, errors: ['HTMLが出力されていない'], checks: [], platforms: { pc: false, mobile: false } };
    else {
      fs.writeFileSync(path.join(gameDir(id), 'index.html'), parsed.html, 'utf8');
      test = await validateGame(id);
    }
    const meta = readMeta(id);
    Object.assign(meta, pickMeta(parsed.meta));
    meta.generation.validationRuns = attempt;
    meta.autoTest = { passed: test.passed, testedAt: new Date().toISOString(), version: 2, checks: test.checks, errors: test.errors };
    meta.platforms = test.platforms;
    meta.languages = test.checks.find((c) => c.name.startsWith('日本語/英語'))?.ok ? ['ja', 'en'] : ['ja'];
    if (test.code) meta.code = test.code;
    writeMeta(id, meta);
    const ng = [...test.checks.filter((c) => !c.ok).map((c) => c.name), ...test.errors].join(' / ');
    console.log(`  テスト ${attempt}回目: ${test.passed ? '合格' : '不合格 ' + ng.slice(0, 200)}`);
    if (test.passed) break;
    convo.push({ role: 'user', text: ['自動テストに不合格でした。問題点:', ...test.checks.filter((c) => !c.ok).map((c) => `- ${c.name} ${c.detail || ''}`), ...test.errors.map((e) => `- ${e}`), '', '修正した完全版を、同じ出力形式（json と html のコードブロック）で出力してください。'].join('\n') });
  }
  if (!test.passed) { node('tools/discard.mjs', [id, `自動テスト不合格（${config.maxFixAttempts}回）`]); return null; }

  const meta = readMeta(id);
  meta.generation = { ...meta.generation, durationSec: (Date.now() - t0) / 1000, tokens, modelVersion, params: { temperature: cfg.temperature ?? 1, maxTokens: cfg.maxTokens } };
  writeMeta(id, meta);

  const html = fs.readFileSync(path.join(gameDir(id), 'index.html'), 'utf8');
  const pc = provider.vision ? await selfPlay(provider, id, meta, config.playSteps, 'pc') : null;
  const mobile = provider.vision ? await selfPlay(provider, id, meta, config.mobilePlaySteps || 3, 'mobile') : null;
  const research = await researchSimilar(provider, cfg, meta);
  const r = await selfReview(provider, id, meta, pc, mobile, html, test, research);
  const list = ['--playable-pc', r.playablePc, '--playable-mobile', r.playableMobile, '--fun', r.fun, '--quality', r.quality, '--originality', r.originality, '--comment', r.comment].map(String);
  if (r.good) list.push('--good', r.good);
  if (r.bad) list.push('--bad', r.bad);
  if (pc) list.push('--thumb', String(r.thumb));
  list.push('--similar', JSON.stringify(research.similar), '--research', research.research.padEnd(10, '。'), '--research-en', research.researchEn);
  list.push('--comment-en', r.commentEn || r.comment);
  if (r.goodEn) list.push('--good-en', r.goodEn);
  if (r.badEn) list.push('--bad-en', r.badEn);
  // 制作コスト（API定価換算。実際は無料枠/ローカル実行）
  const done = readMeta(id);
  const u = provider.usage;
  done.cost = await computeCost({ [cfg.model]: { input: u.input, output: u.output, calls: u.calls } }, {
    method: `APIの応答に含まれるトークン数を集計（生成・修正・自己プレイ・類似作品リサーチ・採点の ${u.calls} 回の呼び出し）`,
    paid: `${cfg.via || cfg.id}（追加費用なし）`,
  });
  done.cost.methodEn = `Sum of token counts reported by the API (${u.calls} calls: generation, fixes, self-play, similar-work research and review)`;
  done.cost.paidEn = `${cfg.via || cfg.id} (no extra charge)`;
  writeMeta(id, done);
  console.log('  ' + node('tools/review.mjs', [id, ...list]));
  return id;
}
function pickMeta(m) {
  const out = {};
  for (const k of ['title', 'genre', 'description', 'howToPlay']) if (typeof m[k] === 'string') out[k] = m[k].slice(0, 300);
  if (Array.isArray(m.tags)) out.tags = m.tags.slice(0, 5).map(String);
  const ctl = (arr) => arr.slice(0, 8).map((c) => ({ input: String(c.input || ''), action: String(c.action || '') }));
  if (Array.isArray(m.controls)) out.controls = ctl(m.controls);
  const en = m.i18n?.en;
  if (en) {
    out.i18n = { en: {} };
    for (const k of ['title', 'description', 'howToPlay']) if (typeof en[k] === 'string') out.i18n.en[k] = en[k].slice(0, 400);
    if (Array.isArray(en.tags)) out.i18n.en.tags = en.tags.slice(0, 5).map(String);
    if (Array.isArray(en.controls)) out.i18n.en.controls = ctl(en.controls);
  }
  return out;
}

// ---------- メイン ----------
const providers = pickProviders();
if (!providers.length) { console.log('利用可能なプロバイダがありません（APIキーの環境変数を確認してください）'); process.exit(0); }
const count = Number(args.count) || config.gamesPerRun;
const made = [];
const browser = await launchBrowser(); await browser.close(); // 事前にブラウザが起動できるか確認
for (const cfg of providers) {
  for (let i = 0; i < count; i++) {
    try { const id = await makeGame(cfg); if (id) made.push(id); }
    catch (e) { console.error(`✖ ${cfg.id}: ${e.message}`); }
  }
}
node('tools/build-index.mjs', []);
console.log(`\n完了: ${made.length} 本公開 ${made.join(', ')}`);
