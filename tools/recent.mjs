// 過去の作品の一覧（似た企画を避けるため）: node tools/recent.mjs [--limit 40]
// ※ 閉じた系の実験なので、人間の評価は表示しない（AIは評価を見ない）。
import path from 'node:path';
import { GAMES_DIR, listGameIds, readJson, parseArgs } from './lib.mjs';

const limit = Number(parseArgs().limit) || 40;
const ids = listGameIds().slice(-limit);
if (!ids.length) console.log('まだ作品はありません。');
for (const id of ids) {
  const m = readJson(path.join(GAMES_DIR, id, 'meta.json'));
  if (!m?.title) continue;
  console.log(`${id}  ${m.title}（${m.genre}）: ${m.concept || ''}`);
}
