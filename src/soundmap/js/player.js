/* ==========================================================================
   WLSA Sound Art Club — Shanghai Sound Map: the ONE global player.
   Every Play button on the site (map popup, list card, detail page, admin
   queue) feeds this single bottom bar, so audio never overlaps and
   screen-reader users have exactly one predictable control point.
   ========================================================================== */
(function () {
  'use strict';

  var bar = document.getElementById('player-bar');
  var audio = document.getElementById('player-audio');
  var toggleBtn = document.getElementById('player-toggle');
  var titleEl = document.getElementById('player-title');
  var subEl = document.getElementById('player-sub');
  var storyLink = document.getElementById('player-story');
  var closeBtn = document.getElementById('player-close');
  var iconPlay = toggleBtn.querySelector('.icon-play');
  var iconPause = toggleBtn.querySelector('.icon-pause');

  var current = null;              // { sound, url }
  var urlCache = {};               // sound.id -> { url, expiresAt }
  var retried = false;
  var errored = false;             // the 'error' event already reported this load

  var SB = function () { return window.SoundMap.sb; };

  /* Signed URLs: the audio bucket is PRIVATE. Approved audio is served to the
     public via 4-hour signed URLs, cached per session and refreshed on 403. */
  async function signedUrl(sound) {
    var now = Date.now();
    var hit = urlCache[sound.id];
    if (hit && hit.expiresAt > now + 60000) return hit.url;

    var res = await SB().storage.from('audio').createSignedUrl(sound.audio_path, 14400);
    if (res.error) throw res.error;
    urlCache[sound.id] = { url: res.data.signedUrl, expiresAt: now + 14400 * 1000 - 60000 };
    return res.data.signedUrl;
  }

  function setBarState(state) {
    toggleBtn.classList.toggle('is-loading', state === 'loading');
    iconPlay.hidden = state === 'playing';
    iconPause.hidden = state !== 'playing';
    toggleBtn.setAttribute('aria-label', state === 'playing' ? 'Pause 暂停' : 'Play 播放');
  }

  function fill(sound, url) {
    current = { sound: sound, url: url };
    errored = false;
    titleEl.textContent = sound.title_en + ' · ' + sound.title_cn;
    subEl.textContent = window.SoundMap.label('category', sound.category).cn + ' · '
      + window.SoundMap.label('time', sound.time_of_day).cn + ' — '
      + (sound.place_cn || '');
    storyLink.href = '#/sound/' + sound.id;
    storyLink.hidden = false;
    bar.hidden = false;
    document.body.classList.add('player-open');
    audio.src = url;
  }

  /* play() rejects without firing an error event in some failure modes;
     report that unless the error event already said something specific. */
  function playCurrent() {
    setBarState('loading');
    return audio.play().then(function () {
      setBarState('playing');
      return true;
    }).catch(function (err) {
      setBarState('paused');
      if (!errored && (!err || err.name !== 'AbortError')) {
        window.SoundMap.showBanner('Playback failed. 播放失败，请重试。', 'error');
      }
      return false;
    });
  }

  function start() {
    playCurrent().then(function (ok) {
      if (ok) {
        window.SoundMap.announce('Now playing: ' + current.sound.title_en + ' · 正在播放：' + current.sound.title_cn);
      }
    });
  }

  async function toggle(sound) {
    if (!window.SoundMap.sb) {
      window.SoundMap.showBanner('The site is not configured yet — fill in config.js first. 网站尚未配置，请先填写 config.js。', 'error');
      return;
    }
    if (current && current.sound.id === sound.id) {
      if (audio.paused) playCurrent();
      else { audio.pause(); setBarState('paused'); }
      return;
    }
    retried = false;
    setBarState('loading');
    try {
      var url = await signedUrl(sound);
      fill(sound, url);
      start();
    } catch (err) {
      setBarState('paused');
      window.SoundMap.showBanner('Could not load the audio for this sound. ' + err.message + ' · 无法加载这段声音的音频。', 'error');
    }
  }

  function stop() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    current = null;
    bar.hidden = true;
    document.body.classList.remove('player-open');
    setBarState('paused');
  }

  toggleBtn.addEventListener('click', function () {
    if (!current) return;
    if (audio.paused) playCurrent();
    else { audio.pause(); setBarState('paused'); }
  });

  closeBtn.addEventListener('click', stop);

  audio.addEventListener('playing', function () { setBarState('playing'); });
  audio.addEventListener('pause', function () { if (current) setBarState('paused'); });
  audio.addEventListener('ended', function () { setBarState('paused'); });
  audio.addEventListener('error', function () {
    if (!current) return;
    var code = audio.error && audio.error.code;
    errored = true;
    /* 3 = MEDIA_ERR_DECODE, 4 = MEDIA_ERR_SRC_NOT_SUPPORTED: the bytes are
       simply unplayable (e.g. MPEG Layer II mislabeled as .mp3) — re-signing
       the same bytes cannot help, so say what is actually wrong. */
    if (code === 3 || code === 4) {
      setBarState('paused');
      window.SoundMap.showBanner('This recording uses a format your browser can\'t play (it may be MP2, not MP3). '
        + '这段录音的格式浏览器无法播放（可能是 MP2 而非 MP3）。', 'error');
      return;
    }
    /* 1 = MEDIA_ERR_ABORTED: the user or the app interrupted; no banner. */
    if (code === 1) { setBarState('paused'); return; }
    /* 2 = MEDIA_ERR_NETWORK (or unknown): the signed URL may have expired
       mid-session — refresh once and retry. */
    if (!retried) {
      retried = true;
      var sound = current.sound;
      delete urlCache[sound.id];
      signedUrl(sound).then(function (url) {
        audio.src = url;
        audio.play().catch(function () { setBarState('paused'); });
      }).catch(function () {
        setBarState('paused');
        window.SoundMap.showBanner('Audio failed to load. 音频加载失败，请稍后再试。', 'error');
      });
    } else {
      setBarState('paused');
      window.SoundMap.showBanner('Audio failed to load. 音频加载失败，请稍后再试。', 'error');
    }
  });

  window.SoundMap = window.SoundMap || {};
  window.SoundMap.Player = {
    toggle: toggle,
    stop: stop,
    isPlaying: function (id) { return !!(current && current.sound.id === id && !audio.paused); }
  };
})();
