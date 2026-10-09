/* ==========================================================================
   WLSA Sound Art Club — Shanghai Sound Map: the story/detail view (#/sound/:id).
   Full metadata, the audio description read aloud for visually impaired
   listeners (Web Speech API), and a small single-pin map.
   ========================================================================== */
(function () {
  'use strict';

  var S = window.SoundMap;

  var LICENSE_LABELS = {
    'cc0': 'CC0 公共领域',
    'cc-by': 'CC BY',
    'cc-by-sa': 'CC BY-SA',
    'cc-by-nc': 'CC BY-NC',
    'cc-by-nc-sa': 'CC BY-NC-SA',
    'all-rights': 'All rights reserved 保留所有权利'
  };

  function render(el, params) {
    var miniMap = null;
    var speaking = false;

    function metaHtml(sound) {
      var c = S.label('category', sound.category);
      var t = S.label('time', sound.time_of_day);
      var lic = LICENSE_LABELS[sound.license] || sound.license;
      return '<div class="detail-meta">'
        + '<span class="badge badge-approved">' + S.esc(c.cn) + ' · ' + S.esc(c.en) + '</span>'
        + '<span class="badge badge-approved">' + S.esc(t.cn) + ' · ' + S.esc(t.en) + '</span>'
        + '</div>'
        + '<div class="detail-grid">'
        + '<div class="card"><h3>Place · 地点</h3><p>' + S.esc(sound.place_cn || '') + (sound.place_en ? '<br>' + S.esc(sound.place_en) : '') + '</p></div>'
        + '<div class="card"><h3>Recorded · 录音</h3><p>'
        + S.esc(sound.recorded_on ? String(sound.recorded_on).slice(0, 10) : '')
        + ' · ' + S.esc(t.cn)
        + '<br>' + S.esc(sound.recorder_name || '')
        + '</p></div>'
        + '<div class="card"><h3>License · 授权</h3><p>' + S.esc(lic) + '</p></div>'
        + '<div class="card"><h3>Coordinates · 坐标</h3><p>' + S.esc(sound.lng) + ', ' + S.esc(sound.lat) + '<br><span style="color:var(--muted)">GCJ-02 (AMap)</span></p></div>'
        + '</div>';
    }

    function speak(text) {
      if (!('speechSynthesis' in window)) {
        S.showBanner('Your browser does not support text-to-speech. 你的浏览器不支持语音朗读。', 'info');
        return;
      }
      if (speaking) {
        window.speechSynthesis.cancel();
        speaking = false;
        return;
      }
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.onend = function () { speaking = false; };
      u.onerror = function () { speaking = false; };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      speaking = true;
    }

    function renderSound(sound) {
      var c = S.label('category', sound.category);
      var showStatus = sound.status !== 'approved'
        ? '<div style="margin-bottom:12px">' + S.statusBadge(sound.status) + '</div>'
        : '';

      var html =
        '<div class="view-content">'
        + '<a class="btn btn-ghost btn-sm" href="#/list" style="margin-bottom:12px">&larr; All sounds · 返回列表</a>'
        + showStatus
        + '<h1 class="view-title">' + S.esc(sound.title_en) + '</h1>'
        + '<div style="font-size:20px;color:var(--body);margin-bottom:16px">' + S.esc(sound.title_cn) + '</div>'
        + '<div class="list-actions" style="margin-bottom:18px">'
        + '<button type="button" class="btn btn-primary" data-action="play" data-id="' + S.esc(sound.id) + '">Play 播放</button>'
        + '</div>'
        + metaHtml(sound)
        + '<div class="audio-desc-box">'
        + '<h3><span aria-hidden="true">🔊</span> Audio description · 声音描述</h3>'
        + '<p class="audio-desc-text">' + S.esc(sound.audio_description_cn) + '</p>'
        + (sound.audio_description_en ? '<p style="color:var(--muted)">' + S.esc(sound.audio_description_en) + '</p>' : '')
        + '<button type="button" class="btn btn-sm" id="detail-speak">Read aloud · 朗读</button>'
        + '</div>'
        + '<div class="detail-block"><h3>The story · 声音背后的故事</h3>'
        + '<p class="lang-label">EN</p><p class="detail-story">' + S.esc(sound.story_en) + '</p>'
        + '<p class="lang-label">中文</p><p class="detail-story">' + S.esc(sound.story_cn) + '</p>'
        + '</div>'
        + '<div class="detail-block"><h3>Mandarin transcript · 普通话文字稿</h3>'
        + '<p>' + S.esc(sound.transcript_cn) + '</p></div>'
        + (sound.dialect_text || sound.dialect_name
          ? '<div class="detail-block"><h3>Dialect · 方言</h3>'
            + (sound.dialect_name ? '<p class="lang-label">' + S.esc(sound.dialect_name) + '</p>' : '')
            + (sound.dialect_text ? '<p>' + S.esc(sound.dialect_text) + '</p>' : '')
            + (sound.dialect_note ? '<p style="color:var(--muted)">' + S.esc(sound.dialect_note) + '</p>' : '')
            + '</div>'
          : '')
        + '<div class="detail-block"><h3>Location · 位置</h3><div id="detail-minimap"></div></div>'
        + '</div>';

      el.innerHTML = html;

      var speakBtn = el.querySelector('#detail-speak');
      if (speakBtn) {
        speakBtn.addEventListener('click', function () { speak(sound.audio_description_cn); });
      }

      // Small single-pin map (best-effort; hidden if it fails to load).
      var mmEl = el.querySelector('#detail-minimap');
      if (mmEl && S.configured()) {
        S.Map.createMiniMap(mmEl, sound.lng, sound.lat, sound.time_of_day)
          .then(function (m) {
            if (mmEl.isConnected) miniMap = m;
            else { try { m.destroy(); } catch (e) { /* noop */ } }  // navigated away mid-load
          })
          .catch(function () { mmEl.innerHTML = '<p style="color:var(--muted)">Map unavailable. 地图不可用。</p>'; });
      } else if (mmEl) {
        mmEl.innerHTML = '<p style="color:var(--muted)">Map unavailable. 地图不可用。</p>';
      }
    }

    function renderNotFound() {
      el.innerHTML =
        '<div class="view-content"><div class="card" style="text-align:center">'
        + '<h1 class="view-title">Not found 未找到</h1>'
        + '<p style="margin:10px 0 14px">This sound does not exist or has not been approved yet. 这段声音不存在，或尚未审核通过。</p>'
        + '<a class="btn btn-primary" href="#/list">All sounds · 返回列表</a>'
        + '</div></div>';
    }

    async function init() {
      if (!S.sb) {
        el.innerHTML = '<div class="view-content"><div class="card"><p>The site is not configured yet. 网站尚未配置。</p></div></div>';
        return;
      }
      var res = await S.sb.from('sounds').select('*').eq('id', params.id).maybeSingle();
      if (res.error || !res.data) { renderNotFound(); return; }
      renderSound(res.data);
    }

    init();

    return function destroy() {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      if (miniMap) { try { miniMap.destroy(); } catch (e) { /* noop */ } miniMap = null; }
    };
  }

  S.registerView('detail', { render: render });
})();
