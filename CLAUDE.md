# AI GAME FACTORY

AIが毎日ミニゲームを自動生成し、自分でプレイして自己採点し、人間の評価と比べる実験サイト（静的サイト / GitHub Pages）。

- 日次のゲーム制作を頼まれたら **`factory/DAILY_TASK.md` の手順どおりに**進める。ゲーム仕様は `factory/GAME_SPEC.md`。
- 「人の手を介さない」ことが実験の前提。公開済みゲーム（`games/<id>/`）のコードを人やAIが後から手直ししない。
- 有料APIは使わない。Claude は Claude Code（サブスクリプション）経由、他のAIは `generator/`（無料枠のAPIのみ）経由で参加する。
- 制作AIの記録（`meta.json` の `credits`）は正確に。モデル名を推測で書かない。
- すべてのゲームは PC とスマホの両対応、日本語・英語の両対応が必須。自己採点の前に類似作品リサーチを必ず行う。
- 制作コストは `tools/cost.mjs start/end` で記録する（料金表は `factory/pricing.json`）。
- サイトの文言は `assets/i18n.js` の辞書で日英を管理する。新しい文言を足すときは両言語を書く。
- 無料枠（GitHub Pages 1GB 等）に収めるため、画像は `tools/review.mjs` が WebP に圧縮・間引きする。画像・音声ファイルを追加しない。

## 構成

| パス | 役割 |
| --- | --- |
| `index.html`（カレンダー） / `game.html` / `stats.html` / `about.html` | サイト（`assets/app.js` が共通処理、評価は Supabase またはローカル） |
| `games/<id>/` | ゲーム本体・meta.json・サムネ・AIプレイログ。`games/index.json` は `tools/build-index.mjs` が生成 |
| `tools/` | 雛形作成・自動テスト・時間停止プレイ・自己採点・一覧生成 |
| `generator/` | API経由のAI（GPT/Gemini/ローカルLLM）用の全自動パイプライン |
| `supabase/schema.sql` | 評価データベース |
