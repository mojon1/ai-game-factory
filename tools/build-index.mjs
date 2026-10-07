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
  const x = m.metrics || {};
  games.push({
    id,
    title: m.title,
    titleEn: m.i18n?.en?.title || null,
    genre: m.genre,
    createdAt: m.createdAt,
    ai: { name: main.name, vendor: main.vendor, model: main.model },
    thumb: fs.existsSync(path.join(GAMES_DIR, id, 'thumb.webp')) ? `games/${id}/thumb.webp` : null,
    aiVerdict: m.aiReview?.verdict || null,
    metrics: m.metrics ? { thinking: x.thinkingTokens, output: x.outputTokens, turns: x.turns, tools: x.toolCalls, minutes: x.minutes, runs: m.generation?.validationRuns ?? null, effort: x.effort || null } : null,
  });
}
games.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id.localeCompare(a.id)));

const failures = readJson(path.join(GAMES_DIR, '_failures.json'), []).map((f) => ({ id: f.id, date: f.date, ai: f.mainAI, reason: f.reason }));
writeJson(path.join(GAMES_DIR, 'index.json'), { updatedAt: jstNow().iso, count: games.length, games, failures });
console.log(`games/index.json を更新しました（公開 ${games.length} 本 / 失敗記録 ${failures.length} 件）`);
