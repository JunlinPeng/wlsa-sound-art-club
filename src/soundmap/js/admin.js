/* ==========================================================================
   WLSA Sound Art Club — Shanghai Sound Map: admin console (#/admin).
   Three tabs — Review 审核 / Sounds 声音 / Members 成员.
   Approve = storage.move(pending/ → approved/) + status update; rejecting
   REQUIRES a bilingual note (the DB also enforces it). All destructive
   actions are two-step. RLS + triggers remain the real backstop.
   ========================================================================== */
(function () {
  'use strict';

  var S = window.SoundMap;
  var ROLE_LABELS = { pending: 'Pending 待审核', member: 'Member 成员', admin: 'Admin 管理员' };

  function render(el) {
    var destroyed = false;
    var body = null;

    el.innerHTML =
      '<div class="view-content">'
      + '<h1 class="view-title">Admin <span class="nav-cn">管理后台</span></h1>'
      + '<div class="admin-toolbar">'
      + '<div class="admin-tabs" role="tablist" aria-label="Admin sections 管理分区">'
      + '<button type="button" class="admin-tab is-active" data-tab="review" role="tab">Review 审核 <span class="badge badge-pending" id="badge-review" hidden></span></button>'
      + '<button type="button" class="admin-tab" data-tab="sounds" role="tab">Sounds 声音</button>'
      + '<button type="button" class="admin-tab" data-tab="members" role="tab">Members 成员 <span class="badge badge-pending" id="badge-members" hidden></span></button>'
      + '</div>'
      + '<a class="btn btn-primary" href="#/submit">Add sound · 添加声音</a>'
      + '</div>'
      + '<div id="admin-body"></div>'
      + '</div>';
    body = el.querySelector('#admin-body');

    var TABS = { review: renderReview, sounds: renderSounds, members: renderMembers };

    function openTab(name) {
      el.querySelectorAll('.admin-tab').forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-tab') === name);
      });
      TABS[name]();
    }

    el.querySelectorAll('.admin-tab').forEach(function (b) {
      b.addEventListener('click', function () { openTab(b.getAttribute('data-tab')); });
    });

    async function updateBadges() {
      if (destroyed) return;
      try {
        var res = await Promise.all([
          S.sb.from('sounds').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          S.sb.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'pending')
        ]);
        if (destroyed) return;
        var b1 = el.querySelector('#badge-review');
        if (res[0].count) { b1.textContent = res[0].count; b1.hidden = false; }
        var b2 = el.querySelector('#badge-members');
        if (res[1].count) { b2.textContent = res[1].count; b2.hidden = false; }
      } catch (e) { /* badges are cosmetic — never break the console */ }
    }

    /* ----------------------------------------------------- Review tab ----- */

    async function renderReview() {
      body.innerHTML = '<p class="view-subtitle">Loading… 加载中…</p>';
      var res = await S.sb.from('sounds').select('*')
        .eq('status', 'pending').order('created_at', { ascending: true });
      if (destroyed) return;
      if (res.error) {
        body.innerHTML = '<div class="card"><p>' + S.esc(res.error.message) + '</p></div>';
        return;
      }
      var rows = res.data || [];

      var submitters = {};
      var ids = rows.map(function (r) { return r.submitted_by; }).filter(Boolean);
      if (ids.length) {
        var prof = await S.sb.from('profiles').select('*').in('id', ids);
        (prof.data || []).forEach(function (p) { submitters[p.id] = p; });
      }

      // Which pending rows are missing their audio object?
      var audioState = {};
      await Promise.all(rows.map(async function (r) {
        var s = await S.sb.storage.from('audio').createSignedUrl(r.audio_path, 60);
        audioState[r.id] = !s.error;
      }));

      if (destroyed) return;
      if (!rows.length) {
        body.innerHTML = '<div class="card" style="text-align:center">'
          + '<h2 style="font-family:var(--font-display)">Queue is empty 队列为空</h2>'
          + '<p style="margin:8px 0 14px">No sounds are waiting for review. 没有待审核的声音。</p></div>';
        return;
      }

      body.innerHTML = '<div class="submission-list">' + rows.map(function (r) {
        var sub = submitters[r.submitted_by] || {};
        var missing = !audioState[r.id];
        return '<article class="card submission-card" id="rev-' + S.esc(r.id) + '">'
          + '<div class="submission-head"><h3>' + S.esc(r.title_en) + ' <span class="list-cn">' + S.esc(r.title_cn) + '</span></h3>'
          + (missing ? '<span class="badge badge-missing">Missing audio 缺音频</span>' : S.statusBadge(r.status))
          + '</div>'
          + '<div class="list-meta">' + S.esc(S.label('category', r.category).cn) + ' · ' + S.esc(S.label('time', r.time_of_day).cn)
          + ' · ' + S.esc(r.place_cn) + ' · by ' + S.esc(sub.display_name || sub.email || 'unknown') + '</div>'
          + '<div class="list-actions">'
          + (missing ? '' : '<button type="button" class="btn btn-sm" data-rev-play="' + S.esc(r.id) + '">Play 播放</button>')
          + '<a class="btn btn-sm" href="#/sound/' + S.esc(r.id) + '">Details 详情</a>'
          + '<a class="btn btn-sm" href="#/submit?id=' + S.esc(r.id) + '">Edit 编辑</a>'
          + '<button type="button" class="btn btn-sm btn-primary" data-rev-approve="' + S.esc(r.id) + '">Approve 通过</button>'
          + '<button type="button" class="btn btn-sm btn-danger" data-rev-reject="' + S.esc(r.id) + '">Reject 退回</button>'
          + '</div>'
          + '<div class="reject-note" id="rev-note-' + S.esc(r.id) + '" hidden>'
          + '<div class="field"><label for="rev-note-input-' + S.esc(r.id) + '">Review note · 退回意见（bilingual 中英文，必填）</label>'
          + '<textarea id="rev-note-input-' + S.esc(r.id) + '" rows="3" placeholder="Explain what to fix — the member will see this. 请说明需要修改的地方，投稿人会看到这段意见。"></textarea></div>'
          + '<button type="button" class="btn btn-danger" data-rev-confirm-reject="' + S.esc(r.id) + '">Confirm reject · 确认退回</button>'
          + '</div></article>';
      }).join('') + '</div>';

      function byId(attr, b) { return rows.find(function (x) { return x.id === b.getAttribute(attr); }); }

      body.querySelectorAll('[data-rev-play]').forEach(function (b) {
        b.addEventListener('click', function () {
          var row = byId('data-rev-play', b);
          if (row) S.Player.toggle(row);
        });
      });
      body.querySelectorAll('[data-rev-approve]').forEach(function (b) {
        b.addEventListener('click', function () { approve(byId('data-rev-approve', b)); });
      });
      body.querySelectorAll('[data-rev-reject]').forEach(function (b) {
        b.addEventListener('click', function () {
          var box = body.querySelector('#rev-note-' + b.getAttribute('data-rev-reject'));
          if (box) box.hidden = !box.hidden;
        });
      });
      body.querySelectorAll('[data-rev-confirm-reject]').forEach(function (b) {
        b.addEventListener('click', function () { confirmReject(byId('data-rev-confirm-reject', b)); });
      });
    }

    async function approve(row) {
      if (!row) return;
      var storage = S.sb.storage.from('audio');
      var path = row.audio_path;
      var movedFrom = null;
      if (path.indexOf('pending/') === 0) {
        var to = 'approved/' + path.slice('pending/'.length);
        var mv = await storage.move(path, to);
        if (mv.error) {
          S.showBanner('Cannot approve — the audio file is missing: ' + mv.error.message + ' · 音频文件缺失，无法通过。', 'error');
          return;
        }
        movedFrom = path;
        path = to;
      }
      var upd = await S.sb.from('sounds').update({
        status: 'approved', audio_path: path,
        approved_at: new Date().toISOString(), approved_by: S.state.user.id
      }).eq('id', row.id);
      if (upd.error) {
        // Roll the object back so the pending row keeps pointing at a real file.
        if (movedFrom) await storage.move(path, movedFrom).catch(function () {});
        S.showBanner('Approve failed: ' + upd.error.message + ' · 通过失败。', 'error');
        return;
      }
      S.announce('Approved 已通过');
      openTab('review');
      updateBadges();
    }

    async function confirmReject(row) {
      if (!row) return;
      var input = body.querySelector('#rev-note-input-' + row.id);
      var note = input ? input.value.trim() : '';
      if (!note) {
        S.showBanner('A bilingual review note is required. 请填写中英文退回意见。', 'error');
        if (input) input.focus();
        return;
      }
      var upd = await S.sb.from('sounds').update({ status: 'rejected', review_note: note }).eq('id', row.id);
      if (upd.error) { S.showBanner('Reject failed: ' + upd.error.message + ' · 退回失败。', 'error'); return; }
      S.announce('Rejected 已退回');
      openTab('review');
      updateBadges();
    }

    /* ----------------------------------------------------- Sounds tab ----- */

    async function renderSounds() {
      body.innerHTML = '<p class="view-subtitle">Loading… 加载中…</p>';
      var res = await S.sb.from('sounds').select('*').order('created_at', { ascending: false });
      if (destroyed) return;
      if (res.error) {
        body.innerHTML = '<div class="card"><p>' + S.esc(res.error.message) + '</p></div>';
        return;
      }
      var rows = res.data || [];
      var filter = 'all';

      body.innerHTML =
        '<div class="chips" role="group" aria-label="Status filter 状态筛选">'
        + '<button type="button" class="chip is-on" data-status="all" aria-pressed="true">All 全部</button>'
        + '<button type="button" class="chip" data-status="pending" aria-pressed="false">Pending 待审核</button>'
        + '<button type="button" class="chip" data-status="approved" aria-pressed="false">Approved 已发布</button>'
        + '<button type="button" class="chip" data-status="rejected" aria-pressed="false">Rejected 已退回</button>'
        + '</div>'
        + '<div id="sounds-list"></div>';
      var listEl = body.querySelector('#sounds-list');

      function draw() {
        var visible = rows.filter(function (r) { return filter === 'all' || r.status === filter; });
        if (!visible.length) {
          listEl.innerHTML = '<div class="card" style="text-align:center"><p>No sounds match this filter. 没有匹配的声音。</p></div>';
          return;
        }
        listEl.innerHTML = visible.map(function (r) {
          return '<article class="card submission-card">'
            + '<div class="submission-head"><h3>' + S.esc(r.title_en) + ' <span class="list-cn">' + S.esc(r.title_cn) + '</span></h3>'
            + S.statusBadge(r.status) + '</div>'
            + '<div class="list-meta">' + S.esc(S.label('category', r.category).cn) + ' · ' + S.esc(S.label('time', r.time_of_day).cn)
            + ' · ' + S.esc(r.place_cn) + ' · ' + S.esc(String(r.created_at).slice(0, 10)) + '</div>'
            + '<div class="list-actions">'
            + (r.status === 'approved' ? '<button type="button" class="btn btn-sm" data-snd-play="' + S.esc(r.id) + '">Play 播放</button>' : '')
            + '<a class="btn btn-sm" href="#/sound/' + S.esc(r.id) + '">Details 详情</a>'
            + '<a class="btn btn-sm" href="#/submit?id=' + S.esc(r.id) + '">Edit 编辑</a>'
            + '<button type="button" class="btn btn-sm btn-danger" data-snd-delete="' + S.esc(r.id) + '">Delete 删除</button>'
            + '</div></article>';
        }).join('');

        listEl.querySelectorAll('[data-snd-play]').forEach(function (b) {
          b.addEventListener('click', function () {
            var row = rows.find(function (x) { return x.id === b.getAttribute('data-snd-play'); });
            if (row) S.Player.toggle(row);
          });
        });
        listEl.querySelectorAll('[data-snd-delete]').forEach(function (b) {
          b.addEventListener('click', function () { deleteRow(b, rows.find(function (x) { return x.id === b.getAttribute('data-snd-delete'); })); });
        });
      }

      body.querySelectorAll('[data-status]').forEach(function (chip) {
        chip.addEventListener('click', function () {
          filter = chip.getAttribute('data-status');
          body.querySelectorAll('[data-status]').forEach(function (c) {
            var on = c === chip;
            c.classList.toggle('is-on', on);
            c.setAttribute('aria-pressed', String(on));
          });
          draw();
        });
      });
      draw();
    }

    function deleteRow(btn, row) {
      if (!row) return;
      if (!btn.getAttribute('data-armed')) {
        btn.setAttribute('data-armed', '1');
        btn.textContent = 'Confirm delete? 确认删除？';
        setTimeout(function () {
          if (btn.isConnected) { btn.removeAttribute('data-armed'); btn.textContent = 'Delete 删除'; }
        }, 4000);
        return;
      }
      btn.disabled = true;
      (async function () {
        if (row.audio_path) await S.sb.storage.from('audio').remove([row.audio_path]);  // best-effort
        var del = await S.sb.from('sounds').delete().eq('id', row.id);
        if (del.error) {
          S.showBanner('Delete failed: ' + del.error.message + ' · 删除失败。', 'error');
          btn.disabled = false;
          return;
        }
        S.announce('Deleted 已删除');
        openTab('sounds');
      })();
    }

    /* ---------------------------------------------------- Members tab ----- */

    async function renderMembers() {
      body.innerHTML = '<p class="view-subtitle">Loading… 加载中…</p>';
      var res = await S.sb.from('profiles').select('*').order('created_at', { ascending: true });
      if (destroyed) return;
      if (res.error) {
        body.innerHTML = '<div class="card"><p>' + S.esc(res.error.message) + '</p></div>';
        return;
      }
      var rows = res.data || [];
      body.innerHTML = rows.map(function (p) {
        var roleActions = '';
        if (p.role === 'pending') {
          roleActions = '<button type="button" class="btn btn-sm btn-primary" data-mem-approve="' + S.esc(p.id) + '">Approve account · 通过账号</button>';
        } else if (p.role === 'member') {
          roleActions = '<button type="button" class="btn btn-sm" data-mem-promote="' + S.esc(p.id) + '">Make admin · 设为管理员</button>';
        } else {
          roleActions = '<button type="button" class="btn btn-sm btn-danger" data-mem-demote="' + S.esc(p.id) + '">Demote · 降级</button>';
        }
        return '<article class="card admin-row">'
          + '<div><strong>' + S.esc(p.display_name || '(no name 未填姓名)') + '</strong>'
          + '<div class="list-meta">' + S.esc(p.email || '(no email 无邮箱)') + ' · joined ' + S.esc(String(p.created_at).slice(0, 10)) + '</div></div>'
          + '<div class="admin-row-actions">'
          + '<span class="badge badge-' + (p.role === 'admin' ? 'approved' : (p.role === 'pending' ? 'pending' : 'missing')) + '">' + S.esc(ROLE_LABELS[p.role] || p.role) + '</span>'
          + '<button type="button" class="btn btn-sm" data-mem-rename="' + S.esc(p.id) + '">Edit name · 改姓名</button>'
          + roleActions
          + '</div></article>';
      }).join('');

      body.querySelectorAll('[data-mem-approve]').forEach(function (b) {
        b.addEventListener('click', function () { setRole(b.getAttribute('data-mem-approve'), 'member'); });
      });
      body.querySelectorAll('[data-mem-promote]').forEach(function (b) {
        b.addEventListener('click', function () { setRole(b.getAttribute('data-mem-promote'), 'admin'); });
      });
      body.querySelectorAll('[data-mem-demote]').forEach(function (b) {
        b.addEventListener('click', function () { setRole(b.getAttribute('data-mem-demote'), 'member'); });
      });
      body.querySelectorAll('[data-mem-rename]').forEach(function (b) {
        b.addEventListener('click', function () { rename(b.getAttribute('data-mem-rename')); });
      });
    }

    async function setRole(id, role) {
      var upd = await S.sb.from('profiles').update({ role: role }).eq('id', id);
      if (upd.error) {
        var msg = /LAST_ADMIN/.test(upd.error.message)
          ? 'This is the last admin — promote someone else first. 这是最后一位管理员，请先任命另一位管理员。'
          : 'Role change failed: ' + upd.error.message + ' · 角色修改失败。';
        S.showBanner(msg, 'error');
        return;
      }
      S.announce('Role updated 角色已更新');
      openTab('members');
      updateBadges();
    }

    async function rename(id) {
      var row = null;
      var res = await S.sb.from('profiles').select('*').eq('id', id).maybeSingle();
      if (!res.error && res.data) row = res.data;
      var name = window.prompt('New display name · 新的显示名', (row && row.display_name) || '');
      if (name === null) return;
      var upd = await S.sb.from('profiles').update({ display_name: name.trim() }).eq('id', id);
      if (upd.error) { S.showBanner('Rename failed: ' + upd.error.message + ' · 改名失败。', 'error'); return; }
      openTab('members');
    }

    openTab('review');
    updateBadges();

    return function destroy() { destroyed = true; };
  }

  S.registerView('admin', { render: render });
})();
