/* ==========================================================================
   WLSA Sound Art Club — Shanghai Sound Map: auth views.
   #/login, #/signup, and the "waiting for admin approval" pending screen.
   ========================================================================== */
(function () {
  'use strict';

  var S = window.SoundMap;

  function notConfigured(el) {
    el.innerHTML = '<div class="view-content"><div class="card">'
      + '<p>The site is not configured yet — fill in config.js (see playbooks/launch-soundmap.md). '
      + '网站尚未配置，请先填写 config.js。</p></div></div>';
  }

  function renderLogin(el) {
    if (!S.sb) return notConfigured(el);
    el.innerHTML =
      '<div class="view-content">'
      + '<div class="card auth-card">'
      + '<h1 class="view-title">Log in <span class="nav-cn">登录</span></h1>'
      + '<p class="view-subtitle">Club members log in to submit sounds. 社团成员登录后投稿。</p>'
      + '<form id="login-form">'
      + '<div class="field"><label for="login-email">Email · 邮箱</label>'
      + '<input id="login-email" type="email" required autocomplete="email"></div>'
      + '<div class="field"><label for="login-password">Password · 密码</label>'
      + '<input id="login-password" type="password" required autocomplete="current-password"></div>'
      + '<div id="login-error" class="field-error" hidden></div>'
      + '<button class="btn btn-primary" type="submit">Log in · 登录</button>'
      + '</form>'
      + '<p class="auth-links">No account? <a href="#/signup">Join the club · 加入社团</a></p>'
      + '</div></div>';

    el.querySelector('#login-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var errEl = el.querySelector('#login-error');
      errEl.hidden = true;
      var btn = el.querySelector('button[type="submit"]');
      btn.disabled = true;
      var email = el.querySelector('#login-email').value.trim();
      var password = el.querySelector('#login-password').value;
      var res = await S.sb.auth.signInWithPassword({ email: email, password: password });
      if (res.error) {
        errEl.textContent = 'Login failed: ' + res.error.message + ' · 登录失败，请检查邮箱和密码。';
        errEl.hidden = false;
        btn.disabled = false;
        return;
      }
      S.announce('Logged in 已登录');
      S.refreshAuth();
    });
  }

  function renderSignup(el) {
    if (!S.sb) return notConfigured(el);
    el.innerHTML =
      '<div class="view-content">'
      + '<div class="card auth-card">'
      + '<h1 class="view-title">Join the club <span class="nav-cn">加入社团</span></h1>'
      + '<p class="view-subtitle">Create an account to submit sounds. An admin approves your account before you can submit. '
      + '注册账号即可投稿；管理员审核通过后你才能提交声音。</p>'
      + '<form id="signup-form">'
      + '<div class="field"><label for="signup-email">Email · 邮箱</label>'
      + '<input id="signup-email" type="email" required autocomplete="email"></div>'
      + '<div class="field"><label for="signup-name">Name · 姓名 <span class="hint">(optional 可选)</span></label>'
      + '<input id="signup-name" type="text" autocomplete="name"></div>'
      + '<div class="field"><label for="signup-password">Password · 密码 <span class="hint">(at least 6 characters 至少 6 位)</span></label>'
      + '<input id="signup-password" type="password" required minlength="6" autocomplete="new-password"></div>'
      + '<div id="signup-error" class="field-error" hidden></div>'
      + '<button class="btn btn-primary" type="submit">Sign up · 注册</button>'
      + '</form>'
      + '<p class="auth-links">Already have an account? <a href="#/login">Log in · 登录</a></p>'
      + '</div></div>';

    el.querySelector('#signup-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var errEl = el.querySelector('#signup-error');
      errEl.hidden = true;
      var btn = el.querySelector('button[type="submit"]');
      btn.disabled = true;
      var email = el.querySelector('#signup-email').value.trim();
      var password = el.querySelector('#signup-password').value;
      var name = el.querySelector('#signup-name').value.trim();

      var res = await S.sb.auth.signUp({ email: email, password: password });
      if (res.error) {
        errEl.textContent = 'Signup failed: ' + res.error.message + ' · 注册失败，请重试。';
        errEl.hidden = false;
        btn.disabled = false;
        return;
      }
      if (name && res.data.user) {
        // Display name is optional; profile role stays 'pending' (RLS-enforced).
        await S.sb.from('profiles').update({ display_name: name }).eq('id', res.data.user.id);
      }
      S.announce('Account created 账号已创建');
      S.refreshAuth();
    });
  }

  function renderPending(el) {
    el.innerHTML =
      '<div class="view-content">'
      + '<div class="card auth-card" style="text-align:center">'
      + '<h1 class="view-title">Welcome 欢迎!</h1>'
      + '<p style="margin-bottom:14px">Your account is waiting for admin approval. '
      + 'Once an admin approves it, you can submit sounds and see your submissions here.</p>'
      + '<p class="view-subtitle">你的账号正在等待管理员审核。审核通过后，你就可以投稿并查看自己的声音。</p>'
      + '<button id="pending-refresh" class="btn" type="button">Check again · 刷新状态</button>'
      + '</div></div>';
    el.querySelector('#pending-refresh').addEventListener('click', function () {
      S.refreshAuth();
    });
  }

  S.registerView('login', { render: renderLogin });
  S.registerView('signup', { render: renderSignup });
  S.registerView('pending', { render: renderPending });
})();
