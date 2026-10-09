// AIがゲームを1手ずつプレイするための CLI（スマホ縦画面・タッチ／時間停止＋リプレイ方式）
//
//   node tools/play.mjs init <id>                    … プレイ開始（step-00.jpg に最初の画面）
//   node tools/play.mjs step <id> '<操作JSON>' --note "見えたこと／狙い" --note-en "English"
//                                                     … 操作を追加し、結果画面を step-NN.jpg に保存
//   node tools/play.mjs undo <id>                    … 最後の1手を取り消す
//   node tools/play.mjs log <id>                     … これまでのプレイログを表示
//
// 操作JSONの例（座標は画面に対する割合 0〜1）:
//   {"tap":[0.5,0.8]}                                (横50%, 縦80%) をタップ
//   {"tap":[0.5,0.8],"hold":600}                     600ms 長押し
//   {"swipe":[0.5,0.7,0.8,0.7],"hold":200}           (50%,70%) から (80%,70%) へ 200ms でスワイプ
//   {"path":[[0.2,0.5],[0.5,0.3],[0.8,0.5]],"hold":600}  点をつないだ道筋を 600ms かけてなぞる（曲線・円・図形を描く、ドラッグして運ぶ など）
//   {"multi":[[[0.3,0.5]],[[0.7,0.5],[0.7,0.2]]],"hold":500}  複数の指（最大3本）を同時に。指ごとに道筋（1点なら押したまま）
//   {"wait":1000}                                    何もせず 1 秒待つ
//   [ {...}, {...} ]                                 1ターン内で複数の操作を順に実行
//
// ゲーム内時間は操作中しか進まないので、AIは考える時間を気にせずプレイできる。
// 画面は Android 相当（360×640）。--device iphone で iPhone 相当（375×667, WebKit）も試せる。
import fs from 'node:fs';
import path from 'node:path';
import { gameDir, readJson, writeJson, parseArgs } from './lib.mjs';
import { openSession, describeAction } from './play-engine.mjs';

const args = parseArgs();
const [cmd, id, actionArg] = args._;
if (!cmd || !id) {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(1);
}
const dir = path.join(gameDir(id), 'ai-play');
const sessionFile = path.join(dir, 'session.json');
const pad = (n) => String(n).padStart(2, '0');

async function render(session) {
  const s = await openSession(id, { seed: session.seed, device: session.device });
  try {
    for (const st of session.steps) await s.act(st.action);
    const n = session.steps.length;
    const file = path.join(dir, `step-${pad(n)}.jpg`);
    await s.screenshot(file);
    const info = await s.inspect();
    return { file, info, errors: [...new Set(s.errors)], signals: s.signals, frozen: s.frozen };
  } finally { await s.close(); }
}

function report(session, r) {
  const n = session.steps.length;
  console.log(`[step ${n}] 画面: ${path.relative(process.cwd(), r.file)}`);
  if (n) console.log(`  操作: ${describeAction(session.steps[n - 1].action)}`);
  console.log(`  端末: ${session.device}  時間停止: ${r.frozen ? 'ON' : 'OFF'}  合図: ${r.signals.map((s) => s.agf + (s.score != null ? `(${s.score})` : '')).join(', ') || 'なし'}`);
  if (r.info.text) console.log(`  画面テキスト: ${r.info.text}`);
  if (r.errors.length) console.log(`  ⚠ エラー:\n   - ${r.errors.join('\n   - ')}`);
  console.log('  → 画像を見て次の操作を決めてください。');
}

if (cmd === 'init') {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const session = { device: args.device === 'iphone' ? 'iphone' : 'android', seed: Number(args.seed) || 20261007, startedAt: new Date().toISOString(), steps: [] };
  const r = await render(session);
  session.initialErrors = r.errors;
  writeJson(sessionFile, session);
  report(session, r);
} else if (cmd === 'step') {
  const session = readJson(sessionFile);
  if (!session) throw new Error('先に init を実行してください');
  let action;
  try { action = JSON.parse(actionArg); } catch { throw new Error('操作JSONが不正です: ' + actionArg); }
  const entry = {
    step: session.steps.length + 1, action, desc: describeAction(action),
    note: typeof args.note === 'string' ? args.note : '', noteEn: typeof args['note-en'] === 'string' ? args['note-en'] : '',
  };
  session.steps.push(entry);
  const r = await render(session);
  entry.image = `ai-play/step-${pad(entry.step)}.jpg`;
  entry.errors = r.errors;
  entry.signals = r.signals;
  writeJson(sessionFile, session);
  report(session, r);
} else if (cmd === 'undo') {
  const session = readJson(sessionFile);
  const last = session?.steps.pop();
  if (last) fs.rmSync(path.join(dir, `step-${pad(last.step)}.jpg`), { force: true });
  writeJson(sessionFile, session);
  console.log(last ? `step ${last.step} を取り消しました` : '取り消す手がありません');
} else if (cmd === 'log') {
  const session = readJson(sessionFile);
  for (const s of session?.steps || []) console.log(`#${s.step} ${s.desc}  ${s.note}`);
} else {
  console.error('不明なコマンド: ' + cmd);
  process.exit(1);
}
