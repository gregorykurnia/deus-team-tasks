/* Today: what needs me today, the next two weeks, today's calendar and who carries what. */
(function () {
  const { ic, esc, num, plural, word } = P;
  const ui = { kind: P.qs.get('kind') || 'all' };
  const CAP = 6;

  function taskRow(t) {
    const k = P.kind(t);
    const co = P.company(t.co);
    const g = P.group(t.group);
    const la = P.lastAction(t);
    const done = t.done;
    const metaBits = [];
    if (co) metaBits.push(`<span class="co">${esc(co.name)}</span>`);
    else if (g) metaBits.push(`<span class="co">${esc(g.name)}</span>`);
    if (t.touch) metaBits.push(`<span>${esc(t.touch)}</span>`);
    if (!co && t.prio === 'high') metaBits.push('<span>High priority</span>');
    if (la) metaBits.push(`<span class="${la.tone ? 'tone-' + la.tone : ''}">${esc(la.label)}</span>`);
    if (P.liveIds && P.liveIds.has(t.id)) metaBits.push('<span class="live-tag">Just changed</span>');
    const mono = co ? esc(co.short) : ic('team');
    return `<div class="task k-${k}${done ? ' is-done is-leaving' : ''}${P.flash.has(t.id) ? ' is-new' : ''}" data-open="${t.id}">
      <button class="check" data-done="${t.id}" aria-label="${done ? 'Done' : 'Mark done'}: ${esc(t.desc)}">${ic('check')}</button>
      <span class="mono" aria-hidden="true">${mono}</span>
      <div style="min-width:0"><p class="tt">${esc(t.desc)}</p>${metaBits.length ? `<p class="meta">${metaBits.join('')}</p>` : ''}</div>
      <div class="right">${P.pill(t)}${P.avStack(t)}</div></div>`;
  }

  function section(key, label, dot, list, moreHref) {
    if (!list.length) return '';
    const shown = list.slice(0, CAP);
    return `<div class="group-label"><i style="background:${dot}"></i>${label}<span class="c">${num(list.filter((t) => !t.done).length)}</span>${list.length > CAP ? `<a class="link more" href="${P.keep(moreHref)}">See all ${num(list.length)}</a>` : ''}</div>${shown.map(taskRow).join('')}`;
  }

  function hero(open) {
    if (P.loading) return `<section class="hero glass" aria-label="Today at a glance" aria-busy="true"><div class="hero-text"><span class="skel" style="height:26px;width:80%"></span><span class="skel" style="height:26px;width:55%;margin-top:10px"></span><span class="skel" style="height:14px;width:70%;margin-top:18px"></span><div class="hero-chips"><span class="skel" style="height:36px;width:110px;border-radius:99px"></span><span class="skel" style="height:36px;width:130px;border-radius:99px"></span></div></div><div class="weeks"><span class="skel" style="height:16px;width:40%"></span><span class="skel" style="height:120px;margin-top:20px"></span></div></section>`;
    const over = open.filter((t) => P.bucket(t) === 'overdue');
    const soon = open.filter((t) => P.bucket(t) === 'soon');
    const nodate = open.filter((t) => P.bucket(t) === 'nodate');
    const quietCos = new Set(open.filter((t) => t.co && P.idleDays(t) >= 14).map((t) => t.co));
    const quietTasks = open.filter((t) => t.co && P.idleDays(t) >= 14);
    let h2, p;
    if (!P.db.tasks.length) {
      h2 = 'Nothing on the list yet';
      p = 'Add the first thing that needs doing. A sentence is enough, and dates and people can come later.';
    } else {
      const parts = [];
      if (over.length) parts.push(`${plural(over.length, 'task is', 'tasks are').replace(/^\S+/, word(over.length))} overdue`);
      else if (soon.length) parts.push(`${plural(soon.length, 'task is', 'tasks are').replace(/^\S+/, word(soon.length))} due in the next three days`);
      if (quietCos.size) parts.push(`${plural(quietCos.size, 'company has', 'companies have').replace(/^\S+/, (parts.length ? word(quietCos.size).toLowerCase() : word(quietCos.size)))} gone quiet`);
      h2 = parts.length ? parts.join(' and ') : 'Nothing is due in the next three days';
      const first = over.slice().sort((a, b) => a.end.localeCompare(b.end))[0];
      const next = open.filter((t) => t.end && P.diff(t.end) > 3).sort((a, b) => a.end.localeCompare(b.end))[0];
      const doneWeek = P.db.tasks.filter((t) => t.done && t.doneAt && -P.diff(t.doneAt) < 7).length;
      if (first) { const c = P.company(first.co); p = `Start with ${c ? esc(c.name) : '“' + esc(first.desc) + '”'}, it's ${P.deadline(first).label}. `; }
      else if (next) p = `The next deadline is ${P.wd(next.end)}: ${esc(next.desc)}. `;
      else p = '';
      p += `${num(doneWeek)} ${doneWeek === 1 ? 'task' : 'tasks'} finished in the last seven days.`;
    }
    const chip = (n, label, bg, fg, href) => `<a class="hchip" href="${P.keep(href)}"><i style="background:${bg};color:${fg}">${num(n)}</i>${label}</a>`;
    const chips = P.db.tasks.length ? `<div class="hero-chips">
        ${over.length ? chip(over.length, 'Overdue', 'var(--red-soft)', 'var(--red)', 'tasks.html?due=overdue') : ''}
        ${soon.length ? chip(soon.length, 'Due in 3 days', 'var(--amber-soft)', 'var(--amber)', 'tasks.html?due=soon') : ''}
        ${quietTasks.length ? chip(quietTasks.length, 'No action for 14+ days', 'var(--int-soft)', 'var(--int)', 'tasks.html?idle=14') : ''}
        ${nodate.length ? chip(nodate.length, 'Need a date', 'rgba(27,31,59,.06)', 'var(--ink-2)', 'tasks.html?due=nodate') : ''}
      </div>` : `<div class="capture" style="margin:22px 0 0">${ic('plus')}<label class="sr" for="cap-hero">New task</label><input id="cap-hero" data-capture placeholder="Add a task, like “Call Pelita Foods about the trial”" autocomplete="off"></div>`;
    const kc = { pro: 0, cli: 0, int: 0 }; open.forEach((t) => { kc[P.kind(t)]++; });
    const kinds = P.db.tasks.length ? `<div class="kinds" aria-label="Open tasks by kind of work">
        <span><i style="background:var(--pro)"></i>Prospects <b>${num(kc.pro)}</b></span>
        <span><i style="background:var(--cli)"></i>Clients <b>${num(kc.cli)}</b></span>
        <span><i style="background:var(--int)"></i>Internal <b>${num(kc.int)}</b></span></div>` : '';
    return `<section class="hero glass" aria-label="Today at a glance"><div class="hero-text"><h2>${h2}</h2><p>${p}</p>${chips}${kinds}</div>${weeks(open)}</section>`;
  }

  function weeks(open) {
    const days = [];
    for (let i = 0; i < 14; i++) {
      const iso = P.iso(i); const x = P.parse(iso);
      const ts = open.filter((t) => t.end === iso);
      const evs = P.eventsState === 'ok' ? P.db.events.filter((e) => e.date === iso).length : 0;
      days.push({ iso, x, p: ts.filter((t) => P.kind(t) === 'pro').length, c: ts.filter((t) => P.kind(t) === 'cli').length, t: ts.filter((t) => P.kind(t) === 'int').length, e: evs, we: x.getDay() === 0 || x.getDay() === 6 });
    }
    const max = Math.max(4, ...days.map((d) => d.p + d.c + d.t + Math.min(d.e, 6) * 0.6));
    const unit = 118 / max;
    const busiest = days.slice().sort((a, b) => (b.p + b.c + b.t) - (a.p + a.c + a.t))[0];
    const bc = busiest.p + busiest.c + busiest.t;
    const callout = bc >= 3 ? `<span class="callout">${P.wd(busiest.iso)} is the busiest, with ${plural(bc, 'deadline')}</span>` : `<span class="callout calm">${bc ? 'No crunch ahead' : 'No deadlines in the next two weeks'}</span>`;
    const seg = (cls, n) => (n ? `<i class="${cls}" style="height:${Math.max(4, n * unit - 3)}px"></i>` : '');
    const bars = days.map((d, i) => {
      const n = d.p + d.c + d.t;
      const label = `${P.wd(d.iso)}: ${plural(n, 'deadline')}${d.e ? ', ' + plural(d.e, 'event') : ''}`;
      return `<a class="cbar${i === 0 ? ' today' : ''}${d.we ? ' we' : ''}" href="${P.keep('plan.html?view=day&date=' + d.iso)}" title="${label}" aria-label="${label}">${seg('p', d.p)}${seg('c', d.c)}${seg('t', d.t)}${seg('e', Math.min(d.e, 6) * 0.6)}</a>`;
    }).join('');
    const labels = days.map((d, i) => `<span class="${i === 0 ? 'td' : ''}">${i === 0 ? 'Today' : d.x.getDate()}</span>`).join('');
    const evNote = P.eventsState === 'ok' ? '<span><i style="background:#cbd8ec"></i>Calendar events</span>' : '<span style="color:var(--muted)">Calendar events unavailable</span>';
    return `<div class="weeks"><div class="weeks-head"><h3>Next two weeks</h3>${callout}</div>
      <div class="wk-chart">${bars}</div><div class="wk-days" aria-hidden="true">${labels}</div>
      <div class="legend"><span><i style="background:var(--pro)"></i>Prospects</span><span><i style="background:#27b07f"></i>Clients</span><span><i style="background:#8d9ab1"></i>Internal</span>${evNote}</div></div>`;
  }

  function tasksPanel(open) {
    const kc = { all: 0, pro: 0, cli: 0, int: 0 };
    const attention = open.filter((t) => ['overdue', 'soon', 'active', 'nodate'].includes(P.bucket(t)));
    attention.forEach((t) => { if (!t.done) { kc.all++; kc[P.kind(t)]++; } });
    const seg = `<div class="seg" role="group" aria-label="Kind of work">${[['all', 'All'], ['pro', 'Prospects'], ['cli', 'Clients'], ['int', 'Internal']].map(([v, l]) => `<button aria-pressed="${ui.kind === v}" data-kind="${v}">${l}${P.loading ? '' : ` <span class="c">${num(kc[v])}</span>`}</button>`).join('')}</div>`;
    const capture = `<div class="capture"><span class="plus">${ic('plus')}</span><label class="sr" for="cap">New task</label><input id="cap" data-capture placeholder="Add a task, like “Call Pelita Foods about the trial”" autocomplete="off"><span class="hint when-typing">Enter to add</span></div>`;
    let body;
    if (P.loading) {
      body = `<div class="loading-note"><span class="spin"></span>Loading tasks</div>` + [1, 2, 3, 4].map(() => '<div class="skel-row"><span class="skel c1"></span><span class="skel c2"></span><div><span class="skel l1"></span><span class="skel l2"></span></div><span class="skel c4"></span></div>').join('');
    } else if (!P.db.tasks.length) {
      body = `<div class="empty"><div class="art">${ic('sun')}</div><h3>A clear day</h3><p>Tasks that are overdue, due soon or under way show up here, grouped by how urgent they are.</p></div>`;
    } else {
      const list = (ui.kind === 'all' ? attention : attention.filter((t) => P.kind(t) === ui.kind));
      const by = (b) => list.filter((t) => P.bucket(t) === b);
      const sortEnd = (a, b) => (a.end || '').localeCompare(b.end || '');
      const over = by('overdue').sort(sortEnd), soon = by('soon').sort(sortEnd), active = by('active').sort(sortEnd), nodate = by('nodate');
      const kq = ui.kind === 'all' ? '' : '&kind=' + ui.kind;
      body = section('overdue', 'Overdue', 'var(--red)', over, 'tasks.html?due=overdue' + kq)
        + section('soon', 'Due in the next 3 days', 'var(--amber)', soon, 'tasks.html?due=soon' + kq)
        + (!over.length && !soon.length && list.length ? `<div class="notice" style="margin-top:6px">${ic('done')}<p>Nothing ${ui.kind === 'all' ? '' : { pro: 'for prospects', cli: 'for clients', int: 'internal' }[ui.kind] + ' '}is overdue or due in the next three days.</p></div>` : '')
        + section('active', 'Under way today', 'var(--blue)', active, 'tasks.html?due=active' + kq)
        + section('nodate', 'Needs a date', '#b7bbd0', nodate, 'tasks.html?due=nodate' + kq);
      if (!list.length) {
        const name = { pro: 'prospect', cli: 'client', int: 'internal' }[ui.kind];
        body = `<div class="empty sm"><div class="art">${ic('done')}</div><h3>No ${name} work needs attention</h3><p>Nothing for ${{ pro: 'prospects', cli: 'existing clients', int: 'the team' }[ui.kind]} is overdue, due soon, under way or missing a date.</p><div class="acts"><a class="btn sm" href="${P.keep('tasks.html?kind=' + ui.kind)}">See all ${name} tasks</a></div></div>`;
      }
    }
    const total = P.db.tasks.filter((t) => !t.done).length;
    return `<section class="panel glass" aria-labelledby="t-h"><div class="panel-head"><h2 id="t-h">Needs attention</h2><span class="sp"></span>${seg}</div>
      ${P.loading ? '' : capture}${body}
      ${!P.loading && total ? `<div class="panel-foot"><a class="btn sm quiet" href="${P.keep('tasks.html')}">All ${plural(total, 'open task')}</a></div>` : ''}</section>`;
  }

  function calendar() {
    const head = `<div class="panel-head"><h2 id="c-h">Calendar today</h2><span class="sp"></span><span class="ro" title="Events come from the team calendar and can't be changed here">${ic('lock')}Read only</span></div>`;
    let body;
    if (P.eventsState === 'loading') body = `<div class="loading-note"><span class="spin"></span>Loading events</div>` + [1, 2, 3].map(() => '<div class="ev"><span class="bar-c"></span><div><span class="skel" style="height:13px;width:70%"></span><span class="skel" style="height:10px;width:35%;margin-top:8px"></span></div><span></span></div>').join('');
    else if (P.eventsState === 'off') body = `<div class="notice">${ic('info')}<div><p><b>The team calendar isn't connected.</b></p><p>Meetings and events will show here once it's set up. Tasks work as usual.</p></div></div>`;
    else if (P.eventsState === 'fail') body = `<div class="notice warn">${ic('alert')}<div><p><b>Couldn't load today's events.</b></p><p>${P.offline ? 'They will appear when you are back online.' : 'The team calendar didn\'t respond. Tasks work as usual.'}</p></div></div>`;
    else {
      const evs = P.db.events.filter((e) => e.date === P.iso(0)).sort((a, b) => (b.allDay - a.allDay) || (a.start || '').localeCompare(b.start || ''));
      const shown = evs.slice(0, 8);
      body = evs.length ? shown.map((e) => `<div class="ev"><span class="bar-c"></span><div style="min-width:0"><p>${esc(e.title)}</p><small>${e.allDay ? 'All day' : `${e.start} to ${e.end}`}</small></div><a class="open" href="${e.url}" target="_blank" rel="noopener" aria-label="Open “${esc(e.title)}” in the team calendar" title="Open in the team calendar">${ic('ext')}</a></div>`).join('')
        + (evs.length > shown.length ? `<div class="panel-foot"><a class="btn sm quiet" href="${P.keep('plan.html?view=day')}">${plural(evs.length - shown.length, 'more event')} today</a></div>` : '')
        : `<div class="empty sm"><div class="art">${ic('cal')}</div><h3>No events today</h3><p>Nothing is on the team calendar.</p></div>`;
    }
    return `<section class="panel glass" aria-labelledby="c-h">${head}${body}</section>`;
  }

  function people(open) {
    let body;
    if (P.loading) body = [1, 2, 3].map(() => '<div class="who"><span class="skel" style="width:34px;height:34px;border-radius:50%"></span><div><span class="skel" style="height:12px;width:60%"></span><span class="skel" style="height:10px;width:40%;margin-top:7px"></span></div><span></span></div>').join('');
    else {
      const m = new Map();
      open.forEach((t) => { if (t.done) return; t.resp.forEach((n) => { const r = m.get(n) || { own: 0, inf: 0 }; r.own++; m.set(n, r); }); t.inf.forEach((i) => { const r = m.get(i.name) || { own: 0, inf: 0 }; r.inf++; m.set(i.name, r); }); });
      const rows = Array.from(m.entries()).sort((a, b) => b[1].own - a[1].own || a[0].localeCompare(b[0]));
      const max = Math.max(1, ...rows.map((r) => r[1].own));
      const ooo = P.db.events.filter((e) => e.date === P.iso(0) && e.allDay && / out of office$/.test(e.title)).map((e) => e.title.replace(/ out of office$/, ''));
      body = rows.length ? rows.slice(0, 6).map(([n, r]) => {
        const lit = Math.ceil((r.own / max) * 5);
        const away = P.eventsState === 'ok' && ooo.some((o) => n.startsWith(o));
        return `<a class="who" href="${P.keep('plan.html?view=people&person=' + encodeURIComponent(n))}">${P.av(n)}<div style="min-width:0"><p>${esc(n)}</p><small>Owns ${num(r.own)}${away ? ', out of office today' : `, informed on ${num(r.inf)}`}</small></div><span class="load" role="img" aria-label="Load ${lit} of 5">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < lit ? 'on' : ''}"></i>`).join('')}</span></a>`;
      }).join('') + (rows.length > 6 ? `<div class="panel-foot"><a class="btn sm quiet" href="${P.keep('plan.html?view=people')}">All ${num(rows.length)} people</a></div>` : '')
        : `<div class="empty sm"><div class="art">${ic('team')}</div><h3>Nobody is assigned yet</h3><p>Name a responsible person on a task and their load shows here.</p></div>`;
    }
    return `<section class="panel glass" aria-labelledby="w-h"><div class="panel-head"><h2 id="w-h">Who's carrying what</h2></div>${body}</section>`;
  }

  function render() {
    const open = P.openTasks();
    const x = P.TODAY;
    P.$('#main').innerHTML = `
      <div class="bar"><div class="ttl"><h1>Today</h1><span class="sub">${P.fmtLong(x)}</span></div><span class="sp"></span>
        <label class="search glass">${ic('search')}<span class="sr">Search</span><input type="search" data-search placeholder="Search tasks, companies, notes"></label>
        <a class="icon-btn glass mob-only" href="${P.keep('tasks.html?focus=search')}" aria-label="Search">${ic('search')}</a>
        <button class="cta" data-act="task-new">${ic('plus')}New task</button></div>
      ${P.offlineBanner()}
      ${hero(open)}
      <div class="board">${tasksPanel(open)}<div class="rail">${calendar()}${people(open)}</div></div>`;
  }

  P.$('#app').addEventListener('click', (e) => {
    const done = e.target.closest('[data-done]');
    if (done) { e.stopPropagation(); P.markDone(done.dataset.done); return; }
    const k = e.target.closest('[data-kind]');
    if (k) { ui.kind = k.dataset.kind; P.render(); return; }
    const row = e.target.closest('[data-open]');
    if (row && !e.target.closest('a')) P.openTask(row.dataset.open);
  });
  P.$('#app').addEventListener('keydown', (e) => {
    if (e.target.matches('[data-capture]') && e.key === 'Enter') {
      const v = e.target.value; if (!v.trim()) return;
      const id = e.target.id;
      P.quickAdd(v);
      const again = P.$('#' + id) || P.$('#cap'); if (again) again.focus();
    }
    if (e.target.matches('[data-search]') && e.key === 'Enter') location.href = P.keep('tasks.html?q=' + encodeURIComponent(e.target.value));
  });

  P.boot({
    page: 'today', render,
    states: [['', 'Normal'], ['no-clients', 'No client work'], ['quiet', 'Nothing due soon'], ['empty', 'Nothing yet (no tasks)'], ['loading', 'Loading'], ['events-loading', 'Events loading'], ['events-off', 'Calendar not set up'], ['events-fail', 'Events failed to load'], ['offline', 'No connection'], ['offline-empty', 'No connection, nothing loaded'], ['live', 'Live change from a colleague']],
    opens: [['task-new', 'New task (quick)'], ['task-new-full', 'New task (all details)'], ['task-required', 'Description missing'], ['task-edit', 'Edit a company task'], ['task-edit-int', 'Edit an internal task'], ['task-names', 'Name suggestions'], ['task-names-new', 'Adding a new name'], ['task-delete', 'Delete a task'], ['group-new', 'New task group'], ['more', 'Phone: More']],
    afterBoot() {
      if (P.state !== 'live') return;
      // A colleague's changes arrive without a reload (A1).
      setTimeout(() => {
        P.liveIds = new Set();
        const t = P.task('t3') || P.db.tasks.find((x) => !x.done);
        if (t) { t.end = P.iso(1); P.liveIds.add(t.id); P.flash.add(t.id); }
        const n = { id: 'live1', desc: 'Send the signed NDA back', co: 'pel', group: null, type: 'Admin', touch: 'Email', prio: 'high', start: null, end: P.iso(0), last: P.iso(0), key: '', resp: ['Sarah Lim'], inf: [], done: false, doneAt: null };
        if (P.company('pel')) { P.db.tasks.unshift(n); P.liveIds.add(n.id); P.flash.add(n.id); }
        P.render();
      }, 1200);
    },
  });
})();
