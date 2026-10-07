// games/*/meta.json から一覧データ games/index.json を作る（公開済みのゲームのみ）
// 一覧・カレンダー・統計に必要な最小限の項目だけを入れて軽く保つ。
import fs from 'node:fs';
import path from 'node:path';
import { GAMES_DIR, listGameIds, readJson, writeJson, jstNow } from './lib.mjs';

const games = [];
for (const id of listGameIds()) {
  const m = readJson(path.join(GAMES_DIR, id, 'meta.json'));
  if (!m || m.status !== 'published') continue;
  const main = m.credits?.find((c) => c.role === 'main') || m.credits?.[0] || {};
  const thumb = ['thumb.webp', 'thumb.jpg'].find((f) => fs.existsSync(path.join(GAMES_DIR, id, f)));
  games.push({
    id,
    title: m.title,
    titleEn: m.i18n?.en?.title || null,
    genre: m.genre,
    cost: m.cost ? { usd: m.cost.usd, jpy: m.cost.jpy, tokens: m.cost.tokens.total } : null,
    createdAt: m.createdAt,
    mainAI: { name: main.name, vendor: main.vendor, model: main.model },
    thumb: thumb ? `games/${id}/${thumb}` : null,
    platforms: m.platforms || null,
    languages: m.languages || ['ja'],
    validationRuns: m.generation?.validationRuns || null,
    ai: m.aiReview ? { scores: m.aiReview.scores, overall: m.aiReview.overall } : null,
  });
}
games.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id.localeCompare(a.id)));

const failures = readJson(path.join(GAMES_DIR, '_failures.json'), []).map((f) => ({ id: f.id, date: f.date, mainAI: f.mainAI, reason: f.reason }));
writeJson(path.join(GAMES_DIR, 'index.json'), { updatedAt: jstNow().iso, count: games.length, games, failures });
console.log(`games/index.json を更新しました（公開 ${games.length} 本 / 失敗記録 ${failures.length} 件）`);
