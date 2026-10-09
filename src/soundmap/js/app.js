/* ==========================================================================
   WLSA Sound Art Club — Shanghai Sound Map: app shell
   Hash router, shared state, i18n helpers, filter chips, banner, auth boot.
   Every other module registers its views via SoundMap.registerView().
   ========================================================================== */
(function () {
  'use strict';

  var CFG = window.SOUNDMAP_CONFIG || {};

  // Categories: keep in sync with src/game/data/sounds.json —
  // tests/check_soundmap.py fails the build if these drift.
  var CATEGORIES = [
    { key: 'transport', en: 'Transport', cn: '交通' },
    { key: 'cries', en: 'Street Cries', cn: '叫卖' },
    { key: 'market', en: 'Market & Food', cn: '市场' },
    { key: 'nature', en: 'Water & Nature', cn: '水与自然' },
    { key: 'neighborhood', en: 'Neighborhood', cn: '里弄' },
    { key: 'festival', en: 'Festival', cn: '节庆' },
    { key: 'daily', en: 'Daily City', cn: '日常' },
    { key: 'crafts', en: 'Crafts', cn: '手艺' }
  ];

  // "Hearing a Day in Shanghai" slots
  var TIMES = [
    { key: 'early_morning', en: 'Early morning', cn: '清晨' },
    { key: 'morning', en: 'Morning', cn: '上午' },
    { key: 'afternoon', en: 'Afternoon', cn: '下午' },
    { key: 'evening', en: 'Evening', cn: '傍晚' },
    { key: 'night', en: 'Night', cn: '夜晚' }
  ];

  var TIME_COLORS = {
    early_morning: '#2E9E5B',
    morning: '#E8590C',
    afternoon: '#0E86C8',
    evening: '#E04028',
    night: '#211A12'
  };

  var state = {
    user: null,      // Supabase auth user
    profile: null,   // public.profiles row {role, display_name}
    filters: { timeOfDay: {}, category: {} },  // key -> true
    approved: null,  // cached approved sounds
    approvedAt: 0
  };

  // Supabase client (null while config.js still has placeholders)
  var sb = null;
  if (window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_URL.indexOf('YOUR-') === -1) {
    try {
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
    } catch (e) { sb = null; }
  }

  var main = document.getElementById('main');
  var liveRegion = document.getElementById('live-region');
  var banner = document.getElementById('banner');
  var bannerText = document.getElementById('banner-text');
  var bannerTimer = null;

  // View modules loaded before this file and registered into the bootstrap
  // registry (see the inline script in index.html).
  var views = (window.SoundMap && window.SoundMap.__views) || {};
  var current = null;

  /* ------------------------------------------------------------- helpers -- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function label(kind, key) {
    var list = kind === 'category' ? CATEGORIES : (kind === 'time' ? TIMES : []);
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i];
    }
    return { key: key, en: key, cn: key };
  }

  function announce(msg) {
    if (!liveRegion) return;
    liveRegion.textContent = '';
    setTimeout(function () { liveRegion.textContent = msg; }, 60);
  }

  function showBanner(msg, type) {
    if (!banner) return;
    bannerText.textContent = msg;
    banner.className = 'banner banner-' + (type || 'info');
    banner.hidden = false;
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { banner.hidden = true; }, 9000);
  }

  function statusBadge(status) {
    var map = { pending: 'Pending 待审核', approved: 'Live 已发布', rejected: 'Rejected 已退回' };
    return '<span class="badge badge-' + esc(status) + '">' + esc(map[status] || status) + '</span>';
  }

  function configured() { return !!sb; }

  function isAdmin() { return !!(state.profile && state.profile.role === 'admin'); }
  function isMember() {
    return !!(state.profile && (state.profile.role === 'member' || state.profile.role === 'admin'));
  }

  /* -------------------------------------------------------------- data ---- */

  async function loadApprovedSounds(force) {
    if (!sb) return [];
    if (!force && state.approved && Date.now() - state.approvedAt < 30000) return state.approved;
    var res = await sb.from('sounds')
      .select('*')
      .eq('status', 'approved')
      .order('recorded_on', { ascending: false });
    if (res.error) {
      showBanner('Could not load sounds. ' + res.error.message + ' · 无法加载声音，请稍后再试。', 'error');
      return state.approved || [];
    }
    state.approved = res.data || [];
    state.approvedAt = Date.now();
    return state.approved;
  }

  function findSound(id) {
    var rows = state.approved || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id) return rows[i];
    }
    return null;
  }

  function filterSounds(rows) {
    var t = Object.keys(state.filters.timeOfDay);
    var c = Object.keys(state.filters.category);
    return (rows || []).filter(function (s) {
      if (t.length && t.indexOf(s.time_of_day) === -1) return false;
      if (c.length && c.indexOf(s.category) === -1) return false;
      return true;
    });
  }

  /* --------------------------------------------------------- filter chips -- */

  function renderFilterChips(el) {
    var html = '<div class="chips" role="group" aria-label="Time of day filter 时间段筛选">';
    TIMES.forEach(function (t) {
      var on = !!state.filters.timeOfDay[t.key];
      html += '<button type="button" class="chip" data-chip-time="' + esc(t.key) + '" aria-pressed="' + on + '">'
        + '<span class="time-dot" style="--dot-color:' + TIME_COLORS[t.key] + '"></span>'
        + esc(t.en) + ' <span class="chip-cn">' + esc(t.cn) + '</span></button>';
    });
    html += '</div><div class="chips" role="group" aria-label="Category filter 分类筛选">';
    CATEGORIES.forEach(function (c) {
      var on = !!state.filters.category[c.key];
      html += '<button type="button" class="chip" data-chip-cat="' + esc(c.key) + '" aria-pressed="' + on + '">'
        + esc(c.en) + ' <span class="chip-cn">' + esc(c.cn) + '</span></button>';
    });
    html += '</div>';
    el.innerHTML = html;

    el.querySelectorAll('[data-chip-time]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var k = btn.getAttribute('data-chip-time');
        if (state.filters.timeOfDay[k]) delete state.filters.timeOfDay[k];
        else state.filters.timeOfDay[k] = true;
        window.dispatchEvent(new CustomEvent('soundmap:filters'));
      });
    });
    el.querySelectorAll('[data-chip-cat]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var k = btn.getAttribute('data-chip-cat');
        if (state.filters.category[k]) delete state.filters.category[k];
        else state.filters.category[k] = true;
        window.dispatchEvent(new CustomEvent('soundmap:filters'));
      });
    });
  }

  /* ---------------------------------------------------------------- router -- */

  function registerView(name, view) { views[name] = view; }

  function navigate(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  function parseHash() {
    var h = (location.hash || '#/').replace(/^#\/?/, '');
    var q = h.indexOf('?');
    var path = q === -1 ? h : h.slice(0, q);
    var query = q === -1 ? '' : h.slice(q + 1);
    var parts = path.split('/').filter(Boolean);
    return { name: parts[0] || 'map', id: parts[1] || null, query: query };
  }

  function guard(name) {
    if (name === 'login' || name === 'signup') {
      if (state.user) {
        // A freshly signed-up (role 'pending') user lands on the
        // "waiting for admin approval" screen, not silently on the map.
        if (state.profile && state.profile.role === 'pending') return 'pending';
        return 'map';
      }
    }
    if (name === 'pending') {
      if (!state.user) return 'login';
      if (!(state.profile && state.profile.role === 'pending')) return 'map';
    }
    if (name === 'submit' || name === 'submissions') {
      if (!state.user) return 'login';
      if (state.profile && state.profile.role === 'pending') return 'pending';
    }
    if (name === 'admin') {
      if (!state.user) return 'login';
      if (!isAdmin()) return 'map';
    }
    return name;
  }

  function updateNav() {
    var show = {
      map: true, list: true, login: !state.user,
      pending: !!(state.user && state.profile && state.profile.role === 'pending'),
      submit: isMember(), submissions: isMember(), admin: isAdmin()
    };
    document.querySelectorAll('.nav [data-nav]').forEach(function (a) {
      var k = a.getAttribute('data-nav');
      if (show[k] === false) { a.hidden = true; } else { a.hidden = !(k in show) || !show[k]; }
    });
    document.getElementById('logout-btn').hidden = !state.user;
    setNavActive(current ? current.name : 'map');
  }

  function setNavActive(name) {
    document.querySelectorAll('.nav [data-nav]').forEach(function (a) {
      var on = a.getAttribute('data-nav') === name || (name === 'list' && a.getAttribute('data-nav') === 'list');
      a.classList.toggle('is-active', on);
    });
  }

  function route() {
    var r = parseHash();
    var name = guard(r.name);
    if (!views[name]) name = 'map';

    if (current && current.destroy) {
      try { current.destroy(); } catch (e) { /* noop */ }
    }
    current = { name: name };

    var destroy = null;
    try { destroy = views[name].render(main, r) || null; } catch (e) {
      main.innerHTML = '<div class="view-content"><div class="card"><p>Something went wrong rendering this page. 页面出错了，请刷新重试。</p></div></div>';
    }
    current.destroy = destroy;
    updateNav();
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------ auth -- */

  async function refreshAuth() {
    if (!sb) { updateNav(); route(); return; }
    var res = await sb.auth.getSession();
    state.user = (res.data && res.data.session) ? res.data.session.user : null;
    state.profile = null;
    if (state.user) {
      var p = await sb.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
      state.profile = p.data || null;
    }
    updateNav();
    window.dispatchEvent(new CustomEvent('soundmap:auth'));
    route();
  }

  /* ------------------------------------------------------- global actions -- */

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    var id = el.getAttribute('data-id');
    if (action === 'play' && id) {
      var s = findSound(id);
      if (s && window.SoundMap.Player) {
        window.SoundMap.Player.toggle(s);
        return;
      }
      // Not in the approved cache (deep link, fresh approval, or a pending row
      // the viewer is allowed to see) — fetch the row directly. RLS decides
      // who may hear it, not this client.
      if (!sb) { showBanner('The site is not configured yet — fill in config.js first. 网站尚未配置，请先填写 config.js。', 'error'); return; }
      sb.from('sounds').select('*').eq('id', id).maybeSingle().then(function (res) {
        if (res.data && window.SoundMap.Player) window.SoundMap.Player.toggle(res.data);
      });
    } else if (action === 'story' && id) {
      navigate('#/sound/' + id);
    }
  });

  /* ------------------------------------------------------------------ boot -- */

  function init() {
    window.addEventListener('hashchange', route);
    if (banner) {
      document.getElementById('banner-close').addEventListener('click', function () {
        banner.hidden = true;
      });
    }
    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        if (sb) sb.auth.signOut().catch(function () { refreshAuth(); });
        else refreshAuth();
      });
    }
    if (sb) {
      sb.auth.onAuthStateChange(function (event) {
        // TOKEN_REFRESHED/USER_UPDATED fire on background refreshes — update
        // the session quietly instead of re-routing, so an in-progress wizard
        // or form is never destroyed mid-edit.
        if (event === 'TOKEN_REFRESHED') {
          sb.auth.getSession().then(function (res) {
            state.user = (res.data && res.data.session) ? res.data.session.user : null;
          });
          return;
        }
        if (event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') return;
        refreshAuth();
      });
    }
    refreshAuth();
  }

  window.SoundMap = window.SoundMap || {};
  Object.assign(window.SoundMap, {
    CFG: CFG,
    sb: sb,
    state: state,
    CATEGORIES: CATEGORIES,
    TIMES: TIMES,
    TIME_COLORS: TIME_COLORS,
    esc: esc,
    label: label,
    announce: announce,
    showBanner: showBanner,
    statusBadge: statusBadge,
    configured: configured,
    isAdmin: isAdmin,
    isMember: isMember,
    loadApprovedSounds: loadApprovedSounds,
    findSound: findSound,
    filterSounds: filterSounds,
    renderFilterChips: renderFilterChips,
    registerView: registerView,
    navigate: navigate,
    refreshAuth: refreshAuth,
    updateNav: updateNav
  });

  init();
})();
