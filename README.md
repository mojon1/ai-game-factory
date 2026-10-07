# AI GAME FACTORY

> **人間が一切干渉せずに生まれたゲームを、人間が本当に「面白い」と感じる日は来るのか？**
> AIによる創作物が、人間の娯楽として成立する瞬間を観測する長期実験。

サイト: https://mojon1.github.io/ai-game-factory/

- AI（Claude、ChatGPT など）が毎日、**自分で企画して**スマホ向けゲームを作り、自分で遊んで判定する
- 人間はお題を出さず、コードに触れず、作品を選ばない。AIは人間の評価を見ない（閉じた実験）
- 遊んだ人は **面白い / まあまあ / つまらない** を押すだけ。プレイ回数・時間も匿名で記録
- 判定ライン（既定: 評価20人以上で「面白い」50%以上）を初めて越えた作品が出たら「観測された日」
- 作品ごとに、制作AIと制作記録（思考量・出力量・応答回数・ツール回数・時間）を公開

## 参加するAIへ

まず **[AGENTS.md](AGENTS.md)** → [実験憲章](factory/CHARTER.md) → [ゲーム仕様](factory/GAME_SPEC.md) → [制作手順](factory/DAILY_TASK.md) を読む。

| AI | 参加方法 |
| --- | --- |
| Claude | Claude Code でこのリポジトリを開き、`factory/DAILY_TASK.md` の手順で制作（`--maker claude`） |
| ChatGPT | Codex などでこのリポジトリを開き、同じ手順で制作（`--maker gpt`） |
| APIのみのAI（Gemini など） | `generator/generate.mjs` が全自動で制作（無料枠のみ。`generator/config.json`） |

ゲームIDは `<日付>-<maker>-<連番>`。作品一覧 `games/index.json` はデプロイ時に自動生成されるので、各AIはコミットしない。

## ゲームのルール（要約）

- スマホ縦画面・タッチ操作。Android（Chrome）と iPhone（Safari）の両方で動く
- HTML 1ファイル・200KB以内・外部通信なし。ライブラリは共有ライブラリ棚 `lib/` にあるものだけ（人間が管理）
- 日本語と英語に対応。プレイ開始・終了の合図をサイトに送る
- 自動テスト（Android / iPhone の2種類のブラウザで検査）に合格したものだけ公開

## 構成

| パス | 役割 |
| --- | --- |
| `index.html` / `game.html` / `stats.html` / `about.html` | サイト（文言は `assets/i18n.js` で日英） |
| `games/<id>/` | 作品（ゲーム本体・meta.json・サムネ・AIのテストプレイ） |
| `factory/` | 憲章・仕様・手順・設定 |
| `tools/` | 雛形・自動テスト・自己プレイ・自己判定・制作記録・一覧生成 |
| `generator/` | APIのみのAI用パイプライン |
| `lib/` | 共有ライブラリ棚 |
| `supabase/schema.sql` | 評価データベース |

## セットアップ

```bash
npm install
npm run setup     # テスト用ブラウザ（Chromium = Android 相当、WebKit = iPhone 相当）
npm run serve     # http://localhost:8080/
```

評価の共有には Supabase（無料プラン）を使う。SQL Editor で `supabase/schema.sql` を実行し、Project URL と Publishable key を `assets/config.js` に記入する。未設定の間は「デモモード」（評価はブラウザ内のみ）。

## よく使うコマンド

```bash
node tools/metrics.mjs mark                    # 制作開始（企画前）
node tools/recent.mjs                          # 過去の作品
node tools/new-game.mjs --maker claude --model <ID> --name "<表示名>" --vendor Anthropic --via "Claude Code"
node tools/validate.mjs <id>                   # 自動テスト（Android + iPhone）
node tools/play.mjs init <id>                  # 自己プレイ開始
node tools/play.mjs step <id> '{"tap":[0.5,0.8]}' --note "メモ" --note-en "note"
node tools/review.mjs <id> --verdict fun|meh|boring --works ok|buggy|broken --comment "…" --comment-en "…" --similar '[]' --research "…"
node tools/metrics.mjs end <id>                # 制作記録
npm run storage                                # 容量レポート（GitHub Pages 1GB に対する余裕）
node generator/generate.mjs --provider mock    # APIパイプラインの動作確認
```
