/* WLSA Sound Art Club — "Sound Blind Box" game logic. */
(function () {
  'use strict';

  var ROUNDS = 10;
  var data = (window.SOUNDS && window.SOUNDS.sounds) ? window.SOUNDS : null;

  var sounds = [];
  var round = 0;
  var score = 0;
  var current = null;
  var answered = false;
  var audio = new Audio();

  // --- DOM ---------------------------------------------------------------
  function $(sel) { return document.querySelector(sel); }
  var el = {
    home: $('.screen-home'),
    game: $('.screen-game'),
    results: $('.screen-results'),
    start: $('#start-btn'),
    soundCount: $('#sound-count'),
    round: $('#round'),
    score: $('#score'),
    bar: $('#bar'),
    play: $('.play-btn'),
    hintWarn: $('.hint-warn'),
    options: $('.options'),
    bigScore: $('.results .big'),
    rank: $('.results .rank'),
    again: $('#again'),
    homeBtn: $('#home-btn')
  };

  // --- Helpers -----------------------------------------------------------
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function pickDistractors(s) {
    var same = data.sounds.filter(function (x) { return x.id !== s.id && x.category === s.category; });
    var others = data.sounds.filter(function (x) { return x.id !== s.id && x.category !== s.category; });
    var pool = shuffle(same).concat(shuffle(others));
    return pool.slice(0, 3);
  }

  // --- Screens -----------------------------------------------------------
  function show(screen) {
    document.querySelectorAll('.screen').forEach(function (n) { n.classList.remove('is-active'); });
    screen.classList.add('is-active');
  }

  // --- Audio -------------------------------------------------------------
  function playCurrent() {
    if (!current) return;
    el.hintWarn.style.display = 'none';
    el.play.classList.add('is-playing');
    audio.src = current.sound.file;
    audio.currentTime = 0;
    audio.play().catch(function () { el.play.classList.remove('is-playing'); });
    setTimeout(function () { el.play.classList.remove('is-playing'); }, 900);
  }

  audio.addEventListener('error', function () {
    if (current) {
      el.hintWarn.textContent = 'Audio missing — run scripts/fetch_sounds.py to download sounds. 缺少音频，请先运行 fetch_sounds.py。';
      el.hintWarn.style.display = 'block';
    }
  });

  // --- Game flow ---------------------------------------------------------
  function startGame() {
    if (!data) return;
    sounds = shuffle(data.sounds);
    round = 0;
    score = 0;
    answered = false;
    show(el.game);
    renderRound();
  }

  function renderRound() {
    answered = false;
    el.hintWarn.style.display = 'none';
    current = { sound: sounds[round], options: buildOptions(sounds[round]) };

    el.round.textContent = (round + 1) + ' / ' + ROUNDS;
    el.score.innerHTML = '<b>' + score + '</b> pts';
    el.bar.style.width = (round / ROUNDS * 100) + '%';

    el.play.classList.remove('is-playing');
    el.options.innerHTML = '';
    current.options.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.className = 'opt';
      btn.type = 'button';
      btn.dataset.id = opt.id;
      btn.innerHTML = '<span>' + opt.en + '</span><span class="cn">' + opt.cn + '</span>';
      btn.addEventListener('click', function () { onAnswer(btn, opt.id); });
      el.options.appendChild(btn);
    });
  }

  function buildOptions(s) {
    return shuffle([s].concat(pickDistractors(s)));
  }

  function onAnswer(btn, chosenId) {
    if (answered) return;
    answered = true;

    var correct = chosenId === current.sound.id;
    if (correct) score++;

    var buttons = el.options.querySelectorAll('.opt');
    buttons.forEach(function (b) {
      b.disabled = true;
      var id = Number(b.dataset.id);
      if (id === current.sound.id) { b.classList.add('is-correct'); }
      else if (id === chosenId) { b.classList.add('is-wrong'); }
      else { b.classList.add('is-dimmed'); }
    });

    el.score.innerHTML = '<b>' + score + '</b> pts';
    setTimeout(next, correct ? 1100 : 1800);
  }

  function next() {
    round++;
    if (round >= ROUNDS) { showResults(); }
    else { renderRound(); }
  }

  function showResults() {
    el.bar.style.width = '100%';
    el.bigScore.textContent = score + '/' + ROUNDS;

    var rankEn, rankCn;
    if (score >= 9) { rankEn = 'City sound master!'; rankCn = '城市声音大师！'; }
    else if (score >= 7) { rankEn = 'Sharp ears!'; rankCn = '耳朵真灵！'; }
    else if (score >= 4) { rankEn = 'Nice try — keep listening!'; rankCn = '再接再厉，继续听！'; }
    else { rankEn = 'Listen again — the city has many voices.'; rankCn = '再听一次，城市有很多声音。'; }

    el.rank.textContent = rankEn + ' ' + rankCn;
    show(el.results);
  }

  // --- Wire up -----------------------------------------------------------
  el.start.addEventListener('click', startGame);
  el.play.addEventListener('click', playCurrent);
  el.again.addEventListener('click', startGame);
  el.homeBtn.addEventListener('click', function () { show(el.home); });

  // --- Init --------------------------------------------------------------
  if (!data) {
    el.soundCount.textContent = 'Sounds not loaded — run scripts/fetch_sounds.py first.';
  } else {
    el.soundCount.textContent = data.sounds.length + ' city sounds · 城市声音';
  }
})();
