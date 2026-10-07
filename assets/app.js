// AI GAME FACTORY 共通スクリプト（assets/i18n.js の後に読み込む）
(() => {
  const CFG = window.AGF_CONFIG || {};
  const { lang, t } = window.I18N;
  const EN = lang === 'en';

  // ---------- 小物 ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WEEK = EN ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['日', '月', '火', '水', '木', '金', '土'];
  const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // 日時は日本時間（JST）で表示する
  function fmtDate(iso, withTime = false) {
    if (!iso) return '-';
    const j = new Date(new Date(iso).getTime() + 9 * 3600e3);
    const p = (n) => String(n).padStart(2, '0');
    let s = EN
      ? `${MONTH[j.getUTCMonth()]} ${j.getUTCDate()}, ${j.getUTCFullYear()} (${WEEK[j.getUTCDay()]})`
      : `${j.getUTCFullYear()}.${p(j.getUTCMonth() + 1)}.${p(j.getUTCDate())} (${WEEK[j.getUTCDay()]})`;
    if (withTime) s += ` ${p(j.getUTCHours())}:${p(j.getUTCMinutes())}${EN ? ' JST' : ''}`;
    return s;
  }
  const monthLabel = (y, m) => (EN ? `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}` : `${y}年${m}月`);
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const overallOf = (s) => (s && s.fun != null ? (Number(s.fun) + Number(s.quality) + Number(s.originality)) / 3 : null);
  const num = (v, d = 1) => (v == null || isNaN(v) ? '–' : Number(v).toFixed(d));

  const GENRE_EN = { アクション: 'Action', シューティング: 'Shooter', パズル: 'Puzzle', レース: 'Racing', リズム: 'Rhythm', スポーツ: 'Sports', ストラテジー: 'Strategy', アドベンチャー: 'Adventure', その他: 'Other' };
  const genre = (g) => (EN ? GENRE_EN[g] || g : g);
  const title = (g) => (EN && g.titleEn ? g.titleEn : g.title);

  // 金額: 日本語は円、英語はドル（API定価換算）
  function money(c) {
    if (!c) return '–';
    if (EN) return c.usd < 0.01 ? '<$0.01' : `$${c.usd.toFixed(2)}`;
    return `¥${Math.round(c.jpy).toLocaleString('ja-JP')}`;
  }
  const tokens = (n) => (n == null ? '–' : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n)));

  const VENDORS = { anthropic: '#e08a6a', openai: '#3fbf95', google: '#6fa0ff', meta: '#5aa7ff' };
  const vendorColor = (v) => VENDORS[String(v || '').toLowerCase()] || '#b49cff';
  function platformBadges(p, langs) {
    if (!p) return '';
    const jaOnly = langs && !langs.includes('en') ? `<span class="lang-chip">${t('lang.jaonly')}</span>` : '';
    return jaOnly + `<span class="plats">${['pc', 'mobile'].map((k) => `<span class="plat ${p[k] ? 'ok' : 'ng'}" title="${t('plat.' + k)}: ${t(p[k] ? 'plat.ok' : 'plat.ng')}">${t('plat.' + k)}</span>`).join('')}</span>`;
  }
  const detectDevice = () => (matchMedia('(pointer: coarse)').matches ? 'mobile' : 'pc');
  function aiChip(ai) {
    if (!ai) return '';
    return `<span class="ai-chip" title="${esc(ai.vendor || '')} ${esc(ai.model || '')}"><i style="background:${vendorColor(ai.vendor)}"></i>${esc(ai.name || ai.model)}</span>`;
  }

  // ---------- データ ----------
  async function getJson(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  }
  const loadIndex = () => getJson('games/index.json');
  const loadMeta = (id) => getJson(`games/${encodeURIComponent(id)}/meta.json`);

  // ---------- 評価（Supabase / ローカル） ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  function voterId() {
    let id = store.get('agf_voter', null);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
      store.set('agf_voter', id);
    }
    return id;
  }
  const remote = !!(CFG.supabaseUrl && CFG.supabaseKey);
  async function rpc(fn, body) {
    const headers = { apikey: CFG.supabaseKey, 'Content-Type': 'application/json' };
    if (CFG.supabaseKey.startsWith('eyJ')) headers.Authorization = `Bearer ${CFG.supabaseKey}`;
    const r = await fetch(`${CFG.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    if (!r.ok) throw new Error(`Rating server error (${r.status}): ${await r.text()}`);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }

  const Ratings = {
    mode: remote ? 'shared' : 'local',
    myVote: (gameId) => store.get('agf_my_votes', {})[gameId] || null,
    // 全ゲームの集計 { [gameId]: { votes, playable(0-100%), fun, quality, originality, overall, byDevice } }
    async summary() {
      let rows;
      if (remote) {
        rows = await rpc('get_scores', {});
      } else {
        const mine = store.get('agf_my_votes', {});
        rows = Object.entries(mine).map(([game_id, v]) => ({ game_id, votes: 1, playable_rate: (v.playable / 2) * 100, fun: v.fun, quality: v.quality, originality: v.originality,
          votes_pc: v.device === 'mobile' ? 0 : 1, votes_mobile: v.device === 'mobile' ? 1 : 0,
          playable_pc_rate: v.device === 'mobile' ? null : (v.playable / 2) * 100, playable_mobile_rate: v.device === 'mobile' ? (v.playable / 2) * 100 : null }));
      }
      const out = {};
      for (const r of rows || []) {
        const n = (x) => (x == null ? null : Number(x));
        const s = { votes: Number(r.votes), playable: n(r.playable_rate), fun: n(r.fun), quality: n(r.quality), originality: n(r.originality) };
        s.overall = overallOf(s);
        s.byDevice = {
          pc: { votes: Number(r.votes_pc || 0), playable: n(r.playable_pc_rate) },
          mobile: { votes: Number(r.votes_mobile || 0), playable: n(r.playable_mobile_rate) },
        };
        out[r.game_id] = s;
      }
      return out;
    },
    async submit(gameId, v) {
      const vote = { device: v.device === 'mobile' ? 'mobile' : 'pc', playable: v.playable, fun: v.fun, quality: v.quality, originality: v.originality, comment: (v.comment || '').slice(0, 300), at: new Date().toISOString() };
      if (remote) {
        await rpc('submit_rating', { p_game_id: gameId, p_voter_id: voterId(), p_playable: vote.playable, p_fun: vote.fun, p_quality: vote.quality, p_originality: vote.originality, p_comment: vote.comment || null, p_device: vote.device });
      }
      const mine = store.get('agf_my_votes', {}); mine[gameId] = vote; store.set('agf_my_votes', mine);
    },
    async comments(gameId) {
      if (remote) return (await rpc('get_comments', { p_game_id: gameId, p_limit: 30 })) || [];
      const v = Ratings.myVote(gameId);
      return v && v.comment ? [{ comment: v.comment, device: v.device, playable: v.playable, fun: v.fun, quality: v.quality, originality: v.originality, created_at: v.at }] : [];
    },
  };

  const playableLabel = (n) => t('playable.' + n);
  function modeBanner(el) {
    if (el && Ratings.mode === 'local') { el.innerHTML = t('banner.demo'); el.hidden = false; }
  }

  window.AGF = { lang, t, EN, store, platformBadges, detectDevice, esc, fmtDate, monthLabel, WEEK, avg, overallOf, num, genre, title, money, tokens, vendorColor, aiChip, loadIndex, loadMeta, Ratings, playableLabel, modeBanner, CFG };
})();
