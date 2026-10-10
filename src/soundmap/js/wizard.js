/* ==========================================================================
   WLSA Sound Art Club — Shanghai Sound Map: submit wizard + my submissions.
   #/submit           3-step wizard (member AND admin — admins get "Save &
                     Publish"): recording → location → story. Row-first insert,
                     upload to pending/<id>.<ext>, row deleted if upload fails.
   #/submissions      Own rows with status badges, review notes, edit &
                     resubmit (RLS resets to pending), two-step withdraw.
   ========================================================================== */
(function () {
  'use strict';

  var S = window.SoundMap;
  var MAX_BYTES = 20 * 1024 * 1024;
  var BBOX = { lngMin: 120.0, lngMax: 122.5, latMin: 30.5, latMax: 32.0 };

  var LICENSE_OPTIONS = [
    { key: 'cc-by-sa', label: 'CC BY-SA — share alike (recommended 推荐)' },
    { key: 'cc-by', label: 'CC BY — attribution 署名' },
    { key: 'cc-by-nc-sa', label: 'CC BY-NC-SA — non-commercial share alike 非商业' },
    { key: 'cc-by-nc', label: 'CC BY-NC — non-commercial 非商业' },
    { key: 'cc0', label: 'CC0 — public domain 公共领域' },
    { key: 'all-rights', label: 'All rights reserved 保留所有权利' }
  ];

  /* ------------------------------------------------------------ utilities -- */

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function extOf(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  function todayLocal() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function validateFile(file) {
    if (!file) return 'Choose an audio file. 请选择音频文件。';
    var ext = extOf(file.name);
    if (ext === 'amr') {
      return 'WeChat voice messages (.amr) cannot be uploaded — re-record with your phone\'s voice-memo app. '
        + '微信语音无法直接上传，请用手机自带录音应用重新录制。';
    }
    if (ext !== 'mp3' && ext !== 'm4a') {
      return 'Only .mp3 and .m4a files are supported. 仅支持 mp3 和 m4a 格式。';
    }
    if (file.size > MAX_BYTES) {
      return 'The file is larger than 20 MB. 文件超过 20 MB。';
    }
    return null;
  }

  function bboxOk(lng, lat) {
    return lng >= BBOX.lngMin && lng <= BBOX.lngMax && lat >= BBOX.latMin && lat <= BBOX.latMax;
  }

  function selectHtml(id, options, current) {
    return '<select id="' + id + '">' + options.map(function (o) {
      return '<option value="' + o.key + '"' + (current === o.key ? ' selected' : '') + '>'
        + S.esc(o.en) + ' · ' + S.esc(o.cn) + '</option>';
    }).join('') + '</select>';
  }

  /* --------------------------------------------------------------- draft --- */
  /* Every field of the wizard lives in the render closure, so ANY re-render —
     a re-route, a sign-out, the tab coming back, the student clicking Map and
     returning — used to throw the whole submission away. A 20 MB recording plus
     a story and a Chinese audio description is a lot of work to lose to a
     re-render the student never asked for.

     Text is kept in localStorage, keyed per user so a shared school laptop
     never shows one student another's draft. The chosen File is deliberately
     not kept: it cannot be serialised, it is megabytes, and a restored draft
     therefore asks for the recording to be picked again. */
  var DRAFT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

  function draftKey() {
    return (S.state.user && S.state.user.id) ? 'soundmap:draft:' + S.state.user.id : null;
  }

  /* Fields worth restoring — an untouched form must not look like a draft. */
  var DRAFT_FIELDS = ['title_en', 'title_cn', 'place_cn', 'story_cn', 'story_en',
    'transcript_cn', 'audio_description_cn', 'dialect_text'];

  function draftHasContent(d) {
    return DRAFT_FIELDS.some(function (k) { return d && d[k] && String(d[k]).trim(); });
  }

  function saveDraft(w) {
    var key = draftKey();
    if (!key || w.mode !== 'create' || w.saving) return;
    try {
      localStorage.setItem(key, JSON.stringify({
        step: w.step, hadFile: !!w.file, data: w.data, savedAt: Date.now()
      }));
    } catch (e) { /* private mode or quota — a missing safety copy is not fatal */ }
  }

  function loadDraft() {
    var key = draftKey();
    if (!key) return null;
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || !d.data || typeof d.data !== 'object') return null;
      if (Date.now() - (d.savedAt || 0) > DRAFT_MAX_AGE) { localStorage.removeItem(key); return null; }
      return d;
    } catch (e) { return null; }
  }

  function clearDraft() {
    var key = draftKey();
    if (!key) return;
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------ step HTML -- */

  function step1Html(w) {
    var fileNote = (w.mode === 'edit' && w.row && w.row.audio_path)
      ? '<p class="hint">Current audio: <code>' + S.esc(w.row.audio_path) + '</code> — pick a file to replace it. '
        + '当前音频：' + S.esc(w.row.audio_path) + '，选择新文件可替换。</p>'
      : '';
    return '<div class="wizard-step is-active">'
      + '<h2>Step 1 · The recording <span class="nav-cn">录音</span></h2>'
      + '<div class="field"><label>Audio file · 音频文件' + (w.mode === 'create' ? ' <span class="required">*</span>' : '') + '</label>'
      + '<div class="file-drop" id="w-drop" tabindex="0" role="button" aria-label="Choose audio file 选择音频文件">'
      + '<span id="w-drop-text">Click to choose an .mp3 or .m4a file (max 20 MB) · 点击选择 mp3 或 m4a 音频（不超过 20 MB）</span>'
      + '<input type="file" id="w-file" accept=".mp3,.m4a,audio/mp3,audio/mp4,audio/x-m4a" hidden></div>'
      + fileNote + '</div>'
      + '<div class="field"><label for="w-title-en">Title (English) · 英文标题 <span class="required">*</span></label>'
      + '<input id="w-title-en" type="text" maxlength="120" value="' + S.esc(w.data.title_en) + '" placeholder="e.g. The ferry horn at dawn 渡轮的汽笛">'
      + '<p class="hint">A short, vivid name for the sound. 给这段声音起一个简短生动的名字。</p></div>'
      + '<div class="field"><label for="w-title-cn">Title (中文) <span class="required">*</span></label>'
      + '<input id="w-title-cn" type="text" maxlength="120" value="' + S.esc(w.data.title_cn) + '"></div>'
      + '<div class="field"><label for="w-category">Category · 分类 <span class="required">*</span></label>'
      + selectHtml('w-category', S.CATEGORIES, w.data.category) + '</div>'
      + '<div class="field"><label for="w-time">Time of day · 时间段 <span class="required">*</span></label>'
      + selectHtml('w-time', S.TIMES, w.data.time_of_day)
      + '<p class="hint">“Hearing a Day in Shanghai” — pick the time slot of the recording. 这是「听见上海的一天」主题的时间段。</p></div>'
      + '<div class="field"><label for="w-date">Recording date · 录音日期 <span class="required">*</span></label>'
      + '<input id="w-date" type="date" value="' + S.esc(w.data.recorded_on) + '"></div>'
      + '</div>';
  }

  function step2Html(w) {
    var selected = (w.data.lng != null)
      ? 'Selected 已选：' + Number(w.data.lng).toFixed(6) + ', ' + Number(w.data.lat).toFixed(6) + ' — ' + S.esc(w.data.place_cn || '(no name yet 尚未命名)')
      : 'No location yet 尚未选择位置';
    return '<div class="wizard-step is-active">'
      + '<h2>Step 2 · Where was it recorded? <span class="nav-cn">地点</span></h2>'
      + '<p class="hint">Search a place, then click the map or drag the pin to fine-tune. Coordinates stay GCJ-02 (AMap) — never type phone-GPS values. '
        + '搜索地点，然后点击地图或拖动图钉微调。坐标使用高德 GCJ-02 坐标系——请勿输入手机 GPS 坐标。</p>'
      + '<div id="w-search-row"><input id="w-search" type="text" placeholder="Search Shanghai 搜索上海地点，如：外滩、田子坊、豫园">'
      + '<button id="w-search-btn" class="btn btn-sm" type="button">Search 搜索</button></div>'
      + '<div id="wizard-picker"></div>'
      + '<p id="w-selected" class="map-count">' + selected + '</p>'
      + '<button id="w-manual-toggle" class="btn btn-sm" type="button" aria-expanded="false">Enter coordinates manually 手动输入坐标</button>'
      + '<div id="w-manual" class="card" hidden>'
      + '<div class="field"><label for="w-place-cn">Place name · 地点名称 <span class="required">*</span></label>'
      + '<input id="w-place-cn" type="text" value="' + S.esc(w.data.place_cn) + '" placeholder="e.g. The Bund 外滩"></div>'
      + '<div class="field"><label for="w-place-en">Place name (English) · 英文地名 <span class="hint">(optional)</span></label>'
      + '<input id="w-place-en" type="text" value="' + S.esc(w.data.place_en) + '"></div>'
      + '<div class="field-row">'
      + '<div class="field"><label for="w-lng">Longitude · 经度 <span class="required">*</span></label>'
      + '<input id="w-lng" type="number" step="0.000001" min="120.0" max="122.5" value="' + (w.data.lng == null ? '' : Number(w.data.lng).toFixed(6)) + '"></div>'
      + '<div class="field"><label for="w-lat">Latitude · 纬度 <span class="required">*</span></label>'
      + '<input id="w-lat" type="number" step="0.000001" min="30.5" max="32.0" value="' + (w.data.lat == null ? '' : Number(w.data.lat).toFixed(6)) + '"></div>'
      + '</div>'
      + '<p class="hint">Must be inside the Shanghai area (lng 120.0–122.5, lat 30.5–32.0). 必须位于上海市范围（经度 120.0–122.5，纬度 30.5–32.0）。</p>'
      + '</div>'
      + '</div>';
  }

  function step3Html(w) {
    return '<div class="wizard-step is-active">'
      + '<h2>Step 3 · The story <span class="nav-cn">故事</span></h2>'
      + '<div class="field"><label for="w-story-cn">The story (中文) · 声音背后的故事 <span class="required">*</span></label>'
      + '<textarea id="w-story-cn" rows="4" placeholder="What makes this sound special? 这个声音有什么特别之处？">' + S.esc(w.data.story_cn) + '</textarea></div>'
      + '<div class="field"><label for="w-story-en">The story (English) <span class="required">*</span></label>'
      + '<textarea id="w-story-en" rows="4">' + S.esc(w.data.story_en) + '</textarea></div>'
      + '<div class="field"><label for="w-transcript">Mandarin transcript · 普通话文字稿 <span class="required">*</span></label>'
      + '<textarea id="w-transcript" rows="3" placeholder="Write down what is said in the recording. 写下录音里说的话。">' + S.esc(w.data.transcript_cn) + '</textarea></div>'
      + '<div class="field"><label for="w-dialect-name">Dialect name · 方言名称 <span class="hint">(optional 可选)</span></label>'
      + '<input id="w-dialect-name" type="text" value="' + S.esc(w.data.dialect_name) + '" placeholder="e.g. 上海话 Shanghainese"></div>'
      + '<div class="field"><label for="w-dialect-text">Dialect text · 方言原文 <span class="hint">(optional)</span></label>'
      + '<textarea id="w-dialect-text" rows="2">' + S.esc(w.data.dialect_text) + '</textarea></div>'
      + '<div class="field"><label for="w-dialect-note">Dialect note · 方言说明 <span class="hint">(optional)</span></label>'
      + '<textarea id="w-dialect-note" rows="2" placeholder="Explain what the dialect means. 解释方言的意思。">' + S.esc(w.data.dialect_note) + '</textarea>'
      + '<p class="hint">Explaining the dialect is part of the club’s vision. 为方言作说明是社团计划的一部分。</p></div>'
      + '<div class="field"><label for="w-ad-cn">Audio description (中文) · 音频描述 <span class="required">*</span></label>'
      + '<textarea id="w-ad-cn" rows="3" placeholder="For visually impaired children: what is it, where, what does it feel like? 请为视障小朋友描述：是什么声音、在哪里、听起来是什么感觉？">' + S.esc(w.data.audio_description_cn) + '</textarea>'
      + '<p class="hint">The detail page reads this aloud. 详情页会用语音朗读这段话。</p></div>'
      + '<div class="field"><label for="w-ad-en">Audio description (English) <span class="hint">(optional)</span></label>'
      + '<textarea id="w-ad-en" rows="2">' + S.esc(w.data.audio_description_en) + '</textarea></div>'
      + '<div class="field"><label for="w-recorder">Recorded by · 录音人 <span class="required">*</span></label>'
      + '<input id="w-recorder" type="text" value="' + S.esc(w.data.recorder_name) + '"></div>'
      + '<div class="field"><label for="w-license">License · 授权方式 <span class="required">*</span></label>'
      + '<select id="w-license">' + LICENSE_OPTIONS.map(function (l) {
          return '<option value="' + l.key + '"' + (w.data.license === l.key ? ' selected' : '') + '>' + S.esc(l.label) + '</option>';
        }).join('') + '</select>'
      + '<p class="hint">Recordings may include minors’ voices — choose how others may use this sound. 录音可能包含未成年人的声音，请选择他人可以如何使用这段声音。</p></div>'
      + '</div>';
  }

  /* ------------------------------------------------------------ the wizard -- */

  function render(el, params) {
    var destroyed = false;
    var w = {
      mode: params.id ? 'edit' : 'create',
      isAdmin: S.isAdmin(),
      id: params.id || null,
      row: null,
      step: 0,
      file: null,
      saving: false,
      _cleanupStep2: null,
      data: {
        title_en: '', title_cn: '',
        category: 'transport', time_of_day: 'morning', recorded_on: todayLocal(),
        place_cn: '', place_en: '', lng: null, lat: null,
        story_cn: '', story_en: '', transcript_cn: '',
        dialect_name: '', dialect_text: '', dialect_note: '',
        audio_description_cn: '', audio_description_en: '',
        recorder_name: S.state.profile ? (S.state.profile.display_name || '') : '',
        license: 'cc-by-sa'
      }
    };

    /* Restore before the first renderStep(), so the fields paint with the
       student's text already in them. Edit mode has a real row to work from
       and never touches the draft. */
    var restored = null;
    if (w.mode === 'create') {
      var d = loadDraft();
      if (d && draftHasContent(d.data)) {
        Object.assign(w.data, d.data);
        /* The recording cannot be carried across, so a draft from mid-flow goes
           back to step 1 for the file and walks forward again — every answer is
           still filled in. */
        w.step = d.hadFile ? 0 : (typeof d.step === 'number' ? d.step : 0);
        restored = d;
      }
    }

    el.innerHTML =
      '<div class="view-content">'
      + '<h1 class="view-title" id="w-title">' + (w.mode === 'edit' ? 'Edit sound · 编辑声音' : 'Add a sound · 添加声音') + '</h1>'
      + '<ol class="steps-indicator">'
      + '<li class="step-pill" data-pill="0">1 · Recording 录音</li>'
      + '<li class="step-pill" data-pill="1">2 · Location 地点</li>'
      + '<li class="step-pill" data-pill="2">3 · Story 故事</li>'
      + '</ol>'
      + '<div id="w-step"></div>'
      + '<div class="wizard-nav">'
      + '<button id="w-back" class="btn" type="button" hidden>Back 上一步</button>'
      + '<span class="flex-spacer"></span>'
      + '<button id="w-next" class="btn btn-primary" type="button"></button>'
      + '</div>'
      + '<p id="w-saving" class="map-count" hidden>Saving… 正在保存…</p>'
      + '</div>';

    el.querySelector('#w-back').addEventListener('click', function () {
      if (w.saving) return;
      w.step -= 1;
      renderStep();
      window.scrollTo(0, 0);
    });
    el.querySelector('#w-next').addEventListener('click', next);

    /* Autosave on every edit, not just on Next — a field the student typed but
       never advanced past is exactly the work worth keeping. #main is reused by
       every view, so these must be removed in destroy() or they would pile up
       and keep saving a stale `w` from a wizard that is long gone. */
    function onEdit() { captureFields(); saveDraft(w); }
    el.addEventListener('input', onEdit);
    el.addEventListener('change', onEdit);

    /* A tab switch is both when this matters most and when supabase-js re-reads
       the session, so capture on the way out as well. */
    function captureNow() { captureFields(); saveDraft(w); }
    function onVisibility() { if (document.hidden) captureNow(); }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', captureNow);
    window.addEventListener('beforeunload', captureNow);

    /* ------------------------------ edit mode: load the row and pre-fill ---- */

    function prefill(row) {
      w.row = row;
      w.data.title_en = row.title_en; w.data.title_cn = row.title_cn;
      w.data.category = row.category; w.data.time_of_day = row.time_of_day;
      w.data.recorded_on = String(row.recorded_on).slice(0, 10);
      w.data.lng = Number(row.lng); w.data.lat = Number(row.lat);
      w.data.place_cn = row.place_cn; w.data.place_en = row.place_en || '';
      w.data.story_cn = row.story_cn; w.data.story_en = row.story_en;
      w.data.transcript_cn = row.transcript_cn;
      w.data.dialect_name = row.dialect_name || '';
      w.data.dialect_text = row.dialect_text || '';
      w.data.dialect_note = row.dialect_note || '';
      w.data.audio_description_cn = row.audio_description_cn;
      w.data.audio_description_en = row.audio_description_en || '';
      w.data.recorder_name = row.recorder_name;
      w.data.license = row.license;
    }

    /* ------------------------------ step machinery ------------------------ */

    function renderStep() {
      if (w._cleanupStep2) { w._cleanupStep2(); w._cleanupStep2 = null; }
      var stepEl = el.querySelector('#w-step');
      if (w.step === 0) { stepEl.innerHTML = step1Html(w); bindStep1(stepEl); }
      else if (w.step === 1) { stepEl.innerHTML = step2Html(w); setupStep2(w, stepEl); }
      else { stepEl.innerHTML = step3Html(w); }

      el.querySelectorAll('.step-pill').forEach(function (p) {
        var n = Number(p.getAttribute('data-pill'));
        p.classList.toggle('is-current', n === w.step);
        p.classList.toggle('is-done', n < w.step);
      });

      el.querySelector('#w-back').hidden = w.step === 0;
      var nextBtn = el.querySelector('#w-next');
      nextBtn.textContent = w.step === 2
        ? (w.isAdmin ? 'Save & Publish · 保存并发布' : 'Submit · 提交')
        : 'Next · 下一步';
    }

    function bindStep1(stepEl) {
      var fileInput = stepEl.querySelector('#w-file');
      var drop = stepEl.querySelector('#w-drop');
      var dropText = stepEl.querySelector('#w-drop-text');

      function setFile(file) {
        var err = validateFile(file);
        if (err) { S.showBanner(err, 'error'); return; }
        w.file = file;
        dropText.textContent = file.name + ' (' + (file.size / 1024 / 1024).toFixed(1) + ' MB) — click to change 点击更换';
        drop.classList.add('has-file');
      }

      drop.addEventListener('click', function () { fileInput.click(); });
      drop.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
      });
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) setFile(fileInput.files[0]);
      });
      drop.addEventListener('dragover', function (e) { e.preventDefault(); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
      });
    }

    function setupStep2(w, stepEl) {
      var pickerEl = stepEl.querySelector('#wizard-picker');
      var selectedEl = stepEl.querySelector('#w-selected');
      var manualEl = stepEl.querySelector('#w-manual');
      var toggleBtn = stepEl.querySelector('#w-manual-toggle');
      var map = null;
      var marker = null;

      function showSelected() {
        var d = w.data;
        selectedEl.textContent = (d.lng != null && !isNaN(d.lng))
          ? 'Selected 已选：' + Number(d.lng).toFixed(6) + ', ' + Number(d.lat).toFixed(6) + ' — ' + (d.place_cn || '(no name yet 尚未命名)')
          : 'No location yet 尚未选择位置';
      }

      function setCoords(lng, lat, place) {
        w.data.lng = lng; w.data.lat = lat;
        if (place) w.data.place_cn = place;
        stepEl.querySelector('#w-place-cn').value = w.data.place_cn;
        stepEl.querySelector('#w-lng').value = Number(lng).toFixed(6);
        stepEl.querySelector('#w-lat').value = Number(lat).toFixed(6);
        showSelected();
      }

      toggleBtn.addEventListener('click', function () {
        manualEl.hidden = !manualEl.hidden;
        toggleBtn.setAttribute('aria-expanded', String(!manualEl.hidden));
      });

      stepEl.querySelector('#w-place-cn').addEventListener('input', function (e) {
        w.data.place_cn = e.target.value.trim(); showSelected();
      });
      stepEl.querySelector('#w-place-en').addEventListener('input', function (e) {
        w.data.place_en = e.target.value.trim();
      });
      stepEl.querySelector('#w-lng').addEventListener('input', function (e) {
        w.data.lng = parseFloat(e.target.value); showSelected();
      });
      stepEl.querySelector('#w-lat').addEventListener('input', function (e) {
        w.data.lat = parseFloat(e.target.value); showSelected();
      });

      w._cleanupStep2 = function () {
        if (map) { try { map.destroy(); } catch (e) { /* noop */ } map = null; }
        marker = null;
      };

      if (!S.Map || !S.configured()) {
        pickerEl.innerHTML = '<p style="color:var(--muted)">The map is unavailable — use manual entry below. 地图不可用，请使用下方的手动输入。</p>';
        stepEl.querySelector('#w-search-row').hidden = true;
        manualEl.hidden = false;
        toggleBtn.hidden = true;
        return;
      }

      S.Map.load().then(function (AMap) {
        if (!pickerEl.isConnected || destroyed) return;
        map = new AMap.Map(pickerEl, {
          center: [w.data.lng != null ? w.data.lng : 121.4737, w.data.lat != null ? w.data.lat : 31.2304],
          zoom: w.data.lng != null ? 15 : 12,
          mapStyle: 'amap://styles/normal'
        });
        var geocoder = new AMap.Geocoder();
        var placeSearch = new AMap.PlaceSearch({ city: '上海', pageSize: 1 });

        function reverseGeocode(lng, lat) {
          geocoder.getAddress([lng, lat], function (status, result) {
            if (status === 'complete' && result.regeocode && pickerEl.isConnected && !destroyed) {
              setCoords(lng, lat, result.regeocode.formattedAddress);
            }
          });
        }

        function placeMarker(lng, lat, place) {
          if (marker) { marker.setPosition([lng, lat]); }
          else {
            marker = new AMap.Marker({ position: [lng, lat], draggable: true });
            map.add(marker);
            marker.on('dragend', function (e) {
              var p = e.target.getPosition();
              setCoords(p.getLng(), p.getLat(), null);
              reverseGeocode(p.getLng(), p.getLat());
            });
          }
          setCoords(lng, lat, place || null);
          if (!place) reverseGeocode(lng, lat);
          map.setCenter([lng, lat]);
        }

        if (w.data.lng != null) placeMarker(w.data.lng, w.data.lat, w.data.place_cn || null);

        map.on('click', function (e) {
          placeMarker(e.lnglat.getLng(), e.lnglat.getLat(), null);
        });

        stepEl.querySelector('#w-search-btn').addEventListener('click', function () {
          var kw = stepEl.querySelector('#w-search').value.trim();
          if (!kw) return;
          placeSearch.search(kw, function (status, result) {
            if (status === 'complete' && result.poiList && result.poiList.pois.length) {
              var poi = result.poiList.pois[0];
              placeMarker(poi.location.getLng(), poi.location.getLat(),
                poi.name + (poi.address ? ' ' + poi.address : ''));
            } else {
              S.showBanner('No place found — try another name. 没有找到该地点，换个名字试试。', 'info');
            }
          });
        });
        stepEl.querySelector('#w-search').addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); stepEl.querySelector('#w-search-btn').click(); }
        });
      }).catch(function () {
        if (!pickerEl.isConnected || destroyed) return;
        pickerEl.innerHTML = '<p style="color:var(--muted)">The map could not load — use manual entry below. 地图加载失败，请使用下方的手动输入。</p>';
        stepEl.querySelector('#w-search-row').hidden = true;
        manualEl.hidden = false;
        toggleBtn.hidden = true;
      });
    }

    /* ------------------------------ validation ---------------------------- */

    /* Reads whichever step is on screen into w.data. Shared by Next and by the
       draft autosave, so the two can never disagree about what was captured.
       Step 2 needs no reading here: setupStep2's own listeners keep w.data live
       whether the student picks on the map, drags the pin, or types coords. */
    function captureFields() {
      var stepEl = el.querySelector('#w-step');
      if (!stepEl) return;
      var d = w.data;
      var e;
      if (w.step === 0) {
        if ((e = stepEl.querySelector('#w-title-en'))) d.title_en = e.value.trim();
        if ((e = stepEl.querySelector('#w-title-cn'))) d.title_cn = e.value.trim();
        if ((e = stepEl.querySelector('#w-category'))) d.category = e.value;
        if ((e = stepEl.querySelector('#w-time'))) d.time_of_day = e.value;
        if ((e = stepEl.querySelector('#w-date'))) d.recorded_on = e.value;
      } else if (w.step === 2) {
        if ((e = stepEl.querySelector('#w-story-cn'))) d.story_cn = e.value.trim();
        if ((e = stepEl.querySelector('#w-story-en'))) d.story_en = e.value.trim();
        if ((e = stepEl.querySelector('#w-transcript'))) d.transcript_cn = e.value.trim();
        if ((e = stepEl.querySelector('#w-dialect-name'))) d.dialect_name = e.value.trim();
        if ((e = stepEl.querySelector('#w-dialect-text'))) d.dialect_text = e.value.trim();
        if ((e = stepEl.querySelector('#w-dialect-note'))) d.dialect_note = e.value.trim();
        if ((e = stepEl.querySelector('#w-ad-cn'))) d.audio_description_cn = e.value.trim();
        if ((e = stepEl.querySelector('#w-ad-en'))) d.audio_description_en = e.value.trim();
        if ((e = stepEl.querySelector('#w-recorder'))) d.recorder_name = e.value.trim();
        if ((e = stepEl.querySelector('#w-license'))) d.license = e.value;
      }
    }

    function next() {
      if (w.saving) return;
      var err = null;
      captureFields();
      if (w.step === 0) {
        if (w.mode === 'create' && !w.file) err = 'Choose an audio file. 请选择音频文件。';
        else if (!w.data.title_en || !w.data.title_cn) err = 'Both titles are required. 请填写中英文标题。';
        else if (!w.data.recorded_on) err = 'Pick the recording date. 请选择录音日期。';
      } else if (w.step === 1) {
        if (w.data.lng == null || isNaN(w.data.lng) || w.data.lat == null || isNaN(w.data.lat)) {
          err = 'Pick a location on the map or enter coordinates. 请在地图上选择位置或手动输入坐标。';
        } else if (!bboxOk(w.data.lng, w.data.lat)) {
          err = 'Coordinates are outside the Shanghai area (lng 120.0–122.5, lat 30.5–32.0). 坐标不在上海市范围内。';
        } else if (!w.data.place_cn.trim()) {
          err = 'The place name is required. 请填写地点名称。';
        }
      } else {
        if (!w.data.story_cn || !w.data.story_en) err = 'The story is required in both languages. 请用中英文填写故事。';
        else if (!w.data.transcript_cn) err = 'The Mandarin transcript is required. 请填写普通话文字稿。';
        else if (!w.data.audio_description_cn) err = 'The audio description is required — it is written for visually impaired children. 请填写音频描述——它是为视障小朋友写的。';
        else if (!w.data.recorder_name) err = 'The recorder name is required. 请填写录音人。';
      }
      if (err) { S.showBanner(err, 'error'); return; }
      if (w.step < 2) { w.step += 1; renderStep(); saveDraft(w); window.scrollTo(0, 0); }
      else save();
    }

    /* ------------------------------ save ---------------------------------- */

    function buildPayload(includeSubmitter) {
      var d = w.data;
      var p = {
        title_cn: d.title_cn, title_en: d.title_en,
        category: d.category, time_of_day: d.time_of_day, recorded_on: d.recorded_on,
        lng: Number(d.lng), lat: Number(d.lat), coord_system: 'gcj02',
        place_cn: d.place_cn.trim(), place_en: d.place_en.trim() || null,
        story_cn: d.story_cn, story_en: d.story_en, transcript_cn: d.transcript_cn,
        dialect_name: d.dialect_name || null,
        dialect_text: d.dialect_text || null,
        dialect_note: d.dialect_note || null,
        audio_description_cn: d.audio_description_cn,
        audio_description_en: d.audio_description_en || null,
        recorder_name: d.recorder_name, license: d.license
      };
      if (includeSubmitter) p.submitted_by = S.state.user.id;
      return p;
    }

    async function save() {
      if (w.saving) return;
      w.saving = true;
      var savingEl = el.querySelector('#w-saving');
      var nextBtn = el.querySelector('#w-next');
      savingEl.hidden = false;
      nextBtn.disabled = true;
      var storage = S.sb.storage.from('audio');
      var done = function (msg) {
        /* The work is safely in Supabase now — a restored copy would only offer
           to submit it a second time. */
        if (w.mode === 'create') clearDraft();
        S.announce(msg);
        S.showBanner(msg, 'success');
        S.navigate(w.isAdmin ? '#/admin' : '#/submissions');
      };

      try {
        /* -------- create: row-first insert, upload, delete row on failure --- */
        if (w.mode === 'create') {
          var id = uuid();
          var path = 'pending/' + id + '.' + extOf(w.file.name);
          var payload = buildPayload(true);
          payload.id = id;
          payload.audio_path = path;
          var ins = await S.sb.from('sounds').insert(payload);
          if (ins.error) throw new Error(ins.error.message + ' · 保存失败。');
          var up = await storage.upload(path, w.file, { contentType: w.file.type || 'audio/mpeg' });
          if (up.error) {
            await S.sb.from('sounds').delete().eq('id', id);
            throw new Error('Audio upload failed: ' + up.error.message + ' · 音频上传失败，请重试。');
          }
          if (w.isAdmin) {
            var approvedPath = 'approved/' + id + '.' + extOf(w.file.name);
            var mv = await storage.move(path, approvedPath);
            if (mv.error) {
              S.showBanner('Saved as pending — approve it from the Review tab to publish. 已保存为待审核，可在审核页发布。', 'info');
              done('Sound saved as pending 声音已保存为待审核');
              return;
            }
            var pub = await S.sb.from('sounds').update({
              status: 'approved', audio_path: approvedPath,
              approved_at: new Date().toISOString(), approved_by: S.state.user.id
            }).eq('id', id);
            if (pub.error) {
              // Roll the object back so the pending row keeps pointing at a real file.
              await storage.move(approvedPath, path).catch(function () {});
              throw new Error(pub.error.message + ' · 发布失败。');
            }
          }
          done('Sound submitted 声音已提交');
          return;
        }

        /* -------- edit: replace audio if needed, then save (resets to pending;
                    admins republish via move + approve) --------------------- */
        var base = buildPayload(false);
        var oldPath = w.row.audio_path;
        var newPath = null;

        if (w.file) {
          newPath = 'pending/' + w.id + '.' + extOf(w.file.name);
          var up2 = await storage.upload(newPath, w.file, { upsert: true, contentType: w.file.type || 'audio/mpeg' });
          if (up2.error) {
            throw new Error('Audio upload failed: ' + up2.error.message + ' · 音频上传失败，请重试。');
          }
        }

        // Only AFTER the row update commits — never leave a live row pointing
        // at a deleted object (the old file stays put if the save fails).
        function removeOld() {
          if (w.file && oldPath && oldPath !== newPath) {
            return storage.remove([oldPath]).catch(function () { /* best-effort */ });
          }
          return Promise.resolve();
        }

        var currentPath = newPath || oldPath;
        if (w.isAdmin && currentPath.indexOf('approved/') !== 0) {
          // Land as pending first (folder trigger), then move the object and publish.
          base.status = 'pending';
          if (newPath) base.audio_path = newPath;
          var updA = await S.sb.from('sounds').update(base).eq('id', w.id);
          if (updA.error) throw new Error(updA.error.message + ' · 保存失败。');
          await removeOld();
          var approvedPath = 'approved/' + w.id + '.' + extOf(currentPath);
          var mv2 = await storage.move(currentPath, approvedPath);
          if (mv2.error) {
            S.showBanner('Saved as pending — the audio could not be moved; approve it from the Review tab. 已保存为待审核；音频移动失败，请在审核页通过。', 'info');
            done('Saved as pending 已保存为待审核');
            return;
          }
          var pub2 = await S.sb.from('sounds').update({
            status: 'approved', audio_path: approvedPath,
            approved_at: new Date().toISOString(), approved_by: S.state.user.id
          }).eq('id', w.id);
          if (pub2.error) {
            // Roll the object back so the pending row keeps pointing at a real file.
            await storage.move(approvedPath, currentPath).catch(function () {});
            throw new Error(pub2.error.message + ' · 发布失败。');
          }
        } else if (w.isAdmin) {
          // Already approved: plain field update, keep status and path.
          var updB = await S.sb.from('sounds').update(base).eq('id', w.id);
          if (updB.error) throw new Error(updB.error.message + ' · 保存失败。');
          await removeOld();
        } else {
          // Member resubmit: any save resets the row to pending (RLS enforces).
          base.status = 'pending';
          if (newPath) base.audio_path = newPath;
          var updC = await S.sb.from('sounds').update(base).eq('id', w.id);
          if (updC.error) throw new Error(updC.error.message + ' · 保存失败。');
          await removeOld();
        }
        done('Saved 已保存');
      } catch (err) {
        var msg = err.message || 'Save failed. 保存失败。';
        if (msg.indexOf('TOO_MANY_PENDING') !== -1) {
          msg = 'You already have 5 submissions waiting for review — please wait. 你已有 5 条待审核投稿，请等待审核完成后再提交。';
        } else if (msg.indexOf('AUDIO_FOLDER_MISMATCH') !== -1) {
          msg = 'The audio file is missing or in the wrong folder. 音频文件缺失或位置错误，请重试。';
        }
        S.showBanner(msg, 'error');
      } finally {
        w.saving = false;
        savingEl.hidden = true;
        nextBtn.disabled = false;
      }
    }

    /* ------------------------------ boot ----------------------------------- */

    function start() {
      if (w.mode === 'edit') {
        if (!S.sb) {
          el.innerHTML = '<div class="view-content"><div class="card"><p>The site is not configured yet. 网站尚未配置。</p></div></div>';
          return;
        }
        S.sb.from('sounds').select('*').eq('id', w.id).maybeSingle().then(function (res) {
          if (destroyed) return;
          var row = res.data;
          var allowed = row && (w.isAdmin || (row.submitted_by === S.state.user.id && row.status !== 'approved'));
          if (!row || !allowed) {
            el.innerHTML = '<div class="view-content"><div class="card" style="text-align:center">'
              + '<h1 class="view-title">Not found 未找到</h1>'
              + '<p style="margin:10px 0 14px">You can only edit your own pending or rejected submissions. 你只能编辑自己待审核或被退回的投稿。</p>'
              + '<a class="btn btn-primary" href="#/submissions">My submissions · 我的投稿</a></div></div>';
            return;
          }
          prefill(row);
          renderStep();
        });
      } else {
        renderStep();
      }
    }
    start();

    if (restored) {
      S.showBanner(restored.hadFile
        ? 'We kept your draft — please choose the recording again. 已保留你的草稿，请重新选择录音文件。'
        : 'We kept your draft. 已保留你的草稿。', 'info');
    }

    return function destroy() {
      destroyed = true;
      el.removeEventListener('input', onEdit);
      el.removeEventListener('change', onEdit);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', captureNow);
      window.removeEventListener('beforeunload', captureNow);
      if (w._cleanupStep2) { w._cleanupStep2(); w._cleanupStep2 = null; }
    };
  }

  /* -------------------------------------------------- my submissions view -- */

  function renderSubmissions(el) {
    var destroyed = false;
    var rowsCache = [];

    el.innerHTML =
      '<div class="view-content">'
      + '<h1 class="view-title">My submissions <span class="nav-cn">我的投稿</span></h1>'
      + '<p class="view-subtitle">Your sounds, their review status, and any notes from the admin. 查看你的声音、审核状态和管理员的意见。</p>'
      + '<div id="subs-list"></div>'
      + '</div>';
    var listEl = el.querySelector('#subs-list');

    function cardHtml(row) {
      var t = S.label('time', row.time_of_day);
      var c = S.label('category', row.category);
      var canWithdraw = row.status !== 'approved';
      return '<article class="card submission-card">'
        + '<div class="submission-head">'
        + '<h3>' + S.esc(row.title_en) + ' <span class="list-cn">' + S.esc(row.title_cn) + '</span></h3>'
        + S.statusBadge(row.status)
        + '</div>'
        + '<div class="list-meta">' + S.esc(c.cn) + ' · ' + S.esc(t.cn) + ' · ' + S.esc(row.place_cn)
        + ' · submitted ' + S.esc(String(row.created_at).slice(0, 10)) + '</div>'
        + (row.review_note
          ? '<div class="review-note-box"><strong>Note from the admin · 管理员意见</strong><p>' + S.esc(row.review_note) + '</p></div>'
          : '')
        + '<div class="list-actions">'
        + '<button type="button" class="btn btn-sm btn-primary" data-sub-play="' + S.esc(row.id) + '">Play 播放</button>'
        + '<a class="btn btn-sm" href="#/sound/' + S.esc(row.id) + '">View 查看</a>'
        + (canWithdraw
          ? '<a class="btn btn-sm" href="#/submit?id=' + S.esc(row.id) + '">Edit &amp; resubmit 修改并重新提交</a>'
            + '<button type="button" class="btn btn-sm btn-danger" data-withdraw="' + S.esc(row.id) + '">Withdraw 撤回</button>'
          : '')
        + '</div></article>';
    }

    async function refresh() {
      var res = await S.sb.from('sounds').select('*')
        .eq('submitted_by', S.state.user.id)
        .order('created_at', { ascending: false });
      if (destroyed) return;
      if (res.error) {
        S.showBanner('Could not load your submissions. ' + res.error.message + ' · 无法加载你的投稿。', 'error');
        return;
      }
      rowsCache = res.data || [];
      if (!rowsCache.length) {
        listEl.innerHTML = '<div class="card" style="text-align:center">'
          + '<h2 style="font-family:var(--font-display)">Nothing yet 还没有投稿</h2>'
          + '<p style="margin:8px 0 14px">Your submitted sounds will appear here. 你提交的声音会显示在这里。</p>'
          + '<a class="btn btn-primary" href="#/submit">Add a sound · 添加声音</a></div>';
        return;
      }
      listEl.innerHTML = rowsCache.map(cardHtml).join('');
      listEl.querySelectorAll('[data-sub-play]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var row = rowsCache.find(function (r) { return r.id === btn.getAttribute('data-sub-play'); });
          if (row) S.Player.toggle(row);
        });
      });
      listEl.querySelectorAll('[data-withdraw]').forEach(function (btn) {
        btn.addEventListener('click', function () { withdraw(btn); });
      });
    }

    function withdraw(btn) {
      var id = btn.getAttribute('data-withdraw');
      var row = rowsCache.find(function (r) { return r.id === id; });
      if (!row) return;
      if (!btn.getAttribute('data-armed')) {
        btn.setAttribute('data-armed', '1');
        btn.textContent = 'Confirm withdraw? 确认撤回？';
        setTimeout(function () {
          if (btn.isConnected) { btn.removeAttribute('data-armed'); btn.textContent = 'Withdraw 撤回'; }
        }, 4000);
        return;
      }
      btn.disabled = true;
      (async function () {
        if (row.audio_path) await S.sb.storage.from('audio').remove([row.audio_path]);  // best-effort
        var del = await S.sb.from('sounds').delete().eq('id', id);
        if (del.error) {
          S.showBanner('Could not withdraw: ' + del.error.message + ' · 撤回失败。', 'error');
          btn.disabled = false;
          return;
        }
        S.announce('Withdrawn 已撤回');
        refresh();
      })();
    }

    refresh();

    return function destroy() { destroyed = true; };
  }

  S.registerView('submit', { render: render });
  S.registerView('submissions', { render: renderSubmissions });
})();
