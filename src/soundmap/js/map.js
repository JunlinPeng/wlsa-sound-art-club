/* ==========================================================================
   WLSA Sound Art Club — Shanghai Sound Map: the map view (#/).
   AMap JS API 2.0, loaded lazily on first visit. GCJ-02 is native — marker
   positions are stored exactly as AMap returns them, never converted.
   The map is an enhancement, never the only path: on load failure the view
   shows a bilingual banner and redirects to the accessible #/list.
   ========================================================================== */
(function () {
  'use strict';

  var S = window.SoundMap;

  var SHANGHAI_CENTER = [121.4737, 31.2304];
  var MAP_STYLE = 'amap://styles/normal';  // the standard drawn map (not satellite)

  var amapPromise = null;

  /* Loads AMap exactly once per page session; retries after a failure. */
  function loadAMap() {
    if (amapPromise) return amapPromise;
    amapPromise = new Promise(function (resolve, reject) {
      if (window.AMap) { resolve(window.AMap); return; }

      var done = false;
      // Generous watchdog. The AMap bundle is ~1 MB and the map data is a
      // further round of requests, so a tight deadline fails on slow networks
      // and discards a map that was still loading. 4 s proved too short in
      // practice; genuine network failures are reported by script.onerror
      // below, which fails fast, so this only needs to catch a hang.
      var timer = setTimeout(function () {
        if (!done) { done = true; amapPromise = null; reject(new Error('AMAP_TIMEOUT')); }
      }, 20000);

      var script = document.createElement('script');
      script.src = 'https://webapi.amap.com/maps?v=2.0&key=' + encodeURIComponent(S.CFG.AMAP_KEY || '')
        + '&plugin=AMap.Scale,AMap.ToolBar,AMap.PlaceSearch,AMap.Geocoder';
      script.onload = function () {
        clearTimeout(timer);
        if (done) return;
        done = true;
        if (window.AMap) resolve(window.AMap);
        else { amapPromise = null; reject(new Error('AMAP_KEY_INVALID')); }
      };
      script.onerror = function () {
        clearTimeout(timer);
        if (done) return;
        done = true;
        amapPromise = null;
        reject(new Error('AMAP_NETWORK'));
      };
      document.head.appendChild(script);
    });
    return amapPromise;
  }

  /* Shared by the detail view: a small non-interactive map with one pin. */
  async function createMiniMap(el, lng, lat, timeKey) {
    var AMap = await loadAMap();
    var map = new AMap.Map(el, {
      center: [Number(lng), Number(lat)],
      zoom: 14,
      dragEnable: false,
      scrollWheel: false,
      doubleClickZoom: false,
      keyboardEnable: false,
      mapStyle: MAP_STYLE
    });
    var marker = new AMap.Marker({
      position: [Number(lng), Number(lat)],
      content: pinElement(S.TIME_COLORS[timeKey] || '#E8590C'),
      offset: new AMap.Pixel(-12, -12)
    });
    map.add(marker);
    return map;
  }

  function pinElement(color) {
    var div = document.createElement('div');
    div.className = 'pin';
    div.style.setProperty('--pin-color', color || '#E8590C');
    return div;
  }

  /* ------------------------------------------------------------------ view -- */

  function render(el, params) {
    var map = null;
    var markers = [];
    var infoWindow = null;
    var destroyed = false;

    el.innerHTML =
      '<div class="view view-map">'
      + '<div id="map-container" aria-hidden="true"></div>'
      + '<div class="map-filters">'
      + '  <div id="map-chips"></div>'
      + '  <div id="map-count" class="map-count" hidden></div>'
      + '</div>'
      + '<div id="map-empty" class="empty-card card" hidden>'
      + '  <h2>The map is quiet 地图还很安静</h2>'
      + '  <p id="map-empty-text">Be the first to add a sound. 来添加第一个声音吧。</p>'
      + '  <div id="map-empty-actions"></div>'
      + '</div>'
      + '<div id="map-fallback" class="map-fallback" hidden>'
      + '  <div class="card" style="max-width:420px;text-align:center">'
      + '    <h2>The map could not load 地图加载失败</h2>'
      + '    <p style="margin:10px 0 14px">You can still browse every sound in the list. 你仍然可以在列表中浏览所有声音。</p>'
      + '    <a class="btn btn-primary" href="#/list">Open the list · 打开列表</a>'
      + '  </div>'
      + '</div>'
      + '</div>';

    var container = el.querySelector('#map-container');
    var chipsEl = el.querySelector('#map-chips');
    var countEl = el.querySelector('#map-count');
    var emptyEl = el.querySelector('#map-empty');
    var fallbackEl = el.querySelector('#map-fallback');

    function popupHtml(sound) {
      var t = S.label('time', sound.time_of_day);
      var c = S.label('category', sound.category);
      return '<div class="popup">'
        + '<h3>' + S.esc(sound.title_en) + '</h3>'
        + '<div class="popup-cn">' + S.esc(sound.title_cn) + '</div>'
        + '<div class="popup-meta">'
        + '<span class="time-dot" style="--dot-color:' + S.TIME_COLORS[sound.time_of_day] + '"></span>'
        + '<span>' + S.esc(t.cn) + ' · ' + S.esc(c.cn) + '</span>'
        + '</div>'
        + '<div class="popup-actions">'
        + '<button type="button" class="btn btn-primary btn-sm" data-action="play" data-id="' + S.esc(sound.id) + '">Play 播放</button>'
        + '<a class="btn btn-sm" href="#/sound/' + S.esc(sound.id) + '">Story 故事</a>'
        + '</div></div>';
    }

    function renderMarkers(sounds) {
      markers.forEach(function (m) { m.remove(); });
      markers = [];
      sounds.forEach(function (s) {
        var marker = new window.AMap.Marker({
          position: [Number(s.lng), Number(s.lat)],
          content: pinElement(S.TIME_COLORS[s.time_of_day]),
          offset: new window.AMap.Pixel(-12, -12),
          title: s.title_en + ' · ' + s.title_cn
        });
        marker.on('click', function () {
          if (!infoWindow) {
            infoWindow = new window.AMap.InfoWindow({ offset: new window.AMap.Pixel(0, -28) });
          }
          infoWindow.setContent(popupHtml(s));
          infoWindow.open(map, marker.getPosition());
        });
        map.add(marker);
        markers.push(marker);
      });
    }

    function update(sounds, total) {
      renderMarkers(sounds);
      countEl.hidden = false;
      countEl.textContent = 'Showing ' + sounds.length + ' sound' + (sounds.length === 1 ? '' : 's')
        + ' · 显示 ' + sounds.length + ' 个声音';
      if (sounds.length) {
        emptyEl.hidden = true;
        S.announce('Showing ' + sounds.length + ' sounds. 显示 ' + sounds.length + ' 个声音。');
      } else {
        emptyEl.hidden = false;
        if (!total) {
          emptyEl.querySelector('h2').textContent = 'The map is quiet 地图还很安静';
          emptyEl.querySelector('#map-empty-text').textContent = 'Be the first to add a sound. 来添加第一个声音吧。';
          var actions = emptyEl.querySelector('#map-empty-actions');
          actions.innerHTML = S.isMember()
            ? '<a class="btn btn-primary" href="#/submit">Add a sound · 添加声音</a>'
            : '<p style="color:var(--muted)">Check back soon. 敬请期待。</p>';
        } else {
          emptyEl.querySelector('h2').textContent = 'No matches 没有匹配的声音';
          emptyEl.querySelector('#map-empty-text').textContent = 'Try different filters. 试试其他筛选条件。';
          emptyEl.querySelector('#map-empty-actions').innerHTML = '';
        }
      }
    }

    async function refresh() {
      var all = await S.loadApprovedSounds(true);
      if (destroyed) return;
      var visible = S.filterSounds(all);
      update(visible, all.length);
    }

    function onFilters() {
      renderFilterChipsOnce();
      refresh();
    }

    function renderFilterChipsOnce() {
      if (destroyed) return;
      S.renderFilterChips(chipsEl);
    }

    async function initMap() {
      if (!S.configured()) {
        fallbackEl.hidden = false;
        fallbackEl.querySelector('p').textContent =
          'The site is not configured yet — fill in config.js (see playbooks/launch-soundmap.md). 网站尚未配置，请先填写 config.js。';
        return;
      }
      // Non-blocking hint while the bundle and map data load. AMap replaces the
      // container's contents when it renders, so this never lingers on success.
      container.textContent = 'Loading the map… 正在加载地图…';
      try {
        var AMap = await loadAMap();
        if (destroyed) return;
        map = new AMap.Map(container, {
          center: SHANGHAI_CENTER,
          zoom: 11,
          viewMode: '2D',
          mapStyle: MAP_STYLE
        });
        map.addControl(new AMap.Scale());
        map.addControl(new AMap.ToolBar({ position: 'RB' }));
        refresh();
      } catch (err) {
        if (destroyed) return;
        // The banner is deliberately generic — visitors get one calm bilingual
        // message and a working list. But the failure modes need very different
        // fixes: AMAP_NETWORK (webapi.amap.com unreachable from this network),
        // AMAP_TIMEOUT (bundle too slow for the watchdog), AMAP_KEY_INVALID
        // (key or securityJsCode rejected). Log the code so that a report of
        // "the map failed" is actually diagnosable instead of a guess.
        console.error('[soundmap] map load failed:', (err && err.message) || err);
        fallbackEl.hidden = false;
        S.showBanner('The map could not load — switching to the list. 地图加载失败，已切换到列表模式。', 'error');
        setTimeout(function () {
          if (!destroyed && (location.hash === '#/' || location.hash === '')) S.navigate('#/list');
        }, 2500);
      }
    }

    renderFilterChipsOnce();
    window.addEventListener('soundmap:filters', onFilters);
    initMap();

    return function destroy() {
      destroyed = true;
      window.removeEventListener('soundmap:filters', onFilters);
      if (infoWindow) { infoWindow.close(); infoWindow = null; }
      if (map) { try { map.destroy(); } catch (e) { /* noop */ } map = null; }
      markers = [];
    };
  }

  S.registerView('map', { render: render });
  S.Map = { load: loadAMap, createMiniMap: createMiniMap };
})();
