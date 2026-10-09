/* ==========================================================================
   WLSA Sound Art Club — Shanghai Sound Map: the accessible list view (#/list).
   First-class equivalent of every map capability — "the map is an
   enhancement, never the only path." Keyboard-operable, screen-reader friendly.
   ========================================================================== */
(function () {
  'use strict';

  var S = window.SoundMap;
  var PAGE_SIZE = 20;

  function fmtDate(d) {
    return d ? String(d).slice(0, 10) : '';
  }

  function cardHtml(sound) {
    var t = S.label('time', sound.time_of_day);
    var c = S.label('category', sound.category);
    return '<article class="card list-item">'
      + '<span class="time-dot list-dot" style="--dot-color:' + S.TIME_COLORS[sound.time_of_day] + '"></span>'
      + '<div>'
      + '<h3>' + S.esc(sound.title_en) + '</h3>'
      + '<div class="list-cn">' + S.esc(sound.title_cn) + '</div>'
      + '<div class="list-meta">' + S.esc(c.cn) + ' · ' + S.esc(t.cn)
      + (sound.place_cn ? ' · ' + S.esc(sound.place_cn) : '')
      + ' · ' + S.esc(fmtDate(sound.recorded_on)) + '</div>'
      + '<div class="list-actions">'
      + '<button type="button" class="btn btn-sm btn-primary" data-action="play" data-id="' + S.esc(sound.id) + '">Play 播放</button>'
      + '<a class="btn btn-sm" href="#/sound/' + S.esc(sound.id) + '">Story 故事</a>'
      + '</div>'
      + (sound.audio_description_cn
        ? '<details><summary>音频描述 · Audio description for visually impaired listeners</summary>'
          + '<div class="audio-desc">' + S.esc(sound.audio_description_cn) + '</div></details>'
        : '')
      + '</div></article>';
  }

  function render(el, params) {
    var page = 0;
    var total = 0;
    var destroyed = false;

    el.innerHTML =
      '<div class="view-content">'
      + '<h1 class="view-title">All sounds <span class="nav-cn">所有声音</span></h1>'
      + '<p class="view-subtitle">Browse by time of day or theme — or use the map. 按时间段或主题浏览，也可以使用地图。</p>'
      + '<div id="list-chips"></div>'
      + '<div id="list-count" class="map-count" style="display:inline-block;margin-bottom:12px" hidden></div>'
      + '<div id="list-items"></div>'
      + '<div id="list-empty" class="card" hidden style="text-align:center">'
      + '  <h2 id="list-empty-title" style="font-family:var(--font-display)">No sounds yet 还没有声音</h2>'
      + '  <p id="list-empty-text" style="color:var(--body);margin:8px 0 14px">Check back soon. 敬请期待。</p>'
      + '  <div id="list-empty-actions"></div>'
      + '</div>'
      + '<div class="load-more-wrap"><button id="list-more" class="btn" type="button" hidden>Load more · 加载更多</button></div>'
      + '</div>';

    var chipsEl = el.querySelector('#list-chips');
    var itemsEl = el.querySelector('#list-items');
    var countEl = el.querySelector('#list-count');
    var emptyEl = el.querySelector('#list-empty');
    var moreBtn = el.querySelector('#list-more');

    function query() {
      if (!S.sb) return null;
      var q = S.sb.from('sounds').select('*', { count: 'exact' })
        .eq('status', 'approved')
        .order('recorded_on', { ascending: false });
      var t = Object.keys(S.state.filters.timeOfDay);
      var c = Object.keys(S.state.filters.category);
      if (t.length) q = q.in('time_of_day', t);
      if (c.length) q = q.in('category', c);
      return q.range(0, (page + 1) * PAGE_SIZE - 1);
    }

    async function refresh() {
      if (!S.configured()) {
        itemsEl.innerHTML = '';
        emptyEl.hidden = false;
        emptyEl.querySelector('#list-empty-title').textContent = 'Not configured 尚未配置';
        emptyEl.querySelector('#list-empty-text').textContent = 'Fill in config.js first (see playbooks/launch-soundmap.md). 请先填写 config.js。';
        emptyEl.querySelector('#list-empty-actions').innerHTML = '';
        moreBtn.hidden = true;
        return;
      }
      var res = await query();
      if (destroyed) return;
      if (res.error) {
        S.showBanner('Could not load sounds. ' + res.error.message + ' · 无法加载声音。', 'error');
        return;
      }
      total = res.count;
      var rows = res.data || [];
      itemsEl.innerHTML = rows.map(cardHtml).join('');

      countEl.hidden = false;
      countEl.textContent = 'Showing ' + rows.length + ' of ' + total + ' · 显示 ' + rows.length + ' / ' + total + ' 个声音';

      if (rows.length === 0) {
        emptyEl.hidden = false;
        if (total === 0) {
          emptyEl.querySelector('#list-empty-title').textContent = 'No sounds yet 还没有声音';
          emptyEl.querySelector('#list-empty-text').textContent = 'Be the first to add a sound. 来添加第一个声音吧。';
          emptyEl.querySelector('#list-empty-actions').innerHTML = S.isMember()
            ? '<a class="btn btn-primary" href="#/submit">Add a sound · 添加声音</a>'
            : '<p style="color:var(--muted)">Check back soon. 敬请期待。</p>';
        } else {
          emptyEl.querySelector('#list-empty-title').textContent = 'No matches 没有匹配的声音';
          emptyEl.querySelector('#list-empty-text').textContent = 'Try different filters. 试试其他筛选条件。';
          emptyEl.querySelector('#list-empty-actions').innerHTML = '';
        }
      } else {
        emptyEl.hidden = true;
      }

      moreBtn.hidden = rows.length === 0 || rows.length >= total;
    }

    moreBtn.addEventListener('click', function () {
      page += 1;
      refresh();
    });

    window.addEventListener('soundmap:filters', onFilters);
    function onFilters() {
      page = 0;
      S.renderFilterChips(chipsEl);
      refresh();
    }

    S.renderFilterChips(chipsEl);
    refresh();

    return function destroy() {
      destroyed = true;
      window.removeEventListener('soundmap:filters', onFilters);
    };
  }

  S.registerView('list', { render: render });
})();
