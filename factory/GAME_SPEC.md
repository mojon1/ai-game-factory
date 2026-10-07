# ゲーム制作仕様（全AI共通）

AI GAME FACTORY に投稿するゲームは、どのAIが作る場合もこの仕様に従う。
（Claude Code の日次タスクも、API経由の自動生成スクリプトも、このファイルをそのまま読み込む）

## 必須要件

1. **HTMLファイル1枚で完結**すること。CSS・JavaScript・画像（あれば）はすべてインライン。
   外部URLの読み込み（CDN、Webフォント、画像、fetch など）は一切禁止。目安 60KB 以下（上限 120KB）。
2. **PC とスマホの両方に対応**すること（自動テストで両方検査され、どちらかが不合格なら公開されない）。
   - 画面いっぱい（`100vw × 100vh`）に表示し、`resize` に追従する。`devicePixelRatio` を考慮して描画がぼやけないこと。
   - **横長 PC（640×400 前後）でも、縦長スマホ（360×640 前後）でも** 画面を有効に使ったレイアウトにする。
     縦長でフィールドが極端に小さくならないよう、縦横比に応じて配置・拡大率・フィールドの向きを変える。
   - スマホでも文字は最小 12px 相当以上。HUD の文字同士が重ならないこと。
   - 読み込み直後に一瞬サイズが 0 でも例外を出さないこと（サイズに依存する初期化は描画時に行うか、最小サイズで保護する）。
3. 操作は **PC=キーボード（＋マウス）、スマホ=タッチだけ** で完結すること。
   - ポインタ操作は Pointer Events（`pointerdown` / `pointermove` / `pointerup`）で実装する。
   - タッチ時にスクロールやズームが起きないよう `touch-action: none` を指定する。
   - キーボードは矢印キー / WASD / Space / Enter を基本とする。
   - スマホではキーボードが無い前提で、タップ・長押し・スワイプ・画面上のボタンなどで全操作ができること。
     画面上ボタンは指で押せる大きさ（最小 44px 四方）にする。
   - タイトル画面やゲーム中に、その端末向けの操作説明を表示する（`pointer: coarse` などで出し分けてよい）。
4. 流れは **タイトル画面 → プレイ → ゲームオーバー（またはクリア）→ リスタート**。
   タイトル画面では Space / Enter / クリック / タップのいずれでも開始できること。
   リスタートはページ再読み込みなしで行えること。
5. スコア・残りライフ・タイムなど、プレイ状況が画面に表示されていること。
6. **日本語と英語の両方に対応**すること。
   - 表示言語は URL の `?lang=ja` / `?lang=en` で決める。指定が無い場合は `navigator.language` が `ja` で始まれば日本語、それ以外は英語。
     例: `const LANG = new URLSearchParams(location.search).get('lang') || (/^ja/i.test(navigator.language) ? 'ja' : 'en');`
   - 画面に出る文字（タイトル・説明・操作方法・HUD・結果画面）はすべて辞書オブジェクトにまとめ、両言語で用意する。
   - 英語は文字数が増えやすいので、はみ出さないよう文字サイズや改行を調整する。
   - 自動テストで `?lang=ja` と `?lang=en` のタイトル画面が異なることを確認する。
7. 1プレイ 1〜3 分程度で遊べる、シンプルで分かりやすいルールにする。
   開始から3秒以内に操作して遊べる状態になること。

## 禁止事項（サイトの sandbox iframe 内で動かすため）

- `alert` / `confirm` / `prompt`、`window.open`、`top` / `parent` の操作
- `localStorage` / `sessionStorage` / Cookie / IndexedDB（使うと例外になる。ハイスコアはメモリ上で保持）
- ネットワーク通信（fetch, XHR, WebSocket）
- 外部リソースの読み込み

## 推奨

- ゲームループは `requestAnimationFrame` のタイムスタンプ（または `performance.now()`）から
  経過時間 dt を求めて更新する。dt は上限（例: 50ms）でクランプする。
  ※ AIの自己プレイでは「時間を止めて1手ずつ進める」ため、Date や時間を直接見ても問題なく動作する。
- サウンドは Web Audio API で生成してよい（最初のユーザー操作後に `AudioContext` を作成し、try/catch で囲む）。
- 図形・グラデーション・パーティクルなどコードで描ける表現を工夫して見た目の質を上げる。
- 難易度は徐々に上がる設計にする。

## 提出物

ゲームごとに `games/<id>/` へ以下を置く。

| ファイル | 内容 |
| --- | --- |
| `index.html` | ゲーム本体 |
| `meta.json` | タイトル・ジャンル・説明・操作方法・制作AI情報など（`tools/new-game.mjs` が雛形を作る） |
| `thumb.webp` | サムネイル（`tools/review.mjs` が自動生成・圧縮） |
| `ai-play/` `ai-play-mobile/` | AI自己プレイ（PC・スマホ）の画像とログ（`tools/play.mjs` が生成、`review.mjs` が圧縮・間引き） |

### meta.json で埋める項目

```json
{
  "title": "ゲームタイトル（日本語・20文字以内）",
  "genre": "アクション | シューティング | パズル | レース | リズム | スポーツ | ストラテジー | アドベンチャー | その他 のいずれか",
  "tags": ["短い特徴タグ", "2〜4個"],
  "description": "どんなゲームか（80〜150文字）",
  "howToPlay": "目的とルール（1〜3文）",
  "controls": [{ "input": "← → / A D / 画面左右タップ", "action": "移動" }],
  "i18n": {
    "en": {
      "title": "English title",
      "tags": ["tag"],
      "description": "English description",
      "howToPlay": "English how to play",
      "controls": [{ "input": "← → / A D / tap left or right", "action": "Move" }]
    }
  }
}
```
