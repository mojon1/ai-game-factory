// AIがゲームを1手ずつプレイするための CLI（時間停止＋リプレイ方式）
//
//   node tools/play.mjs init <id> [--device mobile]  … プレイ開始（step-00.jpg に最初の画面）
//                                                     PC: 640×400 キーボード＋マウス（ai-play/）
//                                                     mobile: 360×640 縦画面・タッチのみ（ai-play-mobile/）
//   node tools/play.mjs step <id> '<操作JSON>' --note "見えたこと／狙い" --note-en "English note" [--device mobile]
//                                                     … 操作を追加し、結果画面を step-NN.jpg に保存
//   node tools/play.mjs undo <id> [--device mobile]  … 最後の1手を取り消す
//   node tools/play.mjs log <id> [--device mobile]   … これまでのプレイログを表示
//
// 操作JSONの例:
//   {"keys":["Space"],"hold":100}                    Space を 100ms 押す（その後 150ms 経過）
//   {"keys":["ArrowLeft"],"hold":600,"wait":0}       ← を 600ms 押し続ける
//   {"tap":[0.5,0.8],"hold":120}                     画面の (横50%, 縦80%) をクリック/タップ（長押しは hold を長く）
//   {"swipe":[0.5,0.7,0.8,0.7],"hold":200}           (50%,70%) から (80%,70%) へ 200ms でドラッグ/スワイプ
//   {"wait":1000}                                    何もせず 1 秒待つ
//   [ {...}, {...} ]                                 1ターン内で複数の操作を順に実行
//
// ゲーム内時間は操作中しか進まないので、AIは考える時間を気にせずプレイできる。
// スマホモードではキー入力は無効（タッチだけで遊べるかを確かめるため）。
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
const device = args.device === 'mobile' ? 'mobile' : 'pc';
const dirName = device === 'mobile' ? 'ai-play-mobile' : 'ai-play';
const dir = path.join(gameDir(id), dirName);
const sessionFile = path.join(dir, 'session.json');
const pad = (n) => String(n).padStart(2, '0');

async function render(session) {
  const s = await openSession(id, { seed: session.seed, device: session.device || 'pc' });
  try {
    for (const st of session.steps) await s.act(st.action);
    const n = session.steps.length;
    const file = path.join(dir, `step-${pad(n)}.jpg`);
    await s.screenshot(file);
    const info = await s.inspect();
    return { file, info, errors: [...new Set(s.errors)], warnings: [...new Set(s.warnings)], frozen: s.frozen };
  } finally { await s.close(); }
}

function report(session, r) {
  const n = session.steps.length;
  console.log(`[step ${n}] 画面: ${path.relative(process.cwd(), r.file)}`);
  if (n) console.log(`  操作: ${describeAction(session.steps[n - 1].action)}`);
  console.log(`  端末: ${session.device === 'mobile' ? 'スマホ(タッチ)' : 'PC'}  時間停止モード: ${r.frozen ? 'ON' : 'OFF(リアルタイム)'}  canvas: ${r.info.canvases}  色数: ${r.info.canvasVariety ?? '-'}`);
  if (r.info.text) console.log(`  画面テキスト: ${r.info.text}`);
  if (r.warnings.length) console.log(`  注意: ${r.warnings.join(' / ')}`);
  if (r.errors.length) console.log(`  ⚠ エラー:\n   - ${r.errors.join('\n   - ')}`);
  console.log('  → 画像を見て次の操作を決めてください。');
}

if (cmd === 'init') {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const session = { device, seed: Number(args.seed) || 20261007, startedAt: new Date().toISOString(), steps: [] };
  const r = await render(session);
  session.initialErrors = r.errors;
  writeJson(sessionFile, session);
  report(session, r);
} else if (cmd === 'step') {
  const session = readJson(sessionFile);
  if (!session) throw new Error('先に init を実行してください');
  let action;
  try { action = JSON.parse(actionArg); } catch { throw new Error('操作JSONが不正です: ' + actionArg); }
  const entry = { step: session.steps.length + 1, action, desc: describeAction(action), note: typeof args.note === 'string' ? args.note : '', noteEn: typeof args['note-en'] === 'string' ? args['note-en'] : '' };
  session.steps.push(entry);
  const r = await render(session);
  entry.image = `${dirName}/step-${pad(entry.step)}.jpg`;
  entry.errors = r.errors;
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
