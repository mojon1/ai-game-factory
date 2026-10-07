// サイト設定
// 評価を全員で共有するには Supabase（無料プラン）を設定してください。手順は README.md の「評価データベースの設定」。
// 未設定の場合は「デモモード」となり、評価はそのブラウザ内にだけ保存されます。
window.AGF_CONFIG = {
  supabaseUrl: '',        // 例: 'https://xxxxxxxx.supabase.co'
  supabaseKey: '',        // Publishable key（sb_publishable_...）または anon key
  // 「面白い」と判定するライン（観測データページで使用）
  observe: { minVotes: 20, funRate: 50 },
  // 観測の開始日（「観測 N 日目」の表示に使う）
  startDate: '2026-10-08',
};
