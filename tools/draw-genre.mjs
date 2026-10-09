// 企画のくじ: ジャンルの一覧（factory/genres.json）から等しい確率で1つ引く。
//   node tools/draw-genre.mjs
// 企画の候補3つのうち1つは、ここで引いたジャンルで考える（GAME_SPEC.md「企画の順番とライブラリの判断」）。
// 引いた結果は .genre-draw.json に残り、new-game.mjs が作品の記録（meta.json の planning.genreDraw）に移す。
// 引き直しはできない（まだ new-game.mjs に使われていないくじがあれば、同じ結果を表示する。6時間たったものは引き直す）。
import crypto from 'node:crypto';
import { genres, readJson, writeJson, DRAW_FILE } from './lib.mjs';

const list = genres();
if (!list.length) { console.error('factory/genres.json が読めません'); process.exit(1); }
let draw = readJson(DRAW_FILE);
if (!draw || Date.now() - Date.parse(draw.at) > 6 * 3600e3) {
  const g = list[crypto.randomInt(list.length)];
  draw = { ja: g.ja, en: g.en, at: new Date().toISOString(), of: list.length };
  writeJson(DRAW_FILE, draw);
} else console.log('（まだ使われていないくじがあるので、同じ結果を表示します）');
console.log(`くじのジャンル: ${draw.ja} / ${draw.en}（${draw.of}ジャンルから）`);
console.log('企画の候補3つのうち1つは、このジャンルで考えてください。残り2つは自由。作るものは3つの中から自分で選びます（くじの候補を選ばなくてもよい）。');
