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
    'headline': ['ここはAIが勝手に\nゲームを作り続ける工場。', 'A factory where AI keeps\nmaking games on its own.'],
    'tagline': ['毎日200KB以内のゲームをAIが勝手に企画→制作→公開しつづける場所。\nいつの日か人はAIが作ったゲームを面白いと思う日がくるのでしょうか？', 'Every day, AI plans, builds and publishes a game under 200KB on its own.\nWill the day ever come when people find AI-made games fun?'],
    'nav.stats': ['目的', 'Purpose'],
    'nav.about': ['この実験について', 'About'],
    'banner.demo': ['デモモード: 評価はこのブラウザ内にのみ保存されます', 'Demo mode: ratings are saved only in this browser'],
    'loading': ['読み込み中…', 'Loading…'],
    'err.index': ['一覧を読み込めませんでした。', 'Could not load the list.'],
    'empty': ['最初の作品を準備中です。', 'The first games are on their way.'],
    'view.list': ['一覧', 'List'],
    'view.cal': ['カレンダー', 'Calendar'],
    'month.prev': ['前の月', 'Previous month'],
    'month.next': ['次の月', 'Next month'],
    'count.games': ['{n}本', '{n} games'],
    'cal.none': ['この月の作品はまだありません。', 'No games this month yet.'],
    'day.n': ['観測 {n} 日目', 'Day {n}'],
    'by': ['作: {ai}', 'by {ai}'],
    'votes': ['{n}人', '{n} votes'],
    'unrated': ['まだ評価なし', 'No ratings yet'],
    // 評価
    'v.2': ['面白い', 'Fun'],
    'v.1': ['まあまあ', 'So-so'],
    'v.0': ['つまらない', 'Boring'],
    'v.broken': ['うまく動かなかった', "It didn't work"],
    'rate.q': ['遊んでみてどうでした？', 'How was it?'],
    'rate.later': ['あとで', 'Later'],
    'rate.thanks': ['ありがとう！', 'Thanks!'],
    'rate.change': ['評価を変える', 'Change rating'],
    'rate.broken.done': ['報告ありがとう！', 'Thanks for the report!'],
    'rate.err': ['送信できませんでした', 'Could not send'],
    // ゲームページ
    'play': ['あそぶ', 'Play'],
    'details': ['詳細', 'Details'],
    'close': ['もどる', 'Back'],
    'back': ['← 一覧', '← All games'],
    'result.title': ['みんなの評価', 'What players think'],
    'result.ai': ['作ったAI自身の判定', 'The AI\'s own verdict'],
    'result.hidden': ['評価すると、みんなの結果とAIの自己判定が見られます。', 'Rate it to see what others and the AI itself thought.'],
    'works.ok': ['問題なく動いた', 'worked fine'],
    'works.buggy': ['不具合はあるが遊べた', 'playable with bugs'],
    'works.broken': ['遊べなかった', 'not playable'],
    'sec.more': ['このゲームの仕様を見る', 'See how this game was made'],
    'sec.concept': ['AIの企画意図', 'The AI\'s design intent'],
    'sec.libs': ['使用ライブラリ', 'Libraries used'],
    'libs.none': ['なし（ライブラリを使わず、素の JavaScript だけで制作）', 'None (plain JavaScript only)'],
    'sec.metrics': ['制作記録', 'Production record'],
    'sec.similar': ['ルーツ・似ている作品（AI調べ）', 'Roots & similar works (AI research)'],
    'sec.playlog': ['AIのテストプレイ', 'The AI\'s test play'],
    'm.model': ['制作AI', 'AI model'],
    'm.effort': ['思考の深さ設定', 'Effort setting'],
    'm.thinking': ['思考量', 'Thinking'],
    'm.output': ['出力量', 'Output'],
    'm.turns': ['応答回数', 'Turns'],
    'm.tools': ['ツール使用', 'Tool calls'],
    'm.runs': ['テスト回数', 'Test runs'],
    'm.minutes': ['制作時間', 'Time'],
    'm.code': ['ゲームの容量', 'Game size'],
    'm.tokens': ['{n} トークン', '{n} tokens'],
    'm.times': ['{n} 回', '{n}'],
    'm.min': ['{n} 分', '{n} min'],
    'm.note': ['トークン数はモデルの世代で数え方が変わることがあるため、世代間の比較は手数・時間も合わせて見てください。', 'Token counts can shift between model generations; compare turns and time too.'],
    'sim.高': ['類似度 高', 'High'], 'sim.中': ['類似度 中', 'Medium'], 'sim.低': ['類似度 低', 'Low'],
    'similar.none': ['目立った類似作品は見つかりませんでした。', 'No notably similar works were found.'],
    'notfound': ['ゲームが見つかりませんでした。', 'Game not found.'],
    'pc.note': ['スマホ向けのゲームです。PCではマウスで遊べます。', 'Made for phones. On a PC, use your mouse.'],
    // 観測データ
    'stats.title': ['観測データ', 'Observation data'],
    'stats.status.none': ['まだ観測されていません', 'Not observed yet'],
    'stats.status.yes': ['観測されました', 'Observed'],
    'stats.line': ['判定ライン: 評価{n}人以上で「面白い」が{p}%以上の作品', 'Line: a game with {n}+ ratings and {p}%+ "fun"'],
    'stats.first': ['最初の作品: {t}（{d}）', 'First: {t} ({d})'],
    'stats.chart': ['作品ごとの「面白い」の割合', '"Fun" share per game'],
    'stats.chart.empty': ['評価が集まるとここに表示されます', 'Shown once ratings come in'],
    'stats.byai': ['AIごとの記録', 'By AI model'],
    'th.ai': ['AI', 'AI'], 'th.games': ['作品', 'Games'], 'th.votes': ['評価', 'Ratings'], 'th.fun': ['面白い', 'Fun'],
    'th.meh': ['まあまあ', 'So-so'], 'th.boring': ['つまらない', 'Boring'], 'th.broken': ['動かない報告', 'Broken'],
    'th.agree': ['AI判定の一致', 'AI agrees'], 'th.thinking': ['平均 思考量', 'Avg thinking'], 'th.turns': ['平均 応答回数', 'Avg turns'],
    'th.minutes': ['平均 制作時間', 'Avg time'], 'th.playtime': ['平均 プレイ時間', 'Avg play time'], 'th.replay': ['リプレイ率', 'Replay rate'],
    'stats.note': ['AI判定の一致 = AIの自己判定と、人間の評価で最も多かった答えが一致した割合。リプレイ率 = 1回の訪問で2回以上遊んだ割合。', 'AI agrees = share of games where the AI\'s verdict matched the players\' most common answer. Replay rate = share of visits with 2+ plays.'],
  };
  const idx = lang === 'ja' ? 0 : 1;
  function t(key, vars) {
    let s = D[key] ? D[key][idx] : key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    return s;
  }
  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      for (const pair of el.dataset.i18nAttr.split(';')) { const [attr, key] = pair.split(':'); el.setAttribute(attr, t(key)); }
    });
  }
  function mountSwitch() {
    const slot = document.querySelector('.lang-slot');
    if (!slot || slot.childElementCount) return;
    slot.innerHTML = `<div class="lang-switch" role="group" aria-label="Language"><button type="button" data-l="ja" aria-pressed="${lang === 'ja'}" lang="ja">日本語</button><button type="button" data-l="en" aria-pressed="${lang === 'en'}" lang="en">EN</button></div>`;
    slot.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.dataset.l === lang) return;
      write('agf_lang', b.dataset.l);
      const u = new URL(location.href); u.searchParams.delete('lang');
      location.replace(u.toString());
    });
  }
  const tr = (obj, key) => (lang === 'en' && obj?.i18n?.en?.[key] ? obj.i18n.en[key] : obj?.[key]);
  window.I18N = { lang, t, apply, tr, mountSwitch };
  document.addEventListener('DOMContentLoaded', () => { apply(); mountSwitch(); });
})();
