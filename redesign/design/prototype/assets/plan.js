/* Plan: the coming weeks as a timeline, a month, one day, and who carries what (D1, D2, D4 to D11). */
(function () {
  const { ic, esc, num, plural } = P;
  const q = P.qs;
  const DAY = 86400000;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WDI = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const DAYS = 28; // the timeline shows four weeks
  const ROW_H = 32; // height of one row of bars in a timeline lane
  const CAP = 4; // rows shown per lane before "Show more"

  /* ---------- Dates ---------- */
  const toIso = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  const add = (iso, n) => { const x = P.parse(iso); x.setDate(x.getDate() + n); return toIso(x); };
  const between = (a, b) => Math.round((P.parse(b) - P.parse(a)) / DAY);
  const TODAY = P.iso(0);
  const weekStart = (iso) => add(iso, -((P.parse(iso).getDay() + 6) % 7));
  const isWe = (iso) => { const g = P.parse(iso).getDay(); return g === 0 || g === 6; };
  const shortDate = (iso) => { const x = P.parse(iso); return `${WD[x.getDay()]} ${x.getDate()} ${MON[x.getMonth()]}`; };
  const longDate = (iso) => P.fmtLong(P.parse(iso)) + (P.parse(iso).getFullYear() !== P.TODAY.getFullYear() ? ' ' + P.parse(iso).getFullYear() : '');
  const monthName = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTH[m - 1]} ${y}`; };
  const rel = (iso) => {
    const n = between(TODAY, iso);
    if (n === 0) return 'Today'; if (n === 1) return 'Tomorrow'; if (n === -1) return 'Yesterday';
    return n > 0 ? `In ${num(n)} days` : `${num(-n)} days ago`;
  };
  const range = (n) => Array.from({ length: n }, (_, i) => i);

  /* ---------- What the page is showing ---------- */
  const ui = {
    view: q.get('view') || (q.get('date') ? 'day' : 'timeline'),
    date: q.get('date') || '',
    from: q.get('from') || weekStart(TODAY),
    month: q.get('month') || TODAY.slice(0, 7),
    person: q.get('person') || '',
    work: q.get('work') || '',
    show: q.get('show') || 'all',
    rows: q.get('rows') || 'person',
    expanded: new Set(),
    landed: false, // the Day view moved on to the next day with something (D5)
    pq: '', // search among people
  };
  const filtersOn = () => !!(ui.work || ui.person);

  // State used to show the D5 landing: nothing happens today.
  const span = (t) => (t.start || t.end ? { s: t.start || t.end, e: t.end || null } : null);
  const activeOn = (t, iso) => { const sp = span(t); return !!sp && sp.s <= iso && (!sp.e || iso <= sp.e); };
  if (P.state === 'free-today') {
    P.db.events = P.db.events.filter((e) => e.date !== TODAY);
    P.db.tasks = P.db.tasks.filter((t) => t.done || !activeOn(t, TODAY));
  }

  const WORK = { pro: 'Prospects', cli: 'Clients', int: 'Internal' };
  const workLabel = () => {
    if (!ui.work) return '';
    if (WORK[ui.work]) return WORK[ui.work];
    const g = P.group(ui.work.slice(2)); return g ? g.name : '';
  };
  if (ui.work && !workLabel()) ui.work = '';

  function tasks(ignoreShow) {
    if (P.loading || (!ignoreShow && ui.show === 'events')) return [];
    let l = P.openTasks();
    if (ui.work) l = l.filter((t) => (ui.work.startsWith('g:') ? t.group === ui.work.slice(2) : P.kind(t) === ui.work));
    if (ui.person) l = l.filter((t) => t.resp.includes(ui.person) || t.inf.some((i) => i.name === ui.person));
    return l;
  }
  const eventsOn = () => P.eventsState === 'ok' && ui.show !== 'tasks';
  const eventsFor = (iso) => (eventsOn() ? P.db.events.filter((e) => e.date === iso).sort((a, b) => (b.allDay - a.allDay) || (a.start || '').localeCompare(b.start || '')) : []);
  const isInf = (t) => !!ui.person && !t.resp.includes(ui.person);
  const hasSomething = (iso, list) => list.some((t) => activeOn(t, iso)) || eventsFor(iso).length > 0;
  function nextWith(iso, dir, list) {
    for (let i = 1; i <= 400; i++) { const d = add(iso, i * dir); if (hasSomething(d, list)) return d; }
    return null;
  }
  function landDay() {
    // First look at a day: today if something is happening, otherwise the next day that has something (D5).
    if (ui.date) return;
    const list = tasks();
    if (P.loading || hasSomething(TODAY, list)) { ui.date = TODAY; return; }
    const n = nextWith(TODAY, 1, list);
    ui.date = n || TODAY; ui.landed = !!n;
  }

  /* ---------- Shared pieces ---------- */
  const whereOf = (t) => { const co = P.company(t.co); const g = P.group(t.group); return co ? co.name : (g ? g.name : 'Internal'); };
  const skelRows = (n) => range(n).map(() => '<div class="skel-row" style="grid-template-columns:26px 1fr 90px"><span class="skel c1"></span><div><span class="skel l1"></span><span class="skel l2"></span></div><span class="skel c4"></span></div>').join('');

  function eventRow(e) {
    return `<div class="ev"><span class="bar-c"></span><div style="min-width:0"><p>${esc(e.title)}</p><small>${e.allDay ? 'All day' : `${e.start} to ${e.end}`}</small></div><a class="open" href="${e.url}" target="_blank" rel="noopener" aria-label="Open “${esc(e.title)}” in the team calendar" title="Open in the team calendar">${ic('ext')}</a></div>`;
  }
  function calendarNotice(compact) {
    if (P.eventsState === 'loading') return `<div class="loading-note"><span class="spin"></span>Loading events</div>`;
    if (P.eventsState === 'off') return `<div class="notice">${ic('info')}<div><p><b>The team calendar isn't connected.</b></p>${compact ? '' : '<p>Meetings and events will show here once it\'s set up. Tasks work as usual.</p>'}</div></div>`;
    if (P.eventsState === 'fail') return `<div class="notice warn">${ic('alert')}<div><p><b>Couldn't load the team calendar.</b></p>${compact ? '' : `<p>${P.offline ? 'Events will appear when you are back online.' : 'It didn\'t respond. Tasks work as usual.'}</p>`}</div></div>`;
    return '';
  }

  // A task as it appears in the Day view and on a person's page: who is on it and the key points (D4, D6).
  function dayRow(t, ctx) {
    const k = P.kind(t); const co = P.company(t.co); const g = P.group(t.group); const la = P.lastAction(t);
    const meta = [`<span class="co">${esc(co ? co.name : (g ? g.name : 'Internal'))}</span>`];
    if (t.touch) meta.push(`<span>${esc(t.touch)}</span>`);
    if (la) meta.push(`<span class="${la.tone ? 'tone-' + la.tone : ''}">${esc(la.label)}</span>`);
    if (P.liveIds && P.liveIds.has(t.id)) meta.push('<span class="live-tag">Just changed</span>');
    let when;
    if (ctx === 'sta') when = `<span class="pill p-calm">${t.end ? 'Due ' + P.fmt(t.end) : 'No deadline'}</span>`;
    else if (ctx === 'und') when = t.end ? P.pill(t) : '<span class="pill p-none">No deadline</span>';
    else when = P.pill(t);
    const resp = t.resp.length ? t.resp.map((n) => `<span class="pp${n === ui.person ? ' me' : ''}">${P.av(n)}<span>${esc(n)}</span></span>`).join('') : '<span class="none">Nobody yet</span>';
    const inf = t.inf.length ? `<div class="dr-line"><span class="lbl">Informed</span><span class="infs">${t.inf.map((i) => `<span class="${i.name === ui.person ? 'me' : ''}">${esc(i.name)}${i.note ? ` <em>${esc(i.note)}</em>` : ''}</span>`).join('')}</span></div>` : '';
    const note = ctx === 'inf' ? (() => { const me = t.inf.find((i) => i.name === ui.person); return `<p class="their-part">${ic('info')}${me && me.note ? `Their part: <b>${esc(me.note)}</b>` : 'Kept informed, with no note on their part'}</p>`; })() : '';
    return `<div class="drow k-${k}${P.flash.has(t.id) ? ' is-new' : ''}" data-open="${t.id}">
      <button class="check" data-done="${t.id}" aria-label="Mark done: ${esc(t.desc)}">${ic('check')}</button>
      <div class="dr-main"><div class="dr-top"><div style="min-width:0"><p class="tt">${esc(t.desc)}</p><p class="meta">${meta.join('')}</p></div><div class="dr-when">${when}</div></div>
        ${note}
        <div class="dr-line"><span class="lbl">Responsible</span><span class="pps">${resp}</span></div>${inf}
        ${t.key ? `<p class="dr-key">${esc(t.key)}</p>` : ''}</div></div>`;
  }

  /* ---------- Header and tools ---------- */
  function header() {
    const sub = { timeline: `${P.fmt(ui.from)} to ${P.fmt(add(ui.from, DAYS - 1), { year: true })}`, month: monthName(ui.month), day: longDate(ui.date || TODAY), people: ui.person ? esc(ui.person) : 'Who carries what' }[ui.view];
    const views = [['timeline', 'Timeline'], ['month', 'Month'], ['day', 'Day'], ['people', 'People']];
    const show = ui.view === 'people' ? '' : `<div class="seg" role="group" aria-label="Show">${[['all', 'Tasks and events'], ['tasks', 'Tasks'], ['events', 'Events']].map(([v, l]) => `<button aria-pressed="${ui.show === v}" data-show="${v}">${l}</button>`).join('')}</div>`;
    return `<div class="bar"><div class="ttl"><h1>Plan</h1><span class="sub">${sub}</span></div><span class="sp"></span>
        <button class="cta" data-act="task-new">${ic('plus')}New task</button></div>
      ${P.offlineBanner()}
      <div class="tbar plan-tbar"><div class="seg views" role="group" aria-label="View">${views.map(([v, l]) => `<button aria-pressed="${ui.view === v}" data-view="${v}">${l}</button>`).join('')}</div><span class="sp"></span>${show}</div>`;
  }
  function tools() {
    const fb = (key, icon, label, val) => (val
      ? `<span class="fbtn on"><button data-menu="${key}" aria-haspopup="menu">${ic(icon)}${label} <span class="v">${esc(val)}</span></button><button class="x" data-clear="${key}" aria-label="Clear the ${label.toLowerCase()} filter">${ic('x')}</button></span>`
      : `<button class="fbtn" data-menu="${key}" aria-haspopup="menu">${ic(icon)}${label}${ic('down')}</button>`);
    const parts = [fb('work', 'filter', 'Work', workLabel())];
    if (ui.view !== 'people') parts.push(fb('person', 'people', 'Person', ui.person));
    if (ui.view === 'timeline' && !ui.person && ui.show !== 'events') parts.push(`<button class="fbtn" data-menu="rows" aria-haspopup="menu">${ic('cols')}Rows <span class="v">${ui.rows === 'kind' ? 'Kind of work' : 'People'}</span>${ic('down')}</button>`);
    parts.push('<span class="sp"></span>');
    if (ui.view !== 'people') {
      const label = { timeline: `${P.fmt(ui.from)} to ${P.fmt(add(ui.from, DAYS - 1))}`, month: monthName(ui.month), day: shortDate(ui.date || TODAY) }[ui.view];
      const unit = { timeline: 'two weeks', month: 'month', day: 'day' }[ui.view];
      const onToday = { timeline: ui.from === weekStart(TODAY), month: ui.month === TODAY.slice(0, 7), day: ui.date === TODAY }[ui.view];
      parts.push(`<div class="dnav"><button class="icon-btn" data-step="-1" aria-label="Previous ${unit}" title="Previous ${unit}">${ic('left')}</button><span class="dl" aria-live="polite">${label}</span><button class="icon-btn" data-step="1" aria-label="Next ${unit}" title="Next ${unit}">${ic('right')}</button><button class="btn sm" data-today${onToday ? ' disabled' : ''}>Today</button></div>`);
    }
    return `<div class="filters plan-filters" role="toolbar" aria-label="Narrow the plan">${parts.join('')}</div>`;
  }

  /* ---------- Timeline (D1, D7, D8) ---------- */
  function timeline() {
    const from = ui.from;
    const phone = innerWidth < 760;
    const laneW = phone ? 56 : 210;
    const colW = phone ? 44 : Math.max(22, ((P.$('#main').clientWidth || 1000) - 18 - laneW) / DAYS);
    const isoAt = (i) => add(from, i);
    const idx = (iso) => between(from, iso);
    const list = tasks();
    const allOpen = tasks(true);
    const todayI = idx(TODAY);

    // Load per day: deadlines and events. Crunch days are the busiest few, well above the average.
    const dl = range(DAYS).map((i) => list.filter((t) => t.end === isoAt(i)).length);
    const ev = range(DAYS).map((i) => eventsFor(isoAt(i)));
    const score = range(DAYS).map((i) => dl[i] + ev[i].length * 0.5);
    const avg = score.reduce((a, b) => a + b, 0) / DAYS;
    const thr = Math.max(3, Math.ceil(avg * 1.8));
    const crunch = new Set(range(DAYS).filter((i) => dl[i] >= 2 && score[i] >= thr && i >= Math.max(0, todayI)).sort((a, b) => score[b] - score[a]).slice(0, 4));

    const cols = `<div class="tl-cols" aria-hidden="true">${range(DAYS).map((i) => `<i class="${isWe(isoAt(i)) ? 'we' : ''}${crunch.has(i) ? ' crunch' : ''}${i === todayI ? ' today' : ''}"></i>`).join('')}</div>`;
    const weeks = range(DAYS / 7).map((w) => { const iso = isoAt(w * 7); const cur = iso === weekStart(TODAY); return `<span class="wk${cur ? ' cur' : ''}">${cur ? 'This week' : `Week of ${P.fmt(iso)}`}</span>`; }).join('');
    const head = `<div class="tl-row tl-head"><div class="tl-lab"></div><div class="tl-track"><div class="wks">${weeks}</div><div class="dys">${range(DAYS).map((i) => { const iso = isoAt(i); const x = P.parse(iso); return `<button class="dayh${i === todayI ? ' today' : ''}${isWe(iso) ? ' we' : ''}" data-day="${iso}" aria-label="Open ${longDate(iso)}" title="${longDate(iso)}"><span>${WDI[x.getDay()]}</span><b>${x.getDate()}</b></button>`; }).join('')}</div></div></div>`;

    // Deadlines per day, with crunch days marked (D1)
    const dueRow = ui.show === 'events' || P.loading ? '' : `<div class="tl-row tl-due"><div class="tl-lab"><span class="lk-ic">${ic('clock')}</span><div class="ln"><p>Deadlines</p></div></div><div class="tl-track cells">${range(DAYS).map((i) => (dl[i] ? `<span class="dn${crunch.has(i) ? ' hot' : ''}" title="${shortDate(isoAt(i))}: ${plural(dl[i], 'deadline')}">${num(dl[i])}</span>` : '<span></span>')).join('')}</div></div>`;

    // External events, read only (D7, D9, D10)
    let evTrack;
    const evMode = ui.show === 'events';
    if (ui.show === 'tasks') evTrack = null;
    else if (P.eventsState !== 'ok') evTrack = P.eventsState === 'loading' ? `<div class="tl-track"><span class="skel" style="height:22px;margin:9px 8px"></span></div>` : `<div class="tl-track"><div class="tl-note">${calendarNotice(true)}</div></div>`;
    else evTrack = `<div class="tl-track cells${evMode ? ' tall' : ''}">${range(DAYS).map((i) => {
      const es = ev[i]; if (!es.length) return '<span></span>';
      const titles = es.map((e) => `${e.allDay ? 'All day' : e.start} ${e.title}`).join('\n');
      if (!evMode) return `<button class="evc${es.some((e) => e.allDay) ? ' ad' : ''}" data-day="${isoAt(i)}" title="${esc(titles)}" aria-label="${shortDate(isoAt(i))}: ${plural(es.length, 'event')}. Open the day">${num(es.length)}</button>`;
      const shown = es.slice(0, 6);
      return `<span class="evstack">${shown.map((e) => `<button class="evm${e.allDay ? ' ad' : ''}" data-day="${isoAt(i)}" title="${esc((e.allDay ? 'All day' : e.start + ' to ' + e.end) + ', ' + e.title)}">${e.allDay ? 'Day' : e.start}</button>`).join('')}${es.length > shown.length ? `<button class="evm more" data-day="${isoAt(i)}" aria-label="${plural(es.length - shown.length, 'more event')}, open the day">+${num(es.length - shown.length)}</button>` : ''}</span>`;
    }).join('')}</div>`;
    const evRow = evTrack ? `<div class="tl-row tl-ev"><div class="tl-lab"><span class="lk-ic">${ic('cal')}</span><div class="ln"><p>Team calendar</p><small class="ro">${ic('lock')}Read only</small></div></div>${evTrack}</div>` : '';

    // Task bars
    let lanesHTML = ''; let undated = 0; let before = [];
    if (P.loading) {
      lanesHTML = range(4).map(() => `<div class="tl-row"><div class="tl-lab"><span class="skel" style="width:30px;height:30px;border-radius:50%"></span><div class="ln" style="flex:1"><span class="skel" style="height:12px;width:70%"></span></div></div><div class="tl-track" style="height:${ROW_H * 2 + 16}px"><span class="skel" style="position:absolute;top:10px;left:${8 + Math.random() * 30}%;width:28%;height:24px"></span><span class="skel" style="position:absolute;top:42px;left:${30 + Math.random() * 30}%;width:20%;height:24px"></span></div></div>`).join('');
    } else if (!evMode) {
      const items = [];
      list.forEach((t) => {
        const sp = span(t);
        if (!sp) { undated++; return; }
        const s = idx(sp.s); const e = sp.e ? idx(sp.e) : DAYS - 1;
        if (e < 0) { if (t.end < TODAY) before.push(t); return; }
        if (s > DAYS - 1) return;
        const dot = !!sp.e && (!t.start || t.start === t.end) && s >= 0;
        items.push({ t, s: Math.max(0, s), e: Math.min(DAYS - 1, e), clipL: s < 0, clipR: !!sp.e && e > DAYS - 1, open: !sp.e, dot, late: !!t.end && t.end < TODAY, inf: isInf(t) });
      });
      let lanes;
      if (ui.person) lanes = [{ key: ui.person, person: ui.person, name: ui.person, items }];
      else if (ui.rows === 'kind') lanes = ['pro', 'cli', 'int'].map((k) => ({ key: k, kind: k, name: P.KIND[k], items: items.filter((it) => P.kind(it.t) === k) })).filter((l) => l.items.length);
      else {
        const m = new Map();
        items.forEach((it) => (it.t.resp.length ? it.t.resp : ['']).forEach((n) => { if (!m.has(n)) m.set(n, []); m.get(n).push(it); }));
        lanes = Array.from(m.entries()).map(([n, its]) => ({ key: n || '-', person: n, name: n || 'Nobody responsible', items: its }))
          .sort((a, b) => (!a.person - !b.person) || b.items.length - a.items.length || a.name.localeCompare(b.name));
      }
      const pack = (its) => {
        const sorted = its.slice().sort((a, b) => a.s - b.s || b.e - a.e);
        const ends = [];
        return { placed: sorted.map((it) => {
          const n = it.dot ? 1 : it.e - it.s + 1;
          const lw = Math.min(200, it.t.desc.length * 6.9 + 18);
          const inside = !it.dot && n * colW >= 92;
          const occ = Math.min(DAYS - it.s, inside ? n : n + Math.ceil(lw / colW));
          let r = ends.findIndex((x) => x <= it.s);
          if (r === -1) { r = ends.length; ends.push(0); }
          ends[r] = it.s + (inside ? n : n + Math.ceil(lw / colW));
          return { it, r, inside, occ, n };
        }), rows: ends.length };
      };
      const itemHTML = (p) => {
        const { it, r, inside, occ, n } = p; const t = it.t;
        const title = `${t.desc}. ${whereOf(t)}. ${t.start ? 'Starts ' + shortDate(t.start) + ', ' : ''}${t.end ? 'deadline ' + shortDate(t.end) : 'no deadline'}${it.late ? ' (' + P.deadline(t).label + ')' : ''}.${t.resp.length ? ' Responsible: ' + t.resp.join(', ') + '.' : ''}${it.inf ? ` ${ui.person} is kept informed.` : ''}`;
        const cls = ['it', 'k-' + P.kind(t), it.dot ? 'is-dot' : 'is-bar', it.clipL ? 'clip-l' : '', it.clipR ? 'clip-r' : '', it.open ? 'open-end' : '', it.late ? 'late' : '', it.inf ? 'inf' : '', P.flash.has(t.id) ? 'is-new' : ''].filter(Boolean).join(' ');
        const lab = `<span class="l">${esc(t.desc)}</span>`;
        return `<button class="${cls}" data-open="${t.id}" style="left:${(it.s / DAYS) * 100}%;width:${(occ / DAYS) * 100}%;top:${r * ROW_H + 8}px" title="${esc(title)}" aria-label="${esc(title)}"><span class="b" style="width:${inside ? 100 : (n / occ) * 100}%">${inside ? lab : ''}</span>${inside ? '' : lab}</button>`;
      };
      lanesHTML = lanes.map((l) => {
        const { placed, rows } = pack(l.items);
        const open = ui.expanded.has(l.key);
        const shownRows = open ? rows : Math.min(rows, CAP);
        const hidden = placed.filter((p) => p.r >= shownRows).length;
        // Most tasks running at once from today on (D1: overlaps)
        let peak = { n: 0, i: 0 };
        for (let i = Math.max(0, todayI); i < DAYS; i++) { const c = l.items.filter((it) => it.s <= i && i <= it.e).length; if (c > peak.n) peak = { n: c, i }; }
        const av = l.person ? P.av(l.person) : (l.kind ? `<span class="lk-k k-${l.kind}">${l.name[0]}</span>` : '<span class="av nobody">?</span>');
        const owned = ui.person ? l.items.filter((it) => !it.inf).length : l.items.length;
        const sub = ui.person ? `${num(owned)} owned, ${num(l.items.length - owned)} informed` : plural(l.items.length, 'task');
        const more = hidden || (open && rows > CAP) ? `<button class="lane-more" data-expand="${esc(l.key)}" aria-expanded="${open}"><span class="lg">${open ? 'Show fewer' : `Show ${num(hidden)} more`}</span><span class="smv">${open ? '−' : '+' + num(hidden)}</span></button>` : '';
        return `<div class="tl-row lane"><div class="tl-lab">${av}<div class="ln"><p title="${esc(l.name)}">${esc(l.name)}</p><small>${sub}</small>${peak.n >= 4 ? `<small class="tone-amber">${num(peak.n)} at once on ${P.wd(isoAt(peak.i))}</small>` : ''}</div>${more}</div>
          <div class="tl-track" style="height:${shownRows * ROW_H + 14}px">${placed.filter((p) => p.r < shownRows).map(itemHTML).join('')}</div></div>`;
      }).join('');
      if (!lanes.length) {
        const who = [ui.person, workLabel() && workLabel().toLowerCase() + (WORK[ui.work] ? ' work' : '')].filter(Boolean).join(', ');
        lanesHTML = `<div class="tl-empty">${!P.db.tasks.length
          ? `<div class="empty"><div class="art">${ic('cal')}</div><h3>Nothing planned yet</h3><p>Tasks with dates show up here as bars from their start to their deadline, one row per person.</p><div class="acts"><button class="btn" data-act="task-new">${ic('plus')}New task</button></div></div>`
          : `<div class="empty sm"><div class="art">${ic('cal')}</div><h3>No tasks between ${P.fmt(from)} and ${P.fmt(add(from, DAYS - 1))}</h3><p>${who ? `Nothing dated in these four weeks for ${esc(who)}.` : 'Nothing dated falls in these four weeks.'}</p><div class="acts">${filtersOn() ? '<button class="btn sm" data-clearall>Clear filters</button>' : ''}${ui.from !== weekStart(TODAY) ? '<button class="btn sm" data-today>Back to this week</button>' : ''}</div></div>`}</div>`;
      }
    } else {
      undated = 0;
    }

    // Summary above the timeline: the busiest day, the quiet stretch, what isn't on it (D1, D3)
    const ins = [];
    if (!P.loading && !evMode && list.length) {
      const fromI = Math.max(0, todayI);
      let best = -1; for (let i = fromI; i < DAYS; i++) if (best < 0 || score[i] > score[best]) best = i;
      if (best >= 0 && dl[best] >= 2) ins.push(`<button class="insight warm" data-day="${isoAt(best)}"><i>${ic('alert')}</i><span>Busiest: <b>${shortDate(isoAt(best))}</b>, ${plural(dl[best], 'deadline')}${ev[best].length ? ` and ${plural(ev[best].length, 'event')}` : ''}</span></button>`);
      let run = null; let cur = null;
      for (let i = fromI; i < DAYS; i++) {
        const iso = isoAt(i); if (isWe(iso)) continue;
        if (!dl[i] && !ev[i].length && !list.some((t) => t.start === iso)) { if (!cur) cur = { a: i, b: i, n: 0 }; cur.b = i; cur.n++; if (!run || cur.n > run.n) run = { ...cur }; } else cur = null;
      }
      if (run && run.n >= 2) ins.push(`<span class="insight calm"><i>${ic('sun')}</i><span>Quiet stretch: <b>${P.fmt(isoAt(run.a))} to ${P.fmt(isoAt(run.b))}</b>, nothing due</span></span>`);
      if (before.length) ins.push(`<a class="insight red" href="${P.keep('tasks.html?due=overdue')}"><i>${ic('clock')}</i><span><b>${plural(before.length, 'overdue task')}</b> ended before ${P.fmt(from)}</span></a>`);
      if (undated) ins.push(`<a class="insight" href="${P.keep('tasks.html?due=nodate')}"><i>${ic('info')}</i><span><b>${plural(undated, 'task')}</b> ${undated === 1 ? 'has' : 'have'} no dates, so ${undated === 1 ? 'it isn\'t' : 'they aren\'t'} shown</span></a>`);
    }
    const legend = `<div class="legend tl-legend"><span><i style="background:var(--pro)"></i>Prospects</span><span><i style="background:var(--cli)"></i>Clients</span><span><i style="background:var(--int)"></i>Internal</span>${ui.person ? '<span><i class="dash"></i>Kept informed</span>' : ''}<span><i class="pin"></i>Deadline only</span>${crunch.size ? '<span><i style="background:#ffd99a"></i>Crunch</span>' : ''}</div>`;

    const body = `<div class="tl-scroll"><div class="tl" style="--lane:${laneW}px;--days:${DAYS};${phone ? `min-width:${laneW + DAYS * colW}px` : ''}">${cols}${head}${dueRow}${evRow}${lanesHTML}</div></div>`;
    return `${ins.length || !evMode ? `<div class="plan-sum">${ins.join('')}<span class="sp"></span>${evMode ? '' : legend}</div>` : ''}
      <section class="panel glass tl-panel" aria-label="Timeline">${tools()}${evMode && P.eventsState !== 'ok' && P.eventsState !== 'loading' ? calendarNotice() : ''}${body}</section>`;
  }

  /* ---------- Month (D5, D7, D8) ---------- */
  function month() {
    const [y, m] = ui.month.split('-').map(Number);
    const first = toIso(new Date(y, m - 1, 1)); const last = toIso(new Date(y, m, 0));
    const start = weekStart(first); const weeks = Math.ceil((between(start, last) + 1) / 7);
    const list = tasks();
    let total = 0;
    const sel = ui.date && ui.date.slice(0, 7) === ui.month ? ui.date : (TODAY.slice(0, 7) === ui.month ? TODAY : first);
    const cells = range(weeks * 7).map((i) => {
      const iso = add(start, i); const x = P.parse(iso); const out = iso.slice(0, 7) !== ui.month;
      const dls = P.loading ? [] : list.filter((t) => t.end === iso);
      const evs = eventsFor(iso);
      if (!out) total += dls.length + evs.length;
      const items = evs.map((e) => ({ e })).concat(dls.map((t) => ({ t })));
      const room = 4; const shown = items.length > room ? items.slice(0, room - 1) : items;
      const busy = dls.length >= 3 || dls.length + evs.length >= 5;
      const itemsHTML = shown.map((o) => (o.e
        ? `<span class="mev" title="${esc(o.e.title)}">${o.e.allDay ? '' : `<b>${o.e.start}</b> `}${esc(o.e.title)}</span>`
        : `<button class="mtk k-${P.kind(o.t)}${o.t.end < TODAY ? ' late' : ''}${isInf(o.t) ? ' inf' : ''}" data-open="${o.t.id}" title="${esc(o.t.desc + ', ' + whereOf(o.t))}"><i></i>${esc(o.t.desc)}</button>`)).join('');
      const dots = items.slice(0, 5).map((o) => `<i class="${o.e ? 'e' : 'k-' + P.kind(o.t)}"></i>`).join('');
      const label = `${longDate(iso)}: ${dls.length ? plural(dls.length, 'deadline') : 'no deadlines'}${evs.length ? ', ' + plural(evs.length, 'event') : ''}`;
      return `<div class="mcell${out ? ' out' : ''}${iso === TODAY ? ' today' : ''}${isWe(iso) ? ' we' : ''}${busy ? ' busy' : ''}${iso === sel ? ' sel' : ''}" data-mcell="${iso}">
        <button class="mn" data-mday="${iso}" aria-label="${esc(label)}">${x.getDate()}</button>
        <div class="mitems">${itemsHTML}${items.length > shown.length ? `<button class="mmore" data-mday="${iso}">${num(items.length - shown.length)} more</button>` : ''}</div>
        <span class="mdots" aria-hidden="true">${dots}${items.length > 5 ? '<b>+</b>' : ''}</span></div>`;
    }).join('');
    const wdh = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<span>${d}</span>`).join('');
    let empty = '';
    if (!P.loading && total === 0) {
      let nxt = null;
      for (let k = 1; k <= 24 && !nxt; k++) {
        const ym = toIso(new Date(y, m - 1 + k, 1)).slice(0, 7);
        if (list.some((t) => t.end && t.end.slice(0, 7) === ym) || (eventsOn() && P.db.events.some((e) => e.date.slice(0, 7) === ym))) nxt = ym;
      }
      empty = `<div class="empty sm m-empty"><div class="art">${ic('cal')}</div><h3>Nothing in ${monthName(ui.month)}</h3><p>No deadlines${eventsOn() ? ' and no team events' : ''} this month${ui.person ? ` for ${esc(ui.person)}` : ''}.</p><div class="acts">${nxt ? `<button class="btn sm" data-month="${nxt}">Go to ${monthName(nxt)}</button>` : ''}${ui.month !== TODAY.slice(0, 7) ? '<button class="btn sm" data-today>Back to this month</button>' : ''}${filtersOn() ? '<button class="btn sm" data-clearall>Clear filters</button>' : ''}</div></div>`;
    }
    const evNote = eventsOn() || ui.show === 'tasks' ? '' : calendarNotice(true);
    const loading = P.loading ? `<div class="loading-note"><span class="spin"></span>Loading tasks</div>` : '';
    // Phones: the grid shows dots, and the chosen day is listed below it.
    const agenda = `<div class="m-agenda">${dayLists(sel, true)}</div>`;
    return `<section class="panel glass" aria-label="${monthName(ui.month)}">${tools()}${loading}${evNote ? `<div style="padding:0 8px">${evNote}</div>` : ''}${empty}
      <div class="mgrid-wrap"><div class="mwd" aria-hidden="true">${wdh}</div><div class="mgrid">${cells}</div></div>
      <div class="legend m-legend"><span><i style="background:var(--pro)"></i>Prospects</span><span><i style="background:var(--cli)"></i>Clients</span><span><i style="background:var(--int)"></i>Internal</span><span><i style="background:#b7c3d8"></i>Team calendar</span><span><i style="background:#ffd99a"></i>Busy day</span></div></section>
      ${agenda}`;
  }

  /* ---------- One day (D4, D5, D9, D11) ---------- */
  function dayData(iso) {
    const list = tasks();
    return {
      fin: list.filter((t) => t.end === iso),
      sta: list.filter((t) => t.start === iso && t.end !== iso),
      und: list.filter((t) => activeOn(t, iso) && t.start !== iso && t.end !== iso).sort((a, b) => (a.end || '9').localeCompare(b.end || '9')),
      evs: eventsFor(iso),
    };
  }
  function dayLists(iso, compact) {
    if (P.loading) return `<section class="panel glass"><div class="loading-note"><span class="spin"></span>Loading tasks</div>${skelRows(3)}</section>`;
    const d = dayData(iso);
    const nTasks = d.fin.length + d.sta.length + d.und.length;
    const evAvail = P.eventsState === 'ok';
    const showTasks = ui.show !== 'events'; const showEv = ui.show !== 'tasks';
    if (!nTasks && !d.evs.length && (evAvail || !showEv)) {
      const nxt = nextWith(iso, 1, tasks()); const prv = nextWith(iso, -1, tasks());
      const forWho = ui.person ? ` for ${esc(ui.person)}` : (ui.work ? ` in ${esc(workLabel().toLowerCase())}${WORK[ui.work] ? ' work' : ''}` : '');
      const what = ui.show === 'events' ? 'No team events' : (ui.show === 'tasks' ? 'No tasks start, finish or run' : 'No tasks start, finish or run, and there are no team events');
      return `<section class="panel glass"><div class="empty${compact ? ' sm' : ''}"><div class="art">${ic('cal')}</div><h3>Nothing on ${longDate(iso)}</h3><p>${what}${forWho} on this day.</p><div class="acts">${prv ? `<button class="btn sm" data-goto="${prv}">${ic('left')}${shortDate(prv)}</button>` : ''}${nxt ? `<button class="btn sm" data-goto="${nxt}">Next with something: ${shortDate(nxt)}${ic('right')}</button>` : ''}${filtersOn() ? '<button class="btn sm" data-clearall>Clear filters</button>' : ''}</div></div></section>`;
    }
    const sec = (key, label, dot, arr) => (arr.length ? `<div class="group-label"><i style="background:${dot}"></i>${label}<span class="c">${num(arr.length)}</span></div>${arr.map((t) => dayRow(t, key)).join('')}` : '');
    const tasksPanel = !showTasks ? '' : `<section class="panel glass" aria-labelledby="dt-h"><div class="panel-head"><h2 id="dt-h">Tasks</h2><span class="cnt">${num(nTasks)}</span></div>
      ${nTasks ? sec('fin', iso === TODAY ? 'Deadline today' : 'Deadline on this day', 'var(--amber)', d.fin) + sec('sta', 'Starting', 'var(--blue)', d.sta) + sec('und', 'Under way', '#b7bbd0', d.und)
        : `<div class="empty sm"><div class="art">${ic('done')}</div><h3>No tasks on this day</h3><p>Nothing starts, finishes or runs${ui.person ? ` for ${esc(ui.person)}` : ''}.</p></div>`}</section>`;
    let evBody;
    if (P.eventsState !== 'ok') evBody = calendarNotice();
    else if (!d.evs.length) evBody = `<div class="empty sm"><div class="art">${ic('cal')}</div><h3>No events</h3><p>Nothing is on the team calendar.</p></div>`;
    else evBody = d.evs.map(eventRow).join('');
    const evPanel = !showEv ? '' : `<section class="panel glass" aria-labelledby="de-h"><div class="panel-head"><h2 id="de-h">Team calendar</h2>${d.evs.length ? `<span class="cnt">${num(d.evs.length)}</span>` : ''}<span class="sp"></span><span class="ro" title="Events come from the team calendar and can't be changed here">${ic('lock')}Read only</span></div>${evBody}</section>`;
    if (compact) return `<div class="m-day-h"><h2>${longDate(iso)}</h2><span class="tag ${iso === TODAY ? 'pro' : 'int'}">${rel(iso)}</span></div>${tasksPanel}${evPanel}`;
    return `<div class="board day-board${!showTasks || !showEv ? ' one' : ''}">${tasksPanel}${evPanel ? `<div class="rail">${evPanel}</div>` : ''}</div>`;
  }
  function day() {
    landDay();
    const iso = ui.date;
    const list = tasks();
    const ws = weekStart(iso);
    const strip = range(7).map((i) => {
      const d = add(ws, i); const x = P.parse(d);
      const n = P.loading ? 0 : list.filter((t) => t.end === d).length; const e = eventsFor(d).length;
      return `<button class="wday${d === iso ? ' sel' : ''}${d === TODAY ? ' today' : ''}" data-goto="${d}" aria-pressed="${d === iso}" aria-label="${longDate(d)}: ${plural(n, 'deadline')}, ${plural(e, 'event')}"><span>${WD[x.getDay()]}</span><b>${x.getDate()}</b><span class="wd-dots">${n ? `<i class="t">${num(n)}</i>` : ''}${e ? `<i class="e">${num(e)}</i>` : ''}</span></button>`;
    }).join('');
    const d = P.loading ? null : dayData(iso);
    const counts = d ? [d.fin.length && `${num(d.fin.length)} due`, d.sta.length && `${num(d.sta.length)} starting`, d.und.length && `${num(d.und.length)} under way`, d.evs.length && plural(d.evs.length, 'event')].filter(Boolean).join(', ') : '';
    const landed = ui.landed ? `<div class="notice" style="margin:14px 0 0">${ic('info')}<div><p><b>Nothing is happening today.</b> This is the next day with something on it.</p></div><span class="sp" style="flex:1"></span><button class="btn sm" data-goto="${TODAY}">Show today</button></div>` : '';
    return `<section class="panel glass" aria-label="Choose a day">${tools()}
        <div class="dayhead"><div class="dh-main"><h2>${longDate(iso)}</h2><p><span class="tag ${iso === TODAY ? 'pro' : 'int'}">${rel(iso)}</span>${counts ? `<span>${counts}</span>` : ''}</p></div>
          <label class="dpick"><span class="sr">Go to a date</span>${ic('cal')}<input type="date" value="${iso}" data-pick aria-label="Go to a date"></label></div>
        <div class="wstrip" role="group" aria-label="Days of this week">${strip}</div></section>
      ${landed}${dayLists(iso)}`;
  }

  /* ---------- People (D1, D6) ---------- */
  function loadMap() {
    const m = new Map();
    P.db.people.forEach((n) => m.set(n, { own: [], inf: [] }));
    const saved = ui.person; ui.person = '';
    const list = tasks(true);
    ui.person = saved;
    list.forEach((t) => {
      t.resp.forEach((n) => { if (!m.has(n)) m.set(n, { own: [], inf: [] }); m.get(n).own.push(t); });
      t.inf.forEach((i) => { if (!m.has(i.name)) m.set(i.name, { own: [], inf: [] }); m.get(i.name).inf.push(t); });
    });
    return m;
  }
  function people() {
    if (P.loading) return `<section class="panel glass">${tools()}<div class="loading-note"><span class="spin"></span>Loading tasks</div>${range(5).map(() => '<div class="who"><span class="skel" style="width:34px;height:34px;border-radius:50%"></span><div><span class="skel" style="height:12px;width:40%"></span><span class="skel" style="height:10px;width:25%;margin-top:7px"></span></div><span></span></div>').join('')}</section>`;
    if (ui.person) return person();
    const m = loadMap();
    let rows = Array.from(m.entries()).sort((a, b) => b[1].own.length - a[1].own.length || b[1].inf.length - a[1].inf.length || a[0].localeCompare(b[0]));
    const all = rows.length;
    if (ui.pq) rows = rows.filter(([n]) => n.toLowerCase().includes(ui.pq.toLowerCase()));
    const max = Math.max(1, ...rows.map(([, r]) => r.own.length + r.inf.length));
    const span14 = range(14).map((i) => add(TODAY, i));
    const body = rows.length ? rows.map(([n, r]) => {
      const over = r.own.filter((t) => t.end && t.end < TODAY).length;
      const next = r.own.filter((t) => t.end && t.end >= TODAY).sort((a, b) => a.end.localeCompare(b.end))[0];
      const perDay = span14.map((d) => r.own.filter((t) => t.end === d).length);
      const pmax = Math.max(2, ...perDay);
      return `<button class="prow" data-person="${esc(n)}">${P.av(n)}
        <div class="pn"><p>${esc(n)}</p><small>${r.own.length || r.inf.length ? `Owns ${num(r.own.length)}, kept informed on ${num(r.inf.length)}` : 'Nothing open'}${over ? `<span class="tone-red">, ${num(over)} overdue</span>` : ''}</small></div>
        <span class="pbar" role="img" aria-label="Owns ${r.own.length}, kept informed on ${r.inf.length}"><i class="own" style="width:${(r.own.length / max) * 100}%"></i><i class="inf" style="width:${(r.inf.length / max) * 100}%"></i></span>
        <span class="spark" role="img" aria-label="Deadlines over the next two weeks">${perDay.map((c, i) => `<i class="${i === 0 ? 'td' : ''}" style="height:${c ? 4 + (c / pmax) * 20 : 2}px${c ? '' : ';opacity:.35'}"></i>`).join('')}</span>
        <span class="pnext">${next ? `Next due <b>${P.wd(next.end)}</b>` : '<span class="empty-v">No deadlines</span>'}</span></button>`;
    }).join('') : `<div class="empty sm"><div class="art">${ic('search')}</div><h3>Nobody matches “${esc(ui.pq)}”</h3><p>Try part of a first or last name.</p></div>`;
    const search = all > 8 ? `<label class="search glass p-search">${ic('search')}<span class="sr">Find a person</span><input type="search" data-pq value="${esc(ui.pq)}" placeholder="Find a person"></label>` : '';
    return `<section class="panel glass" aria-labelledby="pp-h">${tools()}<div class="panel-head"><h2 id="pp-h">Everyone</h2><span class="cnt">${num(all)}</span><span class="sp"></span>${search}</div>
      <div class="phead-row" aria-hidden="true"><span></span><span>Person</span><span>Owned and informed</span><span>Deadlines, next two weeks</span><span>Next</span></div>
      ${body}<p class="help" style="padding:4px 14px 0">Owned is solid, kept informed is outlined. Names come from tasks; people aren't accounts.</p></section>`;
  }
  function person() {
    const n = ui.person;
    const r = loadMap().get(n) || { own: [], inf: [] };
    const byEnd = (a, b) => (a.end || '9').localeCompare(b.end || '9');
    const over = r.own.filter((t) => t.end && t.end < TODAY).length;
    const soon = r.own.filter((t) => t.end && t.end >= TODAY && between(TODAY, t.end) <= 13).length;
    const stat = (v, l, tone) => `<div class="pstat${tone ? ' ' + tone : ''}"><b>${num(v)}</b><span>${l}</span></div>`;
    const headCard = `<section class="phead glass">${P.av(n, 'xl')}<div class="ph-main"><h2>${esc(n)}</h2><p>${r.own.length || r.inf.length ? `Responsible for ${plural(r.own.length, 'open task')} and kept informed on ${num(r.inf.length)}.` : 'No open work at the moment.'}</p>
        <div class="ph-acts"><button class="btn sm" data-pview="timeline">${ic('cal')}On the timeline</button><button class="btn sm" data-pview="day">${ic('sun')}Their day</button></div></div>
        <div class="pstats">${stat(r.own.length, 'Owned')}${stat(r.inf.length, 'Kept informed')}${stat(soon, 'Due in 2 weeks', soon >= 4 ? 'amber' : '')}${stat(over, 'Overdue', over ? 'red' : '')}</div></section>`;
    if (!r.own.length && !r.inf.length) {
      return `${headCard}<section class="panel glass" style="margin-top:22px"><div class="empty"><div class="art">${ic('people')}</div><h3>Nothing open for ${esc(n)}</h3><p>${esc(n.split(' ')[0])} isn't responsible for any open task${ui.work ? ' of this kind' : ''} and isn't kept informed on any. Name them on a task to give them work.</p><div class="acts"><button class="btn sm" data-pback>${ic('left')}Everyone</button>${ui.work ? '<button class="btn sm" data-clearall>Clear filter</button>' : ''}</div></div></section>`;
    }
    const list = (arr, ctx, emptyText) => (arr.length ? arr.slice().sort(byEnd).map((t) => dayRow(t, ctx)).join('') : `<div class="empty sm"><p>${emptyText}</p></div>`);
    return `${headCard}<div class="board person-board">
      <section class="panel glass" aria-labelledby="po-h"><div class="panel-head"><h2 id="po-h">Responsible for</h2><span class="cnt">${num(r.own.length)}</span></div>${list(r.own, 'und', 'Not responsible for any open task.')}</section>
      <section class="panel glass" aria-labelledby="pi-h"><div class="panel-head"><h2 id="pi-h">Kept informed on</h2><span class="cnt">${num(r.inf.length)}</span></div>${list(r.inf, 'inf', 'Not kept informed on any open task.')}</section></div>`;
  }

  /* ---------- Page ---------- */
  function syncUrl() {
    const u = new URLSearchParams();
    if (ui.view !== 'timeline') u.set('view', ui.view);
    if (ui.view === 'day' && ui.date && !ui.landed) u.set('date', ui.date);
    if (ui.view === 'timeline' && ui.from !== weekStart(TODAY)) u.set('from', ui.from);
    if (ui.view === 'month' && ui.month !== TODAY.slice(0, 7)) u.set('month', ui.month);
    if (ui.person) u.set('person', ui.person);
    if (ui.work) u.set('work', ui.work);
    if (ui.show !== 'all' && ui.view !== 'people') u.set('show', ui.show);
    if (ui.rows !== 'person') u.set('rows', ui.rows);
    if (P.state) u.set('state', P.state);
    const s = u.toString() + (P.stress ? (u.toString() ? '&' : '') + 'stress' : '');
    history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
  }
  let lastW = innerWidth;
  function render() {
    lastW = innerWidth;
    const main = P.$('#main');
    const keepScroll = P.$('.tl-scroll') ? P.$('.tl-scroll').scrollLeft : null;
    main.innerHTML = header() + { timeline, month, day, people }[ui.view]();
    const sc = P.$('.tl-scroll');
    if (sc) {
      // Phones scroll the four weeks sideways: start at today's column.
      if (keepScroll !== null) sc.scrollLeft = keepScroll;
      else { const t = P.$('.dayh.today'); if (t && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = Math.max(0, t.offsetLeft - 56 - 44); }
    }
    syncUrl();
  }

  /* ---------- Menus ---------- */
  function openMenu(key, btn) {
    if (key === 'work') {
      const gs = P.sortedGroups();
      return P.menu(btn, `<h4>Kind of work</h4>${P.mi('', 'All work', !ui.work)}${Object.entries(WORK).map(([k, l]) => P.mi(k, l, ui.work === k)).join('')}${gs.length ? `<hr><h4>Task group</h4>${gs.map((g) => P.mi('g:' + g.id, `${P.gi(g)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.name)}</span>`, ui.work === 'g:' + g.id)).join('')}` : ''}`, (v) => { ui.work = v; render(); });
    }
    if (key === 'person') {
      const m = loadMap();
      const names = Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      return P.menu(btn, `<h4>Show one person's work</h4>${P.mi('', 'Everyone', !ui.person)}<hr>${names.map(([n, r]) => P.mi(n, `${P.av(n)}<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n)}</span><small style="margin-left:auto;color:var(--muted);font-weight:500">${num(r.own.length)}</small>`, ui.person === n)).join('')}<p class="foot">The number is how many open tasks they own. Tasks they're kept informed on show outlined.</p>`, (v) => { ui.person = v; ui.expanded.clear(); render(); });
    }
    if (key === 'rows') {
      return P.menu(btn, `<h4>One row for each</h4>${P.mi('person', 'Person responsible', ui.rows === 'person')}${P.mi('kind', 'Kind of work', ui.rows === 'kind')}<p class="foot">A task with several people responsible shows in each of their rows.</p>`, (v) => { ui.rows = v; ui.expanded.clear(); render(); });
    }
  }

  /* ---------- Events ---------- */
  function step(dir) {
    if (ui.view === 'timeline') ui.from = add(ui.from, dir * 14);
    if (ui.view === 'month') { const [y, m] = ui.month.split('-').map(Number); ui.month = toIso(new Date(y, m - 1 + dir, 1)).slice(0, 7); }
    if (ui.view === 'day') { ui.date = add(ui.date || TODAY, dir); ui.landed = false; }
    render();
  }
  function goToday() {
    if (ui.view === 'timeline') ui.from = weekStart(TODAY);
    if (ui.view === 'month') { ui.month = TODAY.slice(0, 7); ui.date = TODAY; }
    if (ui.view === 'day') { ui.date = TODAY; ui.landed = false; }
    render();
  }
  function openDay(iso) { ui.view = 'day'; ui.date = iso; ui.landed = false; render(); window.scrollTo(0, 0); }

  P.$('#app').addEventListener('click', (e) => {
    const t = e.target;
    const done = t.closest('[data-done]');
    if (done) { e.stopPropagation(); P.markDone(done.dataset.done); return; }
    const mb = t.closest('[data-menu]'); if (mb) { openMenu(mb.dataset.menu, mb); return; }
    const clr = t.closest('[data-clear]'); if (clr) { ui[clr.dataset.clear] = ''; ui.expanded.clear(); render(); return; }
    if (t.closest('[data-clearall]')) { ui.work = ''; ui.person = ui.view === 'people' ? ui.person : ''; render(); return; }
    const v = t.closest('[data-view]'); if (v) { ui.view = v.dataset.view; if (ui.view === 'day') { ui.date = ''; ui.landed = false; } render(); return; }
    const sh = t.closest('[data-show]'); if (sh) { ui.show = sh.dataset.show; render(); return; }
    const st = t.closest('[data-step]'); if (st) { step(+st.dataset.step); return; }
    if (t.closest('[data-today]')) { goToday(); return; }
    const dy = t.closest('[data-day]'); if (dy) { openDay(dy.dataset.day); return; }
    const go = t.closest('[data-goto]'); if (go) { ui.date = go.dataset.goto; ui.landed = false; render(); return; }
    const mo = t.closest('[data-month]'); if (mo) { ui.month = mo.dataset.month; ui.date = ''; render(); return; }
    const ex = t.closest('[data-expand]'); if (ex) { const k = ex.dataset.expand; if (ui.expanded.has(k)) ui.expanded.delete(k); else ui.expanded.add(k); render(); return; }
    const pr = t.closest('[data-person]'); if (pr) { ui.person = pr.dataset.person; render(); window.scrollTo(0, 0); return; }
    if (t.closest('[data-pback]')) { ui.person = ''; render(); return; }
    const pv = t.closest('[data-pview]'); if (pv) { ui.view = pv.dataset.pview; if (ui.view === 'day') { ui.date = ''; ui.landed = false; } render(); window.scrollTo(0, 0); return; }
    const md = t.closest('[data-mday]');
    if (md) {
      // Large screens open the day; phones pick it and list it under the grid.
      if (innerWidth < 760) { ui.date = md.dataset.mday; render(); const a = P.$('.m-agenda'); if (a) a.scrollIntoView({ behavior: 'smooth', block: 'start' }); } else openDay(md.dataset.mday);
      return;
    }
    const row = t.closest('[data-open]');
    if (row && !t.closest('a')) { P.openTask(row.dataset.open); return; }
    const cell = t.closest('[data-mcell]');
    if (cell && innerWidth < 760) { ui.date = cell.dataset.mcell; render(); }
  });
  P.$('#app').addEventListener('change', (e) => {
    if (e.target.matches('[data-pick]') && e.target.value) { ui.date = e.target.value; ui.landed = false; render(); }
  });
  let pqTimer;
  P.$('#app').addEventListener('input', (e) => {
    if (!e.target.matches('[data-pq]')) return;
    ui.pq = e.target.value; clearTimeout(pqTimer);
    pqTimer = setTimeout(() => { render(); const i = P.$('[data-pq]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 160);
  });
  let rz;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (ui.view === 'timeline' && Math.abs(innerWidth - lastW) > 30) render(); }, 150); });

  P.boot({
    page: 'plan', render,
    states: [['', 'Normal'], ['empty', 'Nothing yet (no tasks)'], ['free-today', 'Nothing happening today'], ['loading', 'Loading'], ['events-loading', 'Events loading'], ['events-off', 'Calendar not set up'], ['events-fail', 'Events failed to load'], ['offline', 'No connection'], ['offline-empty', 'No connection, nothing loaded'], ['live', 'Live change from a colleague']],
    opens: [['work', 'Work filter'], ['person', 'Person filter'], ['rows', 'Rows'], ['task-edit', 'Open a task'], ['task-new', 'New task'], ['more', 'Phone: More']],
    afterBoot() {
      if (P.state !== 'live') return;
      // A colleague moves a deadline and adds a task; both appear without a reload (A1).
      setTimeout(() => {
        P.liveIds = new Set();
        const t = P.task('t11') || P.db.tasks.find((x) => !x.done && x.end);
        if (t) { t.end = add(TODAY, 2); P.liveIds.add(t.id); P.flash.add(t.id); }
        const n = { id: 'live1', desc: 'Prepare the partner webinar slides', co: null, group: 'q4', type: 'Admin', touch: '', prio: 'medium', start: TODAY, end: add(TODAY, 4), last: null, key: '', resp: ['Kevin Tan'], inf: [], done: false, doneAt: null };
        if (P.group('q4')) { P.db.tasks.unshift(n); P.liveIds.add(n.id); P.flash.add(n.id); }
        P.render();
        P.toast('Kevin Tan’s changes just came in');
      }, 1200);
    },
    onOpen(o) {
      if (['work', 'person', 'rows'].includes(o)) { const b = P.$(`[data-menu="${o}"]`); if (b) openMenu(o, b); }
    },
  });
})();
