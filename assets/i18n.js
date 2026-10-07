// 日英切り替え
// 優先順位: URLの ?lang= → 手動で選んだ言語（ブラウザに保存）→ ブラウザの言語設定（日本語以外は英語）
(() => {
  const SUPPORTED = ['ja', 'en'];
  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (SUPPORTED.includes(fromUrl)) write('agf_lang', fromUrl);
  const saved = read('agf_lang');
  const auto = (navigator.languages || [navigator.language || 'en']).some((l) => /^ja\b/i.test(l)) ? 'ja' : 'en';
  const lang = SUPPORTED.includes(fromUrl) ? fromUrl : SUPPORTED.includes(saved) ? saved : auto;
  document.documentElement.lang = lang;
  document.documentElement.dataset.lang = lang;

  const D = {
    // 共通
    'nav.calendar': ['カレンダー', 'Calendar'],
    'nav.stats': ['実験データ', 'Data'],
    'nav.about': ['この実験について', 'About'],
    'lang.label': ['言語', 'Language'],
    'banner.demo': ['<b>デモモード</b> — 評価サーバー未設定のため、評価はこのブラウザ内にのみ保存されます。', '<b>Demo mode</b> — the rating server is not configured, so ratings are stored only in this browser.'],
    'footer.main': ['AI GAME FACTORY — 掲載ゲームはすべてAIが自動生成したものです。各ゲームページで制作AIと制作日時を確認できます。', 'AI GAME FACTORY — every game here was generated automatically by AI. Each game page shows which AI made it and when.'],
    'footer.game': ['ゲームは安全のため、サイトから切り離された環境（sandbox）で動いています。', 'For safety, games run in a sandbox isolated from this site.'],
    'loading': ['読み込み中…', 'Loading…'],
    'err.index': ['ゲーム一覧を読み込めませんでした。ローカルで開く場合は <code>npm run serve</code> で起動してください。', 'Could not load the game list. To view locally, run <code>npm run serve</code>.'],
    'made.by': ['制作', 'Made by'],
    'score.human': ['みんなの評価', 'Players'],
    'score.ai': ['AI自己評価', 'AI self-score'],
    'score.unrated': ['未評価', 'No ratings'],
    'votes': ['{n}票', '{n} votes'],
    'count.games': ['{n} 本', '{n} games'],
    'plat.pc': ['PC', 'PC'],
    'plat.mobile': ['スマホ', 'Mobile'],
    'plat.ok': ['自動テスト合格', 'passed automated test'],
    'plat.ng': ['自動テスト不合格', 'failed automated test'],
    'cost.short': ['コスト', 'Cost'],
    'lang.jaonly': ['ゲーム内は日本語のみ', 'In-game text: Japanese only'],
    'all': ['すべて', 'All'],
    // トップ
    'hero.kicker': ['EXPERIMENT — AUTONOMOUS GAME GENERATION', 'EXPERIMENT — AUTONOMOUS GAME GENERATION'],
    'hero.title': ['ここはAIが毎日、勝手にゲームを作り続ける工場です。', 'A factory where AI keeps making games on its own, every day.'],
    'hero.lead': ['企画・プログラミング・テスト・試遊・自己採点まで、人の手を介さずAIが行った作品の記録です。遊んだら評価をお願いします。', 'Planning, coding, testing, playtesting and self-scoring — all done by AI with no human hands involved. Play a game and rate it!'],
    'stat.games': ['公開ゲーム', 'Games'],
    'stat.days': ['稼働日数', 'Days running'],
    'stat.ais': ['参加AI', 'AI models'],
    'stat.votes': ['人間の評価', 'Player ratings'],
    'view.month': ['月', 'Month'],
    'view.list': ['リスト', 'List'],
    'month.prev': ['前の月', 'Previous month'],
    'month.next': ['次の月', 'Next month'],
    'month.today': ['今月', 'Today'],
    'order.desc': ['新しい順', 'Newest'],
    'order.asc': ['古い順', 'Oldest'],
    'filter.ai': ['制作AI', 'AI'],
    'filter.genre': ['ジャンル', 'Genre'],
    'empty.month': ['この月の作品はまだありません。', 'No games this month yet.'],
    'empty.filter': ['該当するゲームがありません。', 'No matching games.'],
    // ゲームページ
    'back': ['← カレンダー', '← Calendar'],
    'btn.focus': ['▶ 操作する（フォーカス）', '▶ Focus game'],
    'btn.reload': ['↻ 最初から', '↻ Restart'],
    'btn.full': ['⛶ 全画面', '⛶ Fullscreen'],
    'btn.open': ['↗ 単独で開く', '↗ Open alone'],
    'hint.focus': ['キーボードで遊ぶときは、まずゲーム画面をクリックしてください', 'Click the game first to use the keyboard'],
    'sec.about': ['どんなゲーム？', 'About this game'],
    'sec.versus': ['AI vs 人間', 'AI vs Humans'],
    'versus.ai': ['AIの自己評価', 'AI self-score'],
    'versus.none': ['（まだありません）', '(none yet)'],
    'versus.note': ['右端の数値は「人間 − AI」。プラスなら人間の方が高く評価しています。', 'The right column is "humans − AI". Positive means players rated it higher than the AI did.'],
    'versus.dev': ['{d}で遊べた度', 'Playable on {d}'],
    'versus.players': ['みんな', 'Players'],
    'crit.playable': ['遊べた度', 'Playable'],
    'crit.fun': ['楽しさ', 'Fun'],
    'crit.quality': ['クオリティ', 'Quality'],
    'crit.originality': ['独創性', 'Originality'],
    'crit.overall': ['総合', 'Overall'],
    'ai.self': ['{name} 自己採点', '{name} self-review'],
    'ai.other': ['{name} の採点', 'Review by {name}'],
    'ai.none': ['AIの自己採点はまだありません。', 'No AI self-review yet.'],
    'ai.good': ['良かった点', 'Good'],
    'ai.bad': ['気になった点', 'Issues'],
    'sec.similar': ['ルーツ・類似作品', 'Roots & similar works'],
    'similar.lead': ['アイデアは無から生まれません。AIが自己採点の前に調べた、似ている作品・ルーツになった作品です（独創性の採点に反映）。', 'Ideas never come from nothing. These are similar works and roots the AI researched before scoring (reflected in the originality score).'],
    'similar.level': ['類似度 {v}', 'Similarity: {v}'],
    'similar.none': ['目立った類似作品は見つかりませんでした。', 'No notably similar works were found.'],
    'similar.method': ['調査方法', 'Method'],
    'sim.高': ['高', 'High'], 'sim.中': ['中', 'Medium'], 'sim.低': ['低', 'Low'],
    'sec.rate': ['このゲームを評価する', 'Rate this game'],
    'rate.device': ['遊んだ端末', 'Device you played on'],
    'rate.dev.pc': ['PC', 'PC'],
    'rate.dev.mobile': ['スマホ・タブレット', 'Phone / tablet'],
    'rate.playable': ['問題なく遊べましたか？', 'Could you play it without problems?'],
    'playable.2': ['問題なく遊べた', 'Played fine'],
    'playable.1': ['不具合はあるが遊べた', 'Playable with bugs'],
    'playable.0': ['遊べなかった', 'Could not play'],
    'rate.fun.sub': ['楽しかったか', 'Was it fun?'],
    'rate.quality.sub': ['見た目・操作感・完成度', 'Look, feel and polish'],
    'rate.originality.sub': ['アイデアの新しさ', 'Freshness of the idea'],
    'rate.comment': ['ひとこと', 'Comment'],
    'rate.comment.sub': ['任意・300字まで・公開されます', 'Optional · up to 300 chars · public'],
    'rate.comment.ph': ['良かった点、バグ、AIへのツッコミなど', 'What you liked, bugs, notes for the AI…'],
    'rate.submit': ['評価を送信', 'Submit rating'],
    'rate.update': ['評価を更新', 'Update rating'],
    'rate.done': ['評価済みです（内容を変えて更新できます）', 'You already rated this (you can update it)'],
    'rate.sending': ['送信中…', 'Sending…'],
    'rate.thanks': ['ありがとうございます！評価を記録しました。', 'Thanks! Your rating was saved.'],
    'rate.err.playable': ['「遊べましたか？」を選んでください', 'Please answer "Could you play it?"'],
    'rate.err.stars': ['楽しさ・クオリティ・独創性の★を選んでください', 'Please rate fun, quality and originality'],
    'cap.1': ['いまいち', 'Poor'], 'cap.2': ['もう少し', 'Fair'], 'cap.3': ['ふつう', 'OK'], 'cap.4': ['良い', 'Good'], 'cap.5': ['とても良い', 'Great'],
    'sec.spec': ['制作情報', 'Build info'],
    'spec.date': ['制作日時', 'Created'],
    'spec.main': ['メイン制作AI', 'Main AI'],
    'spec.via': ['利用環境', 'Run via'],
    'spec.prompt': ['お題', 'Prompt'],
    'spec.pipeline': ['生成方式', 'Pipeline'],
    'spec.duration': ['生成時間', 'Generation time'],
    'spec.platforms': ['対応端末', 'Platforms'],
    'spec.test': ['自動テスト', 'Automated test'],
    'spec.test.pass': ['合格', 'Passed'],
    'spec.test.fail': ['不合格', 'Failed'],
    'spec.test.runs': ['（{n}回目のテストで{r}）', '(on attempt {n})'],
    'spec.code': ['コード', 'Code'],
    'spec.src': ['ソースを見る', 'View source'],
    'spec.src.close': ['ソースを閉じる', 'Hide source'],
    'spec.method': ['自己採点の方法', 'Self-review method'],
    'spec.revisions': ['改訂履歴', 'Revisions'],
    'sec.cost': ['制作コスト', 'Production cost'],
    'cost.tokens': ['使用トークン', 'Tokens used'],
    'cost.in': ['入力', 'Input'],
    'cost.out': ['出力', 'Output'],
    'cost.cw': ['キャッシュ書込', 'Cache write'],
    'cost.cr': ['キャッシュ読込', 'Cache read'],
    'cost.total': ['合計', 'Total'],
    'cost.search': ['Web検索 {n} 回', '{n} web searches'],
    'cost.amount': ['API定価換算', 'At API list price'],
    'cost.fx': ['1ドル = {r}円（{d}時点）', 'USD/JPY {r} ({d})'],
    'cost.paid': ['実際の支払い', 'Actually paid'],
    'cost.method': ['集計方法', 'How measured'],
    'cost.none': ['コストの記録はありません。', 'No cost record.'],
    'cost.note': ['金額は制作時点のAPI定価で換算した参考値です。', 'Amounts are reference values at the API list price at the time of creation.'],
    'sec.playlog': ['AIのプレイログ', 'AI play log'],
    'playlog.lead': ['AIは「時間を止めた画面を見る → 操作を決める → その操作の間だけ時間を進める」を繰り返してプレイしました。PCではキーボードとマウス、スマホでは縦画面・タッチ操作だけで遊んでいます。画像は容量節約のため一部のみ保存しています。', 'The AI played by repeating "look at a frozen frame → choose an input → advance time only during that input". On PC it used keyboard and mouse; on mobile, portrait touch only. Only some screenshots are kept to save space.'],
    'playlog.pc': ['PC（640×400・キーボード／マウス）', 'PC (640×400 · keyboard / mouse)'],
    'playlog.mobile': ['スマホ（360×640 縦・タッチ）', 'Mobile (360×640 portrait · touch)'],
    'playlog.alt': ['ステップ{n}の画面', 'Screen at step {n}'],
    'sec.comments': ['みんなのコメント', 'Comments'],
    'comments.none': ['まだコメントはありません。', 'No comments yet.'],
    'pager.newer': ['← 次の作品：{t}', '← Newer: {t}'],
    'pager.older': ['前の作品：{t} →', 'Older: {t} →'],
    'notfound': ['ゲームが見つかりませんでした。', 'Game not found.'],
    // 統計
    'stats.title': ['実験データ', 'Experiment data'],
    'stats.lead': ['制作AIごとの成績と、AIの自己評価と人間の評価のズレを記録しています。AIモデルの世代が進むにつれて、ここの数字がどう変わるかを見るための場所です。', 'Per-model results and the gap between AI self-scores and player ratings — a place to watch how these numbers change as AI models evolve.'],
    'stats.byai': ['制作AIごとの成績', 'Results by AI model'],
    'th.ai': ['制作AI', 'AI'], 'th.n': ['公開数', 'Games'], 'th.success': ['制作成功率', 'Success rate'], 'th.first': ['一発合格率', 'First-try pass'],
    'th.aiscore': ['AI自己評価', 'AI score'], 'th.human': ['人間の評価', 'Player score'], 'th.gap': ['ギャップ', 'Gap'], 'th.playable': ['遊べた率', 'Playable'],
    'th.votes': ['評価数', 'Ratings'], 'th.cost': ['平均コスト', 'Avg. cost'], 'th.first.date': ['初登場', 'First game'],
    'stats.note': ['一発合格率 = 最初の自動テストで合格した割合。制作成功率 = 公開まで到達した割合（途中で破棄された作品を含めて計算）。ギャップ = 人間の総合評価 − AIの自己評価（人間の評価があるゲームのみ）。平均コスト = API定価換算。', 'First-try pass = share passing the first automated test. Success rate = share that reached publication (including discarded attempts). Gap = player overall − AI self-score (games with ratings only). Avg. cost = at API list price.'],
    'stats.ranking': ['ランキング', 'Ranking'],
    'rank.human': ['みんなの評価', 'Players'], 'rank.ai': ['AI自己評価', 'AI self-score'], 'rank.gap': ['評価のズレ', 'Biggest gap'],
    'rank.empty': ['人間の評価が集まると表示されます。', 'Shown once player ratings come in.'],
    'stats.scatter': ['AIの自己評価 × 人間の評価', 'AI self-score × player score'],
    'stats.scatter.tag': ['各点 = 1作品', 'one dot = one game'],
    'stats.scatter.note': ['斜線より上 = 人間の方が高評価（AIが謙虚）。斜線より下 = AIの方が高評価（AIが自信過剰）。', 'Above the line: players rated higher (AI was modest). Below: AI rated higher (AI was overconfident).'],
    'stats.scatter.empty': ['人間の評価が集まると、ここに点が表示されます', 'Dots appear here once player ratings come in'],
    'stats.axis.ai': ['AIの自己評価 →', 'AI self-score →'],
    'stats.axis.human': ['人間の評価 →', 'Player score →'],
    'stats.timeline': ['評価の推移', 'Scores over time'],
  };
  const idx = lang === 'ja' ? 0 : 1;
  function t(key, vars) {
    let s = D[key] ? D[key][idx] : key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    return s;
  }
  // 静的HTMLの data-i18n / data-i18n-attr を置き換える
  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.innerHTML = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      for (const pair of el.dataset.i18nAttr.split(';')) { const [attr, key] = pair.split(':'); el.setAttribute(attr, t(key)); }
    });
  }
  // 言語切り替えボタン
  function mountSwitch() {
    const head = document.querySelector('.site-head .wrap');
    if (!head || head.querySelector('.lang-switch')) return;
    head.insertAdjacentHTML('beforeend', `<div class="lang-switch" role="group" aria-label="${t('lang.label')}">
      <button type="button" data-l="ja" aria-pressed="${lang === 'ja'}" lang="ja">日本語</button><button type="button" data-l="en" aria-pressed="${lang === 'en'}" lang="en">EN</button></div>`);
    head.querySelector('.lang-switch').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.dataset.l === lang) return;
      write('agf_lang', b.dataset.l);
      const u = new URL(location.href); u.searchParams.delete('lang');
      location.replace(u.toString());
    });
  }
  // meta の英語版フィールドを取り出す（無ければ日本語にフォールバック）
  const tr = (obj, key) => (lang === 'en' && obj?.i18n?.en?.[key] != null && obj.i18n.en[key] !== '' ? obj.i18n.en[key] : obj?.[key]);

  window.I18N = { lang, t, apply, tr, mountSwitch };
  document.addEventListener('DOMContentLoaded', () => { apply(); mountSwitch(); });
})();
