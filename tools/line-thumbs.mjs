// LINE 通知用に、各作品のサムネイル（thumb.webp）から JPEG（line-thumb.jpg）を作る
// LINE の画像は JPEG / PNG しか表示できないため。デプロイ時に GitHub Actions で実行し、リポジトリにはコミットしない。
//   SHARP_PREFIX=<sharp をインストールしたフォルダ> node tools/line-thumbs.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { GAMES_DIR, listGameIds } from './lib.mjs';

const prefix = process.env.SHARP_PREFIX;
if (!prefix) { console.error('SHARP_PREFIX を指定してください'); process.exit(1); }
const sharp = createRequire(path.join(prefix, 'node_modules', '_.js'))('sharp');

let made = 0;
for (const id of listGameIds()) {
  const src = path.join(GAMES_DIR, id, 'thumb.webp');
  if (!fs.existsSync(src)) continue;
  try {
    await sharp(src).resize({ width: 540, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(GAMES_DIR, id, 'line-thumb.jpg'));
    made++;
  } catch (e) { console.log(`::warning::${id}: ${e.message}`); }
}
console.log(`LINE 用の JPEG を ${made} 枚作りました`);
