# AI GAME FACTORY

**ここはAIが毎日、勝手にゲームを作り続ける工場です。**
企画・コーディング・テスト・試遊・類似作品リサーチ・自己採点までをAIだけで行い、遊んだ人の評価とAIの自己評価を比べます。

- トップページ: **カレンダー**（月表示＝各日のマスにゲームのサムネ ⇄ リスト＝時系列の縦一覧）。各作品にタイトル・ジャンル・制作日・メイン制作AI
- ゲームページ: ゲーム本体 / 評価フォーム（端末・遊べたか・楽しさ・クオリティ・独創性・コメント）/ AI vs 人間 / ルーツ・類似作品 / AIのプレイログ（PC・スマホ）/ 制作情報
- 実験データ: 制作AIごとの成績、ランキング、AI自己評価×人間評価の散布図、評価の推移
- すべてのゲームは **PC とスマホの両方に対応**（自動テストで両方を検査）
- サイトもゲームも **日本語・英語対応**（ブラウザの言語で自動切り替え＋右上のボタンで手動切り替え。`?lang=ja|en` でも指定可）
- 各ゲームに **制作コスト**（使用トークン数と、制作時点のAPI定価での金額。日本語は円・英語はドル）を記録
  - Claude Code: セッション記録（`~/.claude/projects/…/*.jsonl`）から `tools/cost.mjs` が集計
  - API経由のAI: APIの応答に含まれるトークン数を集計
  - 料金表は `factory/pricing.json`、為替は制作時点の参照レート（Frankfurter / ECB）

費用は Claude / GPT 等の利用料（サブスクリプション）以外かかりません（GitHub Pages・Supabase 無料プラン・各社AIの無料枠）。

---

## 仕組み

```
毎日（スケジュール実行）
 └ Claude Code が factory/DAILY_TASK.md に従って 3 本制作
     1. tools/idea.mjs        お題をランダムに決める（ジャンル×ひねり×テーマ）
     2. tools/new-game.mjs    雛形と制作AI情報を記録
     3. （AIがゲームを書く）    factory/GAME_SPEC.md の仕様に従う（PC＋スマホ必須）
     4. tools/validate.mjs    自動テスト。PC（キーボードのみ）とスマホ（縦画面・タッチのみ）を別々に検査。
                              3回不合格なら破棄＆失敗記録
     5. tools/play.mjs        時間を止めて1手ずつ自分でプレイ（PC 6〜10手 / スマホ 3〜5手）
     6. （類似作品リサーチ）    WebSearch で似た作品・ルーツを調べる
     7. tools/review.mjs      自己採点 → 画像を WebP に圧縮・間引き → 公開状態に
     8. tools/build-index.mjs → tools/storage-report.mjs → git push → GitHub Actions で自動デプロイ
```

### AIはどうやってアクションゲームを遊ぶのか
Playwright の時計制御で `requestAnimationFrame` / タイマー / `performance.now()` を止め、
「スクショを見る → 操作を決める → その操作の間だけ時間を進める」を繰り返します。
乱数もシード固定なので、同じ操作列なら同じ画面が再現でき、CLI から1手ずつプレイできます。
スマホモードではタッチイベント（タップ・長押し・スワイプ）だけで操作します。

### 他のAIの参加（ChatGPT / Gemini など）
`generator/generate.mjs` が同じお題・同じ仕様・同じテスト・同じ自己プレイ（PC＋スマホ）・類似作品リサーチ・自己採点を API 経由で行います（無料枠のみ）。

| ID | AI | 必要なもの | 類似作品リサーチ |
| --- | --- | --- | --- |
| `github-gpt-4.1` | GPT-4.1（OpenAI） | GitHub Models。GitHub Actions 内なら追加設定なし（`GITHUB_TOKEN`） | AIの知識のみ |
| `gemini-flash` | Gemini 2.5 Flash（Google） | Google AI Studio の無料APIキー → Secret `GEMINI_API_KEY` | Google検索 |
| `ollama` | ローカルLLM | 自分のPCで Ollama を起動（`enabled: true` に変更） | AIの知識のみ |

GitHub の Actions タブ →「Generate games (API AIs)」→ Run workflow で実行できます。モデルや無料枠の内容は変わることがあるので、`generator/config.json` で調整してください。

---

## 無料枠に収めるための設計

| 項目 | 無料枠 | このサイトの使い方 |
| --- | --- | --- |
| GitHub Pages | サイト 1GB・転送 100GB/月 | 1作品あたり約 50〜80KB（コード＋WebP画像）。1日3本で年 約70MB |
| Supabase | DB 500MB | 評価1件あたり数百バイト。数十万件まで余裕 |
| GitHub Actions | 公開リポジトリは無料 | デプロイと他社AIの生成のみ |

- サムネは 480×300 の WebP、プレイ画像は PC 5枚・スマホ 3枚までを WebP で保存し、残りは削除（操作ログは残るので再現可能）。
- ゲームのコードは 120KB 以下、画像・音声ファイルの追加は禁止（すべてコードで描画）。
- `npm run storage` で現在の容量と、安全ライン（900MB）までの残り年数を確認できます。日次タスクの最後にも自動で表示されます。

---

## Claude の実行場所: ローカル と クラウド

手順書（`factory/DAILY_TASK.md`）はどちらでも同じです。違いは「どこでスケジュールを動かすか」だけです。

| | ローカル（Claude デスクトップのスケジュールタスク） | クラウド（Claude Code のクラウド定期実行） |
| --- | --- | --- |
| PC | 実行時刻に PC とアプリが起動している必要あり | 不要 |
| 動作確認 | このPCで全工程を確認済み | 未確認（クラウド環境でブラウザ Chromium を入れられるかが鍵） |
| 準備 | なし | GitHub リポジトリ必須。初回に `npm ci && npm run setup` |
| 費用 | サブスクリプション内 | サブスクリプション内 |

---

## セットアップ

### 1. ローカルで確認
```bash
npm install
npm run serve
```
→ http://localhost:8080/

自動テストと自己プレイは Playwright を使います。PCの Edge/Chrome を自動で使いますが、見つからない場合は `npm run setup`。

### 2. GitHub Pages で公開
1. GitHub にリポジトリを作って push
2. Settings → Pages → Source を **GitHub Actions** にする
3. main に push するたびに自動デプロイ（`.github/workflows/deploy.yml`）

### 3. 評価データベースの設定（Supabase 無料プラン）
未設定のあいだは「デモモード」で、評価はブラウザ内にだけ保存されます。
1. https://supabase.com でプロジェクトを作成
2. SQL Editor で `supabase/schema.sql` を実行
3. Project Settings → API の **Project URL** と **Publishable key（または anon key）** を `assets/config.js` に記入して push

※ Supabase の無料プロジェクトは長期間アクセスがないと一時停止します。

### 4. 毎日の自動制作（Claude Code）
スケジュール実行（ローカルまたはクラウド）に、このリポジトリで次の指示を実行するよう登録します。
```
factory/DAILY_TASK.md の手順に従って、今日のゲームを制作・公開してください。
```

---

## よく使うコマンド
```bash
node tools/idea.mjs --count 3                 # お題を出す
node tools/validate.mjs <id>                  # 自動テスト（PC＋スマホ）
node tools/play.mjs init <id>                 # 自己プレイ開始（PC）
node tools/play.mjs init <id> --device mobile # 自己プレイ開始（スマホ）
node tools/play.mjs step <id> '{"keys":["Space"],"hold":100}' --note "メモ"
node tools/review.mjs <id> --playable-pc 2 --playable-mobile 2 --fun 3 --quality 3 --originality 3 \
  --comment "…" --thumb 4 --similar '[…]' --research "…"
node tools/build-index.mjs                    # 一覧データ更新
npm run storage                               # 容量レポート
node generator/generate.mjs --provider mock   # APIパイプラインの動作確認（APIは呼ばない）
```
