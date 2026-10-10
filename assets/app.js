// AI GAME FACTORY 共通スクリプト（assets/i18n.js の後に読み込む）
(() => {
  const CFG = window.AGF_CONFIG || {};
  const { lang, t } = window.I18N;
  const EN = lang === 'en';

  // ---------- 小物 ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WEEK = EN ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['日', '月', '火', '水', '木', '金', '土'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const jst = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3);
  const dayKey = (iso) => jst(iso).toISOString().slice(0, 10);
  function fmtDate(iso) {
    if (!iso) return '-';
    const j = jst(iso), p = (n) => String(n).padStart(2, '0');
    return EN ? `${MONTHS[j.getUTCMonth()].slice(0, 3)} ${j.getUTCDate()}, ${j.getUTCFullYear()}` : `${j.getUTCFullYear()}.${p(j.getUTCMonth() + 1)}.${p(j.getUTCDate())}（${WEEK[j.getUTCDay()]}）`;
  }
  const monthLabel = (y, m) => (EN ? `${MONTHS[m - 1]} ${y}` : `${y}年${m}月`);
  const GENRE_EN = { アクション: 'Action', シューティング: 'Shooter', パズル: 'Puzzle', レース: 'Racing', リズム: 'Rhythm', スポーツ: 'Sports', ストラテジー: 'Strategy', アドベンチャー: 'Adventure', その他: 'Other' };
  // 英語名は一覧データ（genreEn）を優先し、無ければ古い対応表を使う
  const genre = (g, en) => (EN ? en || GENRE_EN[g] || g : g);
  const title = (g) => (EN && g.titleEn ? g.titleEn : g.title);
  // 評価は星 1〜5。2026-10-09 までの3段階（AIの自己判定 fun/meh/boring を含む）は ★5 / ★3 / ★1 として扱う
  const STARS_OF_VERDICT = { fun: 5, meh: 3, boring: 1 };
  const aiStars = (r) => (r?.stars != null ? Number(r.stars) : STARS_OF_VERDICT[r?.verdict] ?? null);
  const fmtStars = (v) => (v == null || isNaN(v) ? '–' : Number(v).toFixed(1));
  const pct = (v) => (v == null || isNaN(v) ? '–' : `${Math.round(v)}%`);
  // プレイ時間の表示（秒 → 「1時間12分」「12分」「45秒」）
  function fmtDuration(sec) {
    if (sec == null || isNaN(sec)) return '–';
    const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (EN) return h ? `${h}h ${m}m` : m ? `${m}m` : `${s}s`;
    return h ? `${h}時間${m}分` : m ? `${m}分` : `${s}秒`;
  }
  const kTokens = (n) => (n == null ? '–' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n)));
  const detectDevice = () => (matchMedia('(pointer: coarse)').matches ? 'mobile' : 'pc');

  // ---------- データ ----------
  async function getJson(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  }
  const loadIndex = () => getJson('games/index.json');
  const loadMeta = (id) => getJson(`games/${encodeURIComponent(id)}/meta.json`);

  // ---------- 評価・プレイ記録（Supabase / このブラウザ） ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  function voterId() {
    let id = store.get('agf_voter', null);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });
      store.set('agf_voter', id);
    }
    return id;
  }
  const remote = !!(CFG.supabaseUrl && CFG.supabaseKey);
  async function rpc(fn, body, keepalive = false) {
    const headers = { apikey: CFG.supabaseKey, 'Content-Type': 'application/json' };
    if (CFG.supabaseKey.startsWith('eyJ')) headers.Authorization = `Bearer ${CFG.supabaseKey}`;
    const r = await fetch(`${CFG.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body || {}), keepalive });
    if (!r.ok) throw new Error(`${r.status}`);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }

  const Ratings = {
    remote,
    // このブラウザでの自分の評価 { stars, broken }（古い3段階の記録は星に置き換える）
    mine(gameId) {
      const v = store.get('agf_votes', {})[gameId];
      if (!v) return null;
      if (CFG.ratingsResetAt && (!v.at || v.at < CFG.ratingsResetAt)) return null;   // リセット前の評価は数えない
      return { ...v, stars: v.stars ?? ({ 2: 5, 1: 3, 0: 1 })[v.verdict] ?? null };
    },
    // 全作品の集計 { [id]: { votes, avg, dist[1..5], broken, sessions, avgSeconds, totalSeconds, replayRate } }
    async summary() {
      let rows;
      if (remote) rows = await rpc('get_scores', {});
      else {
        const plays = store.get('agf_plays', {});
        const ids = new Set([...Object.keys(store.get('agf_votes', {})), ...Object.keys(plays)]);
        rows = [...ids].map((game_id) => {
          const v = Ratings.mine(game_id), p = plays[game_id] || { sessions: 0, seconds: 0, replays: 0 };
          const r = { game_id, votes: v?.stars ? 1 : 0, stars_avg: v?.stars ?? null, broken: v?.broken ? 1 : 0, sessions: p.sessions, avg_seconds: p.sessions ? p.seconds / p.sessions : null, total_seconds: p.seconds, replay_rate: p.sessions ? (p.replays / p.sessions) * 100 : null };
          for (let i = 1; i <= 5; i++) r['s' + i] = v?.stars === i ? 1 : 0;
          return r;
        });
      }
      const out = {};
      for (const r of rows || []) {
        const n = (x) => (x == null ? null : Number(x));
        // データベースがまだ3段階のとき（移行 SQL の実行前）は、面白い=★5 / まあまあ=★3 / つまらない=★1 として読む
        if (r.stars_avg === undefined && r.fun !== undefined) {
          Object.assign(r, { s5: r.fun, s3: r.meh, s1: r.boring, s2: 0, s4: 0, total_seconds: (n(r.avg_seconds) || 0) * (n(r.sessions) || 0) });
          r.stars_avg = n(r.votes) ? (5 * n(r.fun) + 3 * n(r.meh) + n(r.boring)) / n(r.votes) : null;
        }
        out[r.game_id] = {
          votes: n(r.votes) || 0, avg: n(r.stars_avg), dist: [0, n(r.s1) || 0, n(r.s2) || 0, n(r.s3) || 0, n(r.s4) || 0, n(r.s5) || 0],
          broken: n(r.broken) || 0, sessions: n(r.sessions) || 0, avgSeconds: n(r.avg_seconds), totalSeconds: n(r.total_seconds) || 0, replayRate: n(r.replay_rate),
        };
      }
      return out;
    },
    // stars: 1〜5（「うまく動かなかった」の報告だけのときは null）
    async submit(gameId, { stars = null, broken = false, plays = 0, seconds = 0 }) {
      const device = detectDevice();
      if (remote) {
        const base = { p_game_id: gameId, p_voter_id: voterId(), p_device: device, p_broken: broken, p_plays: plays, p_seconds: Math.round(seconds) };
        try { await rpc('submit_rating', { ...base, p_stars: stars }); }
        // データベースがまだ3段階のとき（移行 SQL の実行前）は、3段階に直して送る
        catch (e) { await rpc('submit_rating', { ...base, p_verdict: stars == null ? null : stars >= 4 ? 2 : stars === 3 ? 1 : 0 }); }
      }
      const all = store.get('agf_votes', {}); all[gameId] = { stars, broken, at: new Date().toISOString() }; store.set('agf_votes', all);
    },
    // 1回の訪問ごとのプレイ回数と時間（遊ぶ人には見えない計測）
    logPlay(gameId, plays, seconds) {
      if (!plays && seconds < 3) return;
      const all = store.get('agf_plays', {});
      const p = (all[gameId] ||= { sessions: 0, seconds: 0, replays: 0 });
      p.sessions++; p.seconds += seconds; if (plays >= 2) p.replays++;
      store.set('agf_plays', all);
      if (remote) rpc('log_play', { p_game_id: gameId, p_voter_id: voterId(), p_device: detectDevice(), p_plays: plays, p_seconds: Math.round(seconds) }, true).catch(() => {});
    },
  };

  // 星の表示（平均に合わせて途中まで塗る）
  const starIcons = (v, cls = '') => `<span class="stars ${cls}" style="--v:${v == null ? 0 : (Math.max(0, Math.min(5, v)) / 5) * 100}%" aria-hidden="true">★★★★★</span>`;
  // 一覧用の1行: ★★★★☆ 4.2 (12人)
  function starLine(s) {
    if (!s || !s.votes) return `<span class="muted">${t('unrated')}</span>`;
    return `<span class="starline" role="img" aria-label="${t('stars.avg', { v: fmtStars(s.avg) })} ${t('votes', { n: s.votes })}">${starIcons(s.avg)}<b>${fmtStars(s.avg)}</b><span class="muted">(${t('votes', { n: s.votes })})</span></span>`;
  }
  // 作品ページ用: 平均と ★5〜★1 の人数の内訳
  function starBar(s) {
    if (!s || !s.votes) return `<span class="muted">${t('unrated')}</span>`;
    const max = Math.max(...s.dist.slice(1), 1);
    return `<div class="starsum"><div class="starsum-avg"><b>${fmtStars(s.avg)}</b>${starIcons(s.avg)}<span class="muted">${t('votes', { n: s.votes })}</span></div>
      <div class="starsum-dist">${[5, 4, 3, 2, 1].map((i) => `<div class="srow"><span>★${i}</span><i><b style="width:${(s.dist[i] / max) * 100}%"></b></i><span>${s.dist[i]}</span></div>`).join('')}</div></div>`;
  }
  function modeBanner(el) {
    if (el && !remote) { el.textContent = t('banner.demo'); el.hidden = false; }
  }

  window.AGF = { lang, t, EN, CFG, esc, fmtDate, monthLabel, dayKey, WEEK, genre, title, aiStars, fmtStars, fmtDuration, pct, kTokens, detectDevice, loadIndex, loadMeta, Ratings, starIcons, starLine, starBar, modeBanner, store };
})();
