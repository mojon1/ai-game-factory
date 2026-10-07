// 毎日の自動制作が必要かどうかを判定する（スケジュール実行の最初に使う）
//   node tools/daily-check.mjs [--maker claude]      … 判定して、制作する場合はロックを取る
//   node tools/daily-check.mjs --release             … 制作が終わったらロックを外す
//
// 1行目に STATUS=make / done / skip / busy を出力する。
//   done : 今日の自動制作（trigger=scheduled）が公開済み → 何もしない
//   skip : 今日の自動制作が規定回数失敗した → 今日は見送る
//   busy : 別の自動実行が制作中（ロックが新しい）→ 何もしない
//   make : 今日の分を1本作る
// 数えるのは、同じ maker の「スケジュール実行で作った」作品だけ。他のAIの作品や、人に頼まれて作った作品は数えない。
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, GAMES_DIR, gameDir, listGameIds, readJson, writeJson, parseArgs, jstNow } from './lib.mjs';

const a = parseArgs();
const LOCK = path.join(ROOT, '.daily-lock.json');
const LOCK_HOURS = 3;
const MAX_ATTEMPTS = Number(a['max-attempts']) || 3;

if (a.release) {
  fs.rmSync(LOCK, { force: true });
  console.log('STATUS=released');
  process.exit(0);
}

const maker = String(a.maker || 'claude').toLowerCase();
const today = jstNow().date;
const prefix = `${today}-${maker}-`;
const ours = listGameIds().filter((id) => id.startsWith(prefix)).map((id) => ({ id, m: readJson(path.join(gameDir(id), 'meta.json')) }))
  .filter((x) => x.m?.generation?.trigger === 'scheduled');
const published = ours.filter((x) => x.m.status === 'published');
const failures = readJson(path.join(GAMES_DIR, '_failures.json'), [])
  .filter((f) => String(f.id || '').startsWith(prefix) && f.trigger === 'scheduled');

if (published.length) {
  console.log(`STATUS=done\n今日（${today}）の自動制作は公開済みです: ${published.map((x) => `${x.id}「${x.m.title}」`).join(', ')}`);
  process.exit(0);
}

const lock = readJson(LOCK);
if (lock && Date.now() - Date.parse(lock.at) < LOCK_HOURS * 3600e3) {
  console.log(`STATUS=busy\n別の自動実行が制作中です（${lock.at} 開始）。今回は何もしません。`);
  process.exit(0);
}

// 前回の実行が途中で止まって残った下書きは、失敗として記録して片付ける
const drafts = ours.filter((x) => x.m.status !== 'published');
for (const d of drafts) {
  const list = readJson(path.join(GAMES_DIR, '_failures.json'), []);
  list.push({ id: d.id, date: d.m.createdAt, discardedAt: jstNow().iso, reason: '前回の自動実行が途中で止まった（下書きのまま）', maker, trigger: 'scheduled', mainAI: d.m.credits?.[0] });
  writeJson(path.join(GAMES_DIR, '_failures.json'), list);
  fs.rmSync(gameDir(d.id), { recursive: true, force: true });
  failures.push({});
  console.error(`途中で止まった下書きを片付けました: ${d.id}`);
}

if (failures.length >= MAX_ATTEMPTS) {
  console.log(`STATUS=skip\n今日の自動制作は ${failures.length} 回失敗したため、見送ります（明日また作ります）。`);
  process.exit(0);
}

writeJson(LOCK, { at: new Date().toISOString(), maker });
console.log(`STATUS=make\n今日（${today}）の自動制作はまだです。1本制作してください（--trigger scheduled）。これまでの失敗: ${failures.length} 回`);
