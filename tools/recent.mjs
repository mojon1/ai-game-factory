// 過去の作品の一覧（似た企画を避けるため）: node tools/recent.mjs [--limit 40]
// 題材だけでなく、作品の構造（目指すもの・終わり方・中心の操作）の偏りも集計して表示する。
// ※ 閉じた系の実験なので、人間の評価は表示しない（AIは評価を見ない）。
import path from 'node:path';
import { GAMES_DIR, listGameIds, readJson, parseArgs, STRUCTURE, structureOf } from './lib.mjs';

const limit = Number(parseArgs().limit) || 40;
const games = listGameIds().slice(-limit)
  .map((id) => ({ id, m: readJson(path.join(GAMES_DIR, id, 'meta.json')) }))
  .filter((g) => g.m?.title)
  .map((g) => ({ ...g, s: structureOf(g.id, g.m) }));
if (!games.length) { console.log('まだ作品はありません。'); process.exit(0); }

// ---------- 構造の集計 ----------
const withS = games.filter((g) => g.s);
const count = (key, pick) => {
  const c = {};
  for (const g of withS) for (const v of [].concat(pick(g.s))) c[v] = (c[v] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${STRUCTURE[key][k] || k} ${n}`).join(' / ');
};
const combos = {};
for (const g of withS) { const k = `${STRUCTURE.goal[g.s.goal]} × ${STRUCTURE.ending[g.s.ending]}`; combos[k] = (combos[k] || 0) + 1; }
console.log(`## 過去の作品の構造（${withS.length}作）`);
console.log(`- 目指すもの: ${count('goal', (s) => s.goal)}`);
console.log(`- 終わり方: ${count('ending', (s) => s.ending)}`);
console.log(`- 中心の操作: ${count('input', (s) => s.input)}`);
const gc = {};
for (const g of games) gc[g.m.genre] = (gc[g.m.genre] || 0) + 1;
console.log(`- ジャンル: ${Object.entries(gc).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' / ')}`);
console.log(`- 多い組み合わせ: ${Object.entries(combos).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k}（${n}作）`).join('、')}`);
console.log(`- まだ無いもの: 目指すもの=${Object.keys(STRUCTURE.goal).filter((k) => k !== 'other' && !withS.some((g) => g.s.goal === k)).map((k) => STRUCTURE.goal[k]).join('、') || 'なし'}`
  + ` / 終わり方=${Object.keys(STRUCTURE.ending).filter((k) => k !== 'other' && !withS.some((g) => g.s.ending === k)).map((k) => STRUCTURE.ending[k]).join('、') || 'なし'}`);
console.log('');

// ---------- 作品ごと ----------
console.log('## 作品の一覧（古い順）');
for (const { id, m, s } of games) {
  const tag = s ? `［${STRUCTURE.goal[s.goal]} / ${STRUCTURE.ending[s.ending]} / ${s.input.map((k) => STRUCTURE.input[k]).join('・')}］` : '［構造の記録なし］';
  console.log(`${id}  ${m.title}（${m.genre}）${tag}: ${m.concept || ''}`);
}
