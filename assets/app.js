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
  const genre = (g) => (EN ? GENRE_EN[g] || g : g);
  const title = (g) => (EN && g.titleEn ? g.titleEn : g.title);
  const VERDICT = { fun: 2, meh: 1, boring: 0 };
  const pct = (v) => (v == null || isNaN(v) ? '–' : `${Math.round(v)}%`);
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
    mine: (gameId) => store.get('agf_votes', {})[gameId] || null,
    // 全作品の集計 { [id]: { votes, fun, meh, boring, broken, funRate, sessions, avgSeconds, replayRate } }
    async summary() {
      let rows;
      if (remote) rows = await rpc('get_scores', {});
      else {
        const votes = store.get('agf_votes', {}), plays = store.get('agf_plays', {});
        const ids = new Set([...Object.keys(votes), ...Object.keys(plays)]);
        rows = [...ids].map((game_id) => {
          const v = votes[game_id], p = plays[game_id] || { sessions: 0, seconds: 0, replays: 0 };
          return { game_id, votes: v && v.verdict != null ? 1 : 0, fun: v?.verdict === 2 ? 1 : 0, meh: v?.verdict === 1 ? 1 : 0, boring: v?.verdict === 0 ? 1 : 0, broken: v?.broken ? 1 : 0, sessions: p.sessions, avg_seconds: p.sessions ? p.seconds / p.sessions : null, replay_rate: p.sessions ? (p.replays / p.sessions) * 100 : null };
        });
      }
      const out = {};
      for (const r of rows || []) {
        const n = (x) => (x == null ? null : Number(x));
        const s = { votes: n(r.votes) || 0, fun: n(r.fun) || 0, meh: n(r.meh) || 0, boring: n(r.boring) || 0, broken: n(r.broken) || 0, sessions: n(r.sessions) || 0, avgSeconds: n(r.avg_seconds), replayRate: n(r.replay_rate) };
        s.funRate = s.votes ? (s.fun / s.votes) * 100 : null;
        out[r.game_id] = s;
      }
      return out;
    },
    // verdict: 2=面白い 1=まあまあ 0=つまらない（broken のときは null 可）
    async submit(gameId, { verdict = null, broken = false, plays = 0, seconds = 0 }) {
      const device = detectDevice();
      if (remote) await rpc('submit_rating', { p_game_id: gameId, p_voter_id: voterId(), p_device: device, p_verdict: verdict, p_broken: broken, p_plays: plays, p_seconds: Math.round(seconds) });
      const all = store.get('agf_votes', {}); all[gameId] = { verdict, broken, at: new Date().toISOString() }; store.set('agf_votes', all);
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

  // 評価の内訳バー
  function verdictBar(s, compact = false) {
    if (!s || !s.votes) return `<span class="muted">${t('unrated')}</span>`;
    const w = (n) => (n / s.votes) * 100;
    return `<div class="vbar${compact ? ' compact' : ''}" role="img" aria-label="${t('v.2')} ${pct(w(s.fun))} / ${t('v.1')} ${pct(w(s.meh))} / ${t('v.0')} ${pct(w(s.boring))}">
      <i class="v2" style="width:${w(s.fun)}%"></i><i class="v1" style="width:${w(s.meh)}%"></i><i class="v0" style="width:${w(s.boring)}%"></i></div>
      ${compact ? '' : `<div class="vlegend"><span><b class="d v2"></b>${t('v.2')} ${pct(w(s.fun))}</span><span><b class="d v1"></b>${t('v.1')} ${pct(w(s.meh))}</span><span><b class="d v0"></b>${t('v.0')} ${pct(w(s.boring))}</span><span class="muted">${t('votes', { n: s.votes })}</span></div>`}`;
  }
  function modeBanner(el) {
    if (el && !remote) { el.textContent = t('banner.demo'); el.hidden = false; }
  }

  window.AGF = { lang, t, EN, CFG, esc, fmtDate, monthLabel, dayKey, WEEK, genre, title, VERDICT, pct, kTokens, detectDevice, loadIndex, loadMeta, Ratings, verdictBar, modeBanner, store };
})();
