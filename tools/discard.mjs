// 制作に失敗したゲームを破棄し、失敗記録（AIごとの成功率の集計に使う）に残す
//   node tools/discard.mjs <id> "失敗理由"
import fs from 'node:fs';
import path from 'node:path';
import { GAMES_DIR, gameDir, readMeta, readJson, writeJson, jstNow, parseArgs } from './lib.mjs';

const a = parseArgs();
const [id, reason = ''] = a._;
if (!id) { console.error('使い方: node tools/discard.mjs <id> "失敗理由"'); process.exit(1); }
const meta = readMeta(id);
const main = meta.credits?.find((c) => c.role === 'main') || {};
const file = path.join(GAMES_DIR, '_failures.json');
const list = readJson(file, []);
list.push({
  id, date: meta.createdAt, discardedAt: jstNow().iso, reason,
  mainAI: { name: main.name, vendor: main.vendor, model: main.model },
  maker: meta.maker, trigger: meta.generation?.trigger || 'manual', validationRuns: meta.generation?.validationRuns || 0,
  lastErrors: meta.autoTest?.errors?.slice(0, 3) || [],
});
writeJson(file, list);
fs.rmSync(gameDir(id), { recursive: true, force: true });
console.log(`破棄しました: ${id}（失敗記録に追加）`);
