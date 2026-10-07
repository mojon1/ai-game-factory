// 容量レポート: 無料枠（GitHub Pages 1GB）に収まるかを確認する
//   node tools/storage-report.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, GAMES_DIR, listGameIds, dirSize, settings } from './lib.mjs';

const conf = settings();
const ids = listGameIds();
const sizes = ids.map((id) => ({ id, kb: dirSize(path.join(GAMES_DIR, id)) / 1024 }));
const gamesMB = dirSize(GAMES_DIR) / 1024 / 1024;
const siteMB = ['index.html', 'game.html', 'stats.html', 'about.html', 'assets'].reduce((n, f) => {
  const p = path.join(ROOT, f);
  return n + (fs.existsSync(p) ? (fs.statSync(p).isDirectory() ? dirSize(p) : fs.statSync(p).size) : 0);
}, 0) / 1024 / 1024;
const avgKB = sizes.length ? sizes.reduce((a, b) => a + b.kb, 0) / sizes.length : 0;
const perYearMB = (avgKB * conf.gamesPerDay * 365) / 1024;
const totalMB = gamesMB + siteMB;
const yearsLeft = perYearMB ? (conf.siteBudgetMB - totalMB) / perYearMB : Infinity;

console.log(`ゲーム数        : ${ids.length} 本`);
console.log(`1本あたり平均   : ${avgKB.toFixed(0)} KB（目安 ${conf.gameBudgetKB} KB 以下）`);
console.log(`現在の合計      : ${totalMB.toFixed(1)} MB（ゲーム ${gamesMB.toFixed(1)} MB + サイト ${siteMB.toFixed(2)} MB）`);
console.log(`1年あたりの増加 : 約 ${perYearMB.toFixed(0)} MB（1日 ${conf.gamesPerDay} 本の場合）`);
console.log(`安全ライン ${conf.siteBudgetMB} MB まで : あと約 ${yearsLeft === Infinity ? '∞' : yearsLeft.toFixed(1)} 年`);
const over = sizes.filter((s) => s.kb > conf.gameBudgetKB);
if (over.length) console.log(`⚠ 目安超過: ${over.map((s) => `${s.id} (${s.kb.toFixed(0)}KB)`).join(', ')}`);
if (totalMB > conf.siteBudgetMB * 0.8) console.log('⚠ 安全ラインの80%を超えています。古い作品のプレイ画像を減らす等の対策が必要です。');
