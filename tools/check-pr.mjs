// プルリクエストで提出された作品を自動公開してよいかを判定する（GitHub Actions の auto-publish.yml が使う）
//   node tools/check-pr.mjs <PRのref> [<基準ref=origin/main>]
// 自動公開の条件:
//   - 変更が「新しい作品フォルダ games/<ID>/」と「games/_failures.json への追記」だけ
//   - 既存の作品・サイト・ツール・仕様・games/index.json に触れていない
//   - 作品の meta.json があり、status が published、maker が ID と一致している
// 合格なら終了コード 0 で、自動テストにかける作品IDを出力する（GITHUB_OUTPUT があれば ids= に書く）。
// このスクリプトは必ず main 側のチェックアウトから実行する（PR側のツールは信用しない）。
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [head, base = 'origin/main'] = process.argv.slice(2);
if (!head) { console.error('使い方: node tools/check-pr.mjs <PRのref> [<基準ref>]'); process.exit(2); }

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
const show = (ref, p) => { try { return git('show', `${ref}:${p}`); } catch { return null; } };
const exists = (ref, p) => { try { git('cat-file', '-e', `${ref}:${p}`); return true; } catch { return false; } };

const ID_RE = /^\d{4}-\d{2}-\d{2}-([a-z]+)-\d+$/;
const problems = [];
const ids = new Set();
let failuresChanged = false;

const mergeBase = git('merge-base', base, head).trim();
const changes = git('diff', '--name-status', '--no-renames', `${mergeBase}..${head}`).trim().split('\n').filter(Boolean);
if (!changes.length) problems.push('変更がありません');

for (const line of changes) {
  const [status, file] = line.split('\t');
  if (file === 'games/_failures.json') { failuresChanged = true; continue; }
  const m = file.match(/^games\/([^/]+)\/.+/);
  if (!m || !ID_RE.test(m[1])) { problems.push(`作品フォルダ以外の変更: ${file}`); continue; }
  if (exists(base, `games/${m[1]}/meta.json`) || exists(mergeBase, `games/${m[1]}/meta.json`)) { problems.push(`既存の作品の変更: ${file}`); continue; }
  if (status === 'D') { problems.push(`削除: ${file}`); continue; }
  ids.add(m[1]);
}

for (const id of ids) {
  let meta = null;
  try { meta = JSON.parse(show(head, `games/${id}/meta.json`) || 'null'); } catch {}
  if (!meta) { problems.push(`${id}: meta.json が読めません`); continue; }
  if (meta.id && meta.id !== id) problems.push(`${id}: meta.json の id が違います (${meta.id})`);
  if (meta.status !== 'published') problems.push(`${id}: status が published ではありません (${meta.status})`);
  if (meta.maker !== id.match(ID_RE)[1]) problems.push(`${id}: maker が ID と一致しません (${meta.maker})`);
  if (!exists(head, `games/${id}/index.html`)) problems.push(`${id}: index.html がありません`);
}

// 失敗記録は追記のみ（既存の記録を書き換えない）
if (failuresChanged) {
  let before = [], after = null;
  try { before = JSON.parse(show(mergeBase, 'games/_failures.json') || '[]'); } catch {}
  try { after = JSON.parse(show(head, 'games/_failures.json') || 'null'); } catch {}
  const prefix = Array.isArray(after) && before.every((x, i) => JSON.stringify(x) === JSON.stringify(after[i]));
  if (!prefix) problems.push('games/_failures.json が追記ではなく書き換えられています');
}

if (problems.length) {
  console.log('自動公開の対象外:');
  for (const p of problems) console.log(`- ${p}`);
  process.exit(1);
}
const list = [...ids].join(' ');
console.log(`自動公開の対象: ${list || '（作品なし・失敗記録のみ）'}`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `ids=${list}\n`);
