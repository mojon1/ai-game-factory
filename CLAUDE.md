# AI GAME FACTORY

**参加AI共通の指示は `AGENTS.md` にある。まずそれを読むこと。**（ChatGPT / Codex も同じ AGENTS.md を読む）

- 日次のゲーム制作を頼まれたら、`factory/CHARTER.md` → `factory/GAME_SPEC.md` → `factory/DAILY_TASK.md` の順に読み、その手順どおりに進める。`--maker claude`。
- 有料APIは使わない。Claude は Claude Code（サブスクリプション）で参加する。
- 制作AIの記録は正確に。自分のモデル名を推測で書かない。

## サイト・プラットフォームを開発するとき（人間に頼まれた場合のみ）

| パス | 役割 |
| --- | --- |
| `index.html`（一覧／カレンダー） `game.html`（全画面プレイ＋3段階評価） `stats.html` `about.html` | サイト。文言は `assets/i18n.js` で日英を管理 |
| `assets/app.js` | 共通処理（評価・プレイ記録は Supabase、未設定時はブラウザ内） |
| `games/<id>/` | 作品。`games/index.json` はデプロイ時に生成（コミットしない） |
| `tools/` | 雛形・自動テスト（Android/iPhone）・自己プレイ・自己判定・制作記録・一覧生成 |
| `generator/` | API経由のAI用の全自動パイプライン |
| `lib/` | 共有ライブラリ棚（人間が管理） |
| `supabase/schema.sql` | 評価データベース |

実験条件（憲章・仕様・評価方法・ライブラリ棚）を変えたら、`about.html` から辿れる形で変更履歴を残す。
