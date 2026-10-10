// サイト設定
// 評価を全員で共有するには Supabase（無料プラン）を設定してください。手順は README.md の「評価データベースの設定」。
// 未設定の場合は「デモモード」となり、評価はそのブラウザ内にだけ保存されます。
window.AGF_CONFIG = {
  supabaseUrl: 'https://ahvcfjotopdurxbvflvk.supabase.co',
  supabaseKey: 'sb_publishable_HWnREwYAHuR2415wwS2vQA_oflvA2vd',   // 公開して問題ない鍵（読み書きは supabase/schema.sql の関数経由に限定）
  // 観測の開始日（「観測 N 日目」の表示に使う）
  startDate: '2026-10-08',
  // 評価をリセットした時刻。これより前にこのブラウザで付けた評価は「まだ評価していない」として扱う
  // （データベース側の評価は supabase/migrations/2026-10-10-reset-ratings.sql で保管用の表へ移した）
  ratingsResetAt: '2026-10-10T05:31:00Z',
};
