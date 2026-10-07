// AIプロバイダ（無料で使えるもののみ）
//   gemini : Google AI Studio の無料APIキー（GEMINI_API_KEY）
//   openai : OpenAI互換API。GitHub Models（GITHUB_TOKEN で GPT 系が無料枠で使える）、Ollama（ローカル）、
//            Groq / OpenRouter の無料モデルなど
//   mock   : 動作確認用のダミー（APIを呼ばない）
//
// chat(messages) の messages は [{ role: 'system'|'user'|'assistant', text, images?: [base64jpeg] }]
// 戻り値: { text, usage: { input, output }, modelVersion }
import fs from 'node:fs';

export function createProvider(cfg) {
  const key = cfg.apiKeyEnv ? process.env[cfg.apiKeyEnv] : '';
  if (cfg.apiKeyEnv && !key && cfg.type !== 'mock') throw new Error(`環境変数 ${cfg.apiKeyEnv} が未設定です（${cfg.id}）`);
  if (cfg.type === 'gemini') return gemini(cfg, key);
  if (cfg.type === 'openai') return openai(cfg, key);
  if (cfg.type === 'mock') return mock();
  throw new Error('未対応のプロバイダ種別: ' + cfg.type);
}

async function withRetry(fn, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (!/429|500|502|503|504|overloaded|rate/i.test(String(e.message))) throw e;
      const wait = 15000 * (i + 1);
      console.log(`  …混雑/制限のため ${wait / 1000}秒待って再試行 (${e.message.slice(0, 80)})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

function gemini(cfg, key) {
  const base = cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  return {
    vision: cfg.vision !== false,
    async chat(messages, { maxTokens, temperature, json, search } = {}) {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.text).join('\n\n');
      const contents = messages.filter((m) => m.role !== 'system').map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }, ...(m.images || []).map((b64) => ({ inline_data: { mime_type: 'image/jpeg', data: b64 } }))],
      }));
      const body = {
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        ...(search ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: {
          temperature: temperature ?? cfg.temperature ?? 1,
          maxOutputTokens: maxTokens ?? cfg.maxTokens ?? 32768,
          ...(json && !search ? { responseMimeType: 'application/json' } : {}),
        },
      };
      return withRetry(async () => {
        const r = await fetch(`${base}/models/${cfg.model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
        const d = await r.json();
        const parts = d.candidates?.[0]?.content?.parts || [];
        return {
          text: parts.filter((p) => !p.thought).map((p) => p.text || '').join(''),
          usage: { input: d.usageMetadata?.promptTokenCount, output: (d.usageMetadata?.candidatesTokenCount || 0) + (d.usageMetadata?.thoughtsTokenCount || 0), thinking: d.usageMetadata?.thoughtsTokenCount || 0 },
          modelVersion: d.modelVersion || cfg.model,
        };
      });
    },
  };
}

function openai(cfg, key) {
  const base = (cfg.baseUrl || 'https://models.github.ai/inference').replace(/\/$/, '');
  return {
    vision: cfg.vision !== false,
    async chat(messages, { maxTokens, temperature, json } = {}) {
      const msgs = messages.map((m) => ({
        role: m.role,
        content: m.images?.length
          ? [{ type: 'text', text: m.text }, ...m.images.map((b64) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }))]
          : m.text,
      }));
      const body = { model: cfg.model, messages: msgs, temperature: temperature ?? cfg.temperature ?? 1, max_tokens: maxTokens ?? cfg.maxTokens ?? 4000, ...(json && cfg.jsonMode !== false ? { response_format: { type: 'json_object' } } : {}) };
      return withRetry(async () => {
        const r = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error(`${cfg.id} ${r.status}: ${(await r.text()).slice(0, 300)}`);
        const d = await r.json();
        return { text: d.choices?.[0]?.message?.content || '', usage: { input: d.usage?.prompt_tokens, output: d.usage?.completion_tokens, thinking: d.usage?.completion_tokens_details?.reasoning_tokens || 0 }, modelVersion: d.model || cfg.model };
      });
    },
  };
}

// 動作確認用: 固定のゲームを返し、プレイでは画面下をタップ、判定は「まあまあ」
function mock() {
  const html = fs.readFileSync(new URL('./fixtures/mock-game.html', import.meta.url), 'utf8');
  let turn = 0;
  const ok = (obj) => ({ text: JSON.stringify(obj), usage: { input: 0, output: 0, thinking: 0 }, modelVersion: 'mock' });
  return {
    vision: true,
    async chat(messages, { json } = {}) {
      const last = messages[messages.length - 1].text;
      if (last.includes('"similar":[')) return ok({ similar: [{ title: 'モック類似作品', similarity: '中', note: 'パイプライン確認用', note_en: 'for pipeline testing' }], research: 'モック', research_en: 'mock' });
      if (json && last.includes('"action"')) return ok({ observation: 'モック', action: { tap: [0.2 + 0.3 * (turn++ % 3), 0.85], hold: 300 }, note: 'モックの操作', note_en: 'mock move' });
      if (json) return ok({ verdict: 'meh', works: 'ok', comment: 'モックによる仮の判定です。パイプライン確認用。', comment_en: 'Placeholder verdict by the mock provider for pipeline testing.', thumb: 2 });
      const meta = { title: 'モック・ドッジ', genre: 'アクション', concept: 'パイプライン確認用のモック。', howToPlay: '指で左右に動かして避ける。', libraryDecision: 'モックのため使わない。', i18n: { en: { title: 'Mock Dodge', concept: 'A mock for testing the pipeline.', howToPlay: 'Drag left and right to dodge.', libraryDecision: 'None; this is a mock.' } } };
      return { text: '```json\n' + JSON.stringify(meta) + '\n```\n\n```html\n' + html + '\n```', usage: { input: 0, output: 0, thinking: 0 }, modelVersion: 'mock' };
    },
  };
}
