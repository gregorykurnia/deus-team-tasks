/* All tasks and task groups: kinds of work, open and done, filters, sort, columns. */
(function () {
  const { ic, esc, num, plural } = P;
  const q = P.qs;
  const ui = {
    kind: q.get('kind') || 'all',
    group: q.get('group') || null,
    view: q.get('view') || 'open',
    q: q.get('q') || '',
    due: q.get('due') || '',
    type: q.get('type') || '',
    idle: q.get('idle') ? +q.get('idle') : 0,
    range: q.get('range') || 'week',
    sort: q.get('sort') || '',
    dir: q.get('dir') || '',
    limit: 100,
  };

  if (ui.group && !P.group(ui.group)) ui.group = null;

  const COLS = [
    { id: 'about', label: 'Company or group', w: 'minmax(130px, 1fr)', sort: 'about' },
    { id: 'type', label: 'Task type', w: '104px', sort: 'type' },
    { id: 'touch', label: 'Touch point', w: '96px' },
    { id: 'prio', label: 'Priority', w: '86px', sort: 'prio' },
    { id: 'start', label: 'Start', w: '76px', sort: 'start' },
    { id: 'end', label: 'Deadline', w: '118px', sort: 'end' },
    { id: 'last', label: 'Last action', w: '104px', sort: 'last' },
    { id: 'resp', label: 'Responsible', w: 'minmax(110px, .8fr)' },
    { id: 'inf', label: 'Informed', w: 'minmax(110px, .8fr)' },
    { id: 'key', label: 'Key points', w: 'minmax(150px, 1.2fr)' },
  ];
  const DEFAULT_COLS = ['about', 'type', 'end', 'last', 'resp'];
  let cols = P.lsGet('cols', DEFAULT_COLS);
  const SORTS = { end: 'Deadline', last: 'Last action', about: 'Company', type: 'Task type', desc: 'Description', prio: 'Priority', start: 'Start', doneAt: 'Finished' };
  const PRIO = { high: 0, medium: 1, low: 2 };

  const defaultSort = () => {
    if (ui.view === 'done') return ['doneAt', 'desc'];
    if (ui.kind === 'pro' && !ui.group) return ['end', 'desc']; // W14: prospect work, latest deadlines first, undated last
    return ['end', 'asc'];
  };
  const sortKey = () => ui.sort || defaultSort()[0];
  const sortDir = () => ui.dir || (ui.sort ? (['end', 'start', 'about', 'type', 'desc', 'prio'].includes(ui.sort) ? 'asc' : 'desc') : defaultSort()[1]);
  const dirLabels = (k) => ({
    end: ['Earliest first', 'Latest first'], start: ['Earliest first', 'Latest first'], doneAt: ['Oldest first', 'Most recent first'],
    last: ['Longest without action first', 'Most recent first'], prio: ['High first', 'Low first'],
  }[k] || ['A to Z', 'Z to A']);

  function syncUrl() {
    const u = new URLSearchParams();
    if (ui.group) u.set('group', ui.group); else if (ui.kind !== 'all') u.set('kind', ui.kind);
    if (ui.view !== 'open') u.set('view', ui.view);
    if (ui.q) u.set('q', ui.q);
    if (ui.due && ui.view === 'open') u.set('due', ui.due);
    if (ui.type) u.set('type', ui.type);
    if (ui.idle && ui.view === 'open') u.set('idle', ui.idle);
    if (ui.view === 'done' && ui.range !== 'week') u.set('range', ui.range);
    if (ui.sort) { u.set('sort', ui.sort); u.set('dir', sortDir()); }
    if (P.state) u.set('state', P.state);
    const s = u.toString() + (P.stress ? (u.toString() ? '&' : '') + 'stress' : '');
    history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
  }

  /* ---------- Filtering ---------- */
  function scope() {
    let list = ui.view === 'done' ? P.db.tasks.filter((t) => t.done && t.id !== P.justDone) : P.openTasks();
    if (ui.group) list = list.filter((t) => t.group === ui.group);
    return list;
  }
  function apply(list) {
    if (!ui.group && ui.kind !== 'all') list = list.filter((t) => P.kind(t) === ui.kind);
    if (ui.q) {
      const s = ui.q.toLowerCase();
      list = list.filter((t) => {
        const c = P.company(t.co); const g = P.group(t.group);
        return [t.desc, c && c.name, g && g.name, t.type, t.touch, t.key, ...t.resp, ...t.inf.map((i) => i.name + ' ' + i.note)].some((v) => v && v.toLowerCase().includes(s));
      });
    }
    if (ui.view === 'open') {
      if (ui.due) list = list.filter((t) => P.bucket(t) === ui.due || (t.id === P.justDone));
      if (ui.idle) list = list.filter((t) => t.co && t.last && P.idleDays(t) >= ui.idle);
    } else {
      const lim = { week: 7, month: 30 }[ui.range];
      if (lim) list = list.filter((t) => t.doneAt && -P.diff(t.doneAt) < lim);
    }
    if (ui.type) list = list.filter((t) => (ui.type === '-' ? !t.type : t.type === ui.type));
    return list;
  }
  function sortList(list) {
    const k = sortKey(); const dir = sortDir() === 'asc' ? 1 : -1;
    const val = (t) => {
      switch (k) {
        case 'end': return t.end; case 'start': return t.start; case 'last': return t.co ? t.last : null; case 'doneAt': return t.doneAt;
        case 'about': { const c = P.company(t.co); const g = P.group(t.group); return c ? c.name.toLowerCase() : (g ? g.name.toLowerCase() : null); }
        case 'type': return t.type ? t.type.toLowerCase() : null; case 'desc': return t.desc.toLowerCase();
        case 'prio': return t.prio ? PRIO[t.prio] : null;
        default: return null;
      }
    };
    return list.map((t) => [t, val(t)]).sort((a, b) => {
      if (a[1] == null && b[1] == null) return 0;
      if (a[1] == null) return 1; // empty values always last, whichever way round
      if (b[1] == null) return -1;
      return (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) * dir;
    }).map((x) => x[0]);
  }
  const filtersOn = () => !!(ui.q || (ui.view === 'open' && (ui.due || ui.idle)) || ui.type);

  /* ---------- Rows ---------- */
  const visCols = () => COLS.filter((c) => cols.includes(c.id));
  const gridCols = () => ['26px', 'minmax(200px, 2.2fr)', ...visCols().map((c) => c.w)].join(' ');

  function cell(t, c) {
    const co = P.company(t.co); const g = P.group(t.group); const k = P.kind(t);
    let v = ''; let cls = ''; let lbl = c.label;
    switch (c.id) {
      case 'about':
        v = co ? `<span class="tag ${k}">${esc(co.name)}</span>` : (g ? `<span style="display:inline-flex;align-items:center;gap:7px;min-width:0">${P.gi(g)}<span style="overflow:hidden;text-overflow:ellipsis">${esc(g.name)}</span></span>` : '<span class="tag int">Internal</span>');
        lbl = co ? 'Company' : 'Group'; break;
      case 'type': v = esc(t.type); break;
      case 'touch': v = esc(t.touch); break;
      case 'prio': v = t.prio ? `<span class="${t.prio === 'high' ? 'tone-red' : ''}">${t.prio[0].toUpperCase() + t.prio.slice(1)}</span>` : ''; break;
      case 'start': v = t.start ? P.fmt(t.start) : ''; break;
      case 'end': v = P.pill(t); cls = 'c-dead'; lbl = ui.view === 'done' ? 'Finished' : 'Deadline'; break;
      case 'last': { const la = P.lastAction(t); v = la ? `<span class="${la.tone ? 'tone-' + la.tone : ''}" title="${esc(la.label)}">${esc(la.short)}</span>` : ''; lbl = 'Last action'; break; }
      case 'resp': v = t.resp.length ? `<span style="display:inline-flex;align-items:center;gap:8px;min-width:0">${P.avStack({ resp: t.resp, inf: [] }, 3)}${t.resp.length === 1 ? `<span style="overflow:hidden;text-overflow:ellipsis">${esc(t.resp[0].split(' ')[0])}</span>` : ''}</span>` : ''; break;
      case 'inf': v = t.inf.length ? esc(t.inf.map((i) => i.name.split(' ')[0] + (i.note ? ` (${i.note})` : '')).join(', ')) : ''; cls = 'wrap'; break;
      case 'key': v = esc(t.key); cls = 'wrap'; break;
    }
    const empty = !v;
    return `<div class="cell col-${c.id} ${cls}${empty ? ' empty-cell' : ''}"><span class="lbl">${lbl}</span>${empty ? '<span class="empty-v" aria-label="none">–</span>' : v}</div>`;
  }
  function row(t) {
    const showAbout = !cols.includes('about');
    const co = P.company(t.co); const g = P.group(t.group); const k = P.kind(t);
    const meta = [];
    if (showAbout && co) meta.push(`<span class="co">${esc(co.name)}</span>`);
    if (showAbout && !co && g && !ui.group) meta.push(`<span class="co">${esc(g.name)}</span>`);
    if (!cols.includes('end') && ui.view === 'open' && P.deadline(t).tone !== 'calm') meta.push(`<span>${esc(P.deadline(t).label)}</span>`);
    if (P.liveIds && P.liveIds.has(t.id)) meta.push('<span class="live-tag">Just changed</span>');
    const isDone = t.done;
    return `<div class="trow k-${k}${isDone ? ' is-done' : ''}${t.id === P.justDone ? ' is-leaving' : ''}${P.flash.has(t.id) ? ' is-new' : ''}" data-open="${t.id}" style="--cols:${gridCols()}">
      <button class="check" data-done="${t.id}" aria-label="${isDone ? 'Mark not done' : 'Mark done'}: ${esc(t.desc)}">${ic('check')}</button>
      <div class="desc"><p class="tt">${esc(t.desc)}</p>${meta.length ? `<p class="meta">${meta.join('')}</p>` : ''}</div>
      ${visCols().map((c) => cell(t, c)).join('')}</div>`;
  }
  function headRow() {
    const k = sortKey(); const d = sortDir();
    const th = (label, key) => (key ? `<button data-sort="${key}"${k === key ? ` aria-sort="${d === 'asc' ? 'ascending' : 'descending'}"` : ''}>${label}${k === key ? ic(d === 'asc' ? 'up' : 'down') : ''}</button>` : `<span>${label}</span>`);
    return `<div class="thead" style="--cols:${gridCols()}"><span></span>${th('Description', 'desc')}${visCols().map((c) => {
      if (c.id === 'end' && ui.view === 'done') return th('Finished', 'doneAt');
      return th(c.label, c.sort);
    }).join('')}</div>`;
  }

  /* ---------- Page ---------- */
  function header() {
    const g = P.group(ui.group);
    const search = (cls) => `<label class="search glass ${cls}">${ic('search')}<span class="sr">Search tasks</span><input type="search" data-q value="${esc(ui.q)}" placeholder="${g ? 'Search this group' : 'Search tasks'}"></label>`;
    if (g) {
      const open = P.groupOpen(g.id);
      return `<div class="group-head">${P.gi(g)}<div style="min-width:0;flex:1"><div class="bar" style="min-height:0"><div class="ttl"><h1>${esc(g.name)}</h1><span class="sub">${P.loading ? '' : plural(open, 'open task')}</span></div></div></div>
        <button class="star-btn" data-star aria-pressed="${g.important}" aria-label="Important" title="${g.important ? 'Marked as important' : 'Mark as important'}">${ic(g.important ? 'star' : 'starline')}</button>
        ${search('')}<button class="icon-btn glass" data-gmenu aria-label="Group options">${ic('more')}</button>
        <button class="cta" data-act="task-new">${ic('plus')}New task</button></div>`;
    }
    const open = P.db.tasks.filter((t) => !t.done).length;
    return `<div class="bar"><div class="ttl"><h1>Tasks</h1><span class="sub">${P.loading ? '' : plural(open, 'open task')}</span></div><span class="sp"></span>${search('')}<button class="cta" data-act="task-new">${ic('plus')}New task</button></div>`;
  }
  function groupChips() {
    const gs = P.sortedGroups();
    return `<nav class="grp-chips" aria-label="Task groups">
      ${ui.group ? `<a href="${P.keep('tasks.html')}">${ic('list')}<span class="nm">All tasks</span></a>` : ''}
      ${gs.map((g) => `<a href="${P.keep('tasks.html?group=' + g.id)}"${ui.group === g.id ? ' aria-current="page"' : ''}>${P.gi(g)}<span class="nm">${esc(g.name)}</span>${g.important ? ic('star', 'star') : ''}<span class="n">${num(P.groupOpen(g.id))}</span></a>`).join('')}
      <button data-act="group-new">${ic('plus')}New group</button></nav>`;
  }
  function tbar(all) {
    const kc = { all: all.length, pro: 0, cli: 0, int: 0 }; all.forEach((t) => { kc[P.kind(t)]++; });
    const kinds = ui.group ? '' : `<div class="seg" role="group" aria-label="Kind of work">${[['all', 'All'], ['pro', 'Prospects'], ['cli', 'Clients'], ['int', 'Internal']].map(([v, l]) => `<button aria-pressed="${ui.kind === v}" data-kind="${v}">${l}${P.loading ? '' : ` <span class="c">${num(kc[v])}</span>`}</button>`).join('')}</div>`;
    const view = `<div class="seg" role="group" aria-label="Open or done"><button aria-pressed="${ui.view === 'open'}" data-view="open">Open</button><button aria-pressed="${ui.view === 'done'}" data-view="done">Done</button></div>`;
    return `<div class="tbar">${kinds}<span class="sp"></span>${view}</div>`;
  }
  function filters() {
    const fb = (key, icon, label, val, on) => (on
      ? `<span class="fbtn on"><button data-menu="${key}" aria-haspopup="menu">${ic(icon)}${label} <span class="v">${esc(val)}</span></button><button class="x" data-clear="${key}" aria-label="Clear the ${label.toLowerCase()} filter">${ic('x')}</button></span>`
      : `<button class="fbtn" data-menu="${key}" aria-haspopup="menu">${ic(icon)}${label}${val ? ` <span class="v">${esc(val)}</span>` : ''}${ic('down')}</button>`);
    const dueL = { overdue: 'Overdue', soon: 'Next 3 days', active: 'Under way today', nodate: 'No dates' }[ui.due];
    const showIdle = ui.view === 'open' && !ui.group && ui.kind !== 'int';
    const parts = [];
    if (ui.view === 'open') parts.push(fb('due', 'clock', 'Due', dueL || '', !!ui.due));
    else parts.push(fb('range', 'clock', 'Finished', { week: 'Last 7 days', month: 'Last 30 days', all: 'Any time' }[ui.range], false));
    parts.push(fb('type', 'filter', 'Type', ui.type ? (ui.type === '-' ? 'No type' : ui.type) : '', !!ui.type));
    if (showIdle) parts.push(fb('idle', 'clock', 'No action for', ui.idle ? `${ui.idle}+ days` : '', !!ui.idle));
    const k = sortKey();
    parts.push(`<button class="fbtn" data-menu="sort" aria-haspopup="menu">${ic('sort')}Sort <span class="v">${SORTS[k]}, ${dirLabels(k)[sortDir() === 'asc' ? 0 : 1].toLowerCase()}</span>${ic('down')}</button>`);
    parts.push('<span class="sp"></span>');
    parts.push(`<button class="fbtn" data-menu="cols" aria-haspopup="menu">${ic('cols')}Details shown${ic('down')}</button>`);
    return `<div class="filters" role="toolbar" aria-label="Filter and sort">${parts.join('')}</div>`;
  }
  function emptyState(scoped) {
    const g = P.group(ui.group);
    const art = (i) => `<div class="art">${ic(i)}</div>`;
    if (P.state === 'offline-empty') return `<div class="empty">${art('wifi')}<h3>No connection</h3><p>Tasks will appear once you are back online.</p></div>`;
    if (filtersOn() && scoped.length) {
      if (ui.idle && !ui.q && !ui.type && !ui.due) return `<div class="empty">${art('done')}<h3>Nothing has gone ${ui.idle} days without action</h3><p>Every open company task has had some action in the last ${ui.idle} days.</p><div class="acts"><button class="btn" data-clearall>Clear filter</button></div></div>`;
      return `<div class="empty">${art('search')}<h3>No tasks match</h3><p>${ui.q ? `Nothing ${ui.view === 'done' ? 'finished ' : 'open '}matches “${esc(ui.q)}”${ui.due || ui.type || ui.idle ? ' with these filters' : ''}.` : 'Nothing matches these filters.'} Try a different search or clear the filters.</p><div class="acts"><button class="btn" data-clearall>Clear filters</button></div></div>`;
    }
    if (ui.view === 'done') {
      if (ui.range !== 'all' && P.db.tasks.some((t) => t.done)) return `<div class="empty">${art('done')}<h3>Nothing finished in the ${ui.range === 'week' ? 'last 7 days' : 'last 30 days'}</h3><p>Finished tasks from earlier are still here.</p><div class="acts"><button class="btn" data-range="all">Show any time</button></div></div>`;
      return `<div class="empty">${art('done')}<h3>No finished tasks yet</h3><p>When you mark a task done it moves here, out of the open work.</p></div>`;
    }
    if (g) return `<div class="empty">${P.gi(g).replace('class="gi"', 'class="gi art"')}<h3>Nothing in ${esc(g.name)} yet</h3><p>Add a task here, or move an internal task into this group from its details.</p></div>`;
    if (!P.db.tasks.length) return `<div class="empty">${art('list')}<h3>Nothing on the list yet</h3><p>Add the first thing that needs doing. A sentence is enough, and dates and people can come later.</p></div>`;
    const name = { pro: 'prospect', cli: 'client', int: 'internal' }[ui.kind];
    const why = { pro: 'Tasks tied to a company whose deal isn\'t done yet show up here.', cli: 'Tasks tied to a company whose deal is done show up here.', int: 'Tasks that aren\'t about a company show up here.' }[ui.kind];
    return `<div class="empty">${art('done')}<h3>No open ${name} work</h3><p>${why}</p></div>`;
  }

  function render() {
    const scoped = P.loading ? [] : scope();
    const filtered = apply(scoped);
    const sorted = sortList(filtered);
    const shown = sorted.slice(0, ui.limit);
    const g = P.group(ui.group);
    let body;
    if (P.loading && P.state !== 'offline-empty') {
      body = `<div class="loading-note"><span class="spin"></span>Loading tasks</div>` + [1, 2, 3, 4, 5, 6].map(() => '<div class="skel-row" style="grid-template-columns:26px 1fr 120px 90px"><span class="skel c1"></span><div><span class="skel l1"></span><span class="skel l2"></span></div><span class="skel l1" style="width:100%"></span><span class="skel c4"></span></div>').join('');
    } else if (!sorted.length) {
      body = emptyState(scoped);
    } else {
      const total = (ui.group ? scoped : scoped.filter((t) => ui.kind === 'all' || P.kind(t) === ui.kind)).length;
      const noun = ui.view === 'done' ? 'finished task' : 'open task';
      const line = filtersOn()
        ? `<b>${num(sorted.length)}</b> of ${plural(total, noun)} match <button class="link" data-clearall style="margin-left:8px">Clear filters</button>`
        : (ui.view === 'done' ? `<b>${plural(sorted.length, 'task')}</b> finished ${{ week: 'in the last 7 days', month: 'in the last 30 days', all: 'in all' }[ui.range]}` : `<b>${plural(sorted.length, noun)}</b>`);
      body = `<p class="result-line" role="status">${line}</p>${headRow()}<div class="tlist">${shown.map(row).join('')}</div>
        ${sorted.length > shown.length ? `<div class="more-row">Showing ${num(shown.length)} of ${num(sorted.length)}<button class="btn sm" data-more>Show ${num(Math.min(100, sorted.length - shown.length))} more</button></div>` : ''}`;
    }
    const capture = ui.view === 'open' && !P.loading ? `<div class="capture"><span class="plus">${ic('plus')}</span><label class="sr" for="cap">New task</label><input id="cap" data-capture placeholder="${g ? `Add a task to ${esc(g.name)}` : 'Add a task, like “Call Pelita Foods about the trial”'}" autocomplete="off"><span class="hint when-typing">Enter to add</span></div>` : '';
    P.$('#main').innerHTML = `${header()}${P.offlineBanner()}${groupChips()}
      <label class="search glass m-search">${ic('search')}<span class="sr">Search tasks</span><input type="search" data-q value="${esc(ui.q)}" placeholder="${g ? 'Search this group' : 'Search tasks'}"></label>
      ${tbar(scoped)}
      <section class="panel glass" style="margin-top:14px" aria-label="${g ? esc(g.name) : 'Tasks'}">${P.loading ? '' : filters()}${capture}${body}</section>`;
    syncUrl();
  }

  /* ---------- Menus ---------- */
  function openMenu(key, btn) {
    if (key === 'due') return P.menu(btn, `<h4>Due</h4>${P.mi('', 'Any time', !ui.due)}${P.mi('overdue', 'Overdue', ui.due === 'overdue')}${P.mi('soon', 'In the next 3 days', ui.due === 'soon')}${P.mi('active', 'Under way today', ui.due === 'active')}${P.mi('nodate', 'No dates yet', ui.due === 'nodate')}`, (v) => { ui.due = v; ui.limit = 100; render(); });
    if (key === 'range') return P.menu(btn, `<h4>Finished</h4>${P.mi('week', 'In the last 7 days', ui.range === 'week')}${P.mi('month', 'In the last 30 days', ui.range === 'month')}${P.mi('all', 'Any time', ui.range === 'all')}`, (v) => { ui.range = v; ui.limit = 100; render(); });
    if (key === 'type') return P.menu(btn, `<h4>Task type</h4>${P.mi('', 'Any type', !ui.type)}${P.db.types.map((t) => P.mi(t, esc(t), ui.type === t)).join('')}${P.mi('-', 'No type', ui.type === '-')}`, (v) => { ui.type = v; ui.limit = 100; render(); });
    if (key === 'idle') {
      const opts = [0, 3, 7, 14, 30];
      return P.menu(btn, `<h4>Company tasks with no action for</h4>${opts.map((n) => P.mi(String(n), n ? `${n} days or more` : 'Any', ui.idle === n)).join('')}<hr><div class="num"><label for="idle-n">At least</label><input id="idle-n" type="number" min="1" max="999" value="${opts.includes(ui.idle) ? '' : ui.idle}" placeholder="21"><span>days</span><button class="btn sm" data-v="custom">Apply</button></div>`, (v, b, m) => {
        if (v === 'custom') { const n = +m.querySelector('#idle-n').value; if (!n) return true; ui.idle = n; } else ui.idle = +v;
        ui.limit = 100; render();
      }, { onReady: (m) => m.querySelector('#idle-n').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); m.querySelector('[data-v="custom"]').click(); } }) });
    }
    if (key === 'sort') {
      const k = sortKey(); const d = sortDir(); const keys = ui.view === 'done' ? ['doneAt', 'end', 'about', 'type', 'desc'] : ['end', 'last', 'about', 'type', 'desc', 'prio', 'start'];
      const dl = dirLabels(k);
      return P.menu(btn, `<h4>Sort by</h4>${keys.map((x) => P.mi('k:' + x, SORTS[x], k === x)).join('')}<hr>${P.mi('d:asc', dl[0], d === 'asc')}${P.mi('d:desc', dl[1], d === 'desc')}<p class="foot">Tasks without a value always go last.</p>`, (v) => {
        const [t, x] = v.split(':');
        if (t === 'k') { ui.sort = x; ui.dir = ''; } else { ui.sort = k; ui.dir = x; }
        render();
      });
    }
    if (key === 'cols') {
      return P.menu(btn, `<h4>Details shown</h4>${COLS.map((c) => P.mc(c.id, c.label, cols.includes(c.id))).join('')}<hr><button class="mi" data-v="reset">Reset to the default</button><p class="foot">Remembered on this device.</p>`, (v, b, m) => {
        if (v === 'reset') cols = DEFAULT_COLS.slice();
        else cols = cols.includes(v) ? cols.filter((x) => x !== v) : COLS.map((c) => c.id).filter((id) => id === v || cols.includes(id));
        P.lsSet('cols', cols); render();
        m.querySelectorAll('[role="menuitemcheckbox"]').forEach((x) => x.setAttribute('aria-checked', String(cols.includes(x.dataset.v))));
        return true;
      }, { alignRight: true });
    }
    if (key === 'gmenu') {
      const g = P.group(ui.group);
      return P.menu(btn, `<button class="mi" data-v="rename">${ic('edit')}<span>Rename group</span></button><button class="mi" data-v="star">${ic(g.important ? 'starline' : 'star')}<span>${g.important ? 'Unmark as important' : 'Mark as important'}</span></button><hr><button class="mi red" data-v="delete">${ic('trash')}<span>Delete group</span></button>`, (v) => {
        P.closeTop();
        if (v === 'rename') P.openGroup(g.id);
        if (v === 'star') P.toggleImportant(g.id);
        if (v === 'delete') P.deleteGroup(g.id);
        return true;
      }, { alignRight: true });
    }
  }

  /* ---------- Events ---------- */
  const main = () => P.$('#main');
  P.$('#app').addEventListener('click', (e) => {
    const t = e.target;
    const clr = t.closest('[data-clear]');
    if (clr) { e.stopPropagation(); const k = clr.dataset.clear; if (k === 'idle') ui.idle = 0; else ui[k] = ''; render(); return; }
    const mb = t.closest('[data-menu]'); if (mb) { openMenu(mb.dataset.menu, mb); return; }
    if (t.closest('[data-gmenu]')) { openMenu('gmenu', t.closest('[data-gmenu]')); return; }
    if (t.closest('[data-star]')) { P.toggleImportant(ui.group); return; }
    const done = t.closest('[data-done]');
    if (done) { e.stopPropagation(); const task = P.task(done.dataset.done); if (task.done) P.reopen(task.id); else P.markDone(task.id); return; }
    const k = t.closest('[data-kind]'); if (k) { ui.kind = k.dataset.kind; ui.limit = 100; if (ui.kind === 'int') ui.idle = 0; render(); return; }
    const v = t.closest('[data-view]'); if (v) { ui.view = v.dataset.view; ui.limit = 100; if (ui.sort === 'doneAt' || (ui.view === 'done' && ui.sort === 'last')) ui.sort = ''; render(); return; }
    const s = t.closest('[data-sort]'); if (s) { const key = s.dataset.sort; if (sortKey() === key) { ui.sort = key; ui.dir = sortDir() === 'asc' ? 'desc' : 'asc'; } else { ui.sort = key; ui.dir = ''; } render(); return; }
    if (t.closest('[data-clearall]')) { ui.q = ''; ui.due = ''; ui.type = ''; ui.idle = 0; render(); return; }
    const r = t.closest('[data-range]'); if (r) { ui.range = r.dataset.range; render(); return; }
    if (t.closest('[data-more]')) { ui.limit += 100; render(); return; }
    const row = t.closest('[data-open]');
    if (row && !t.closest('a')) P.openTask(row.dataset.open);
  });
  P.$('#app').addEventListener('keydown', (e) => {
    if (e.target.matches('[data-capture]') && e.key === 'Enter') {
      const val = e.target.value; if (!val.trim()) return;
      P.quickAdd(val, ui.group ? { group: ui.group } : {});
      const again = P.$('#cap'); if (again) again.focus();
    }
  });
  let qTimer;
  P.$('#app').addEventListener('input', (e) => {
    if (!e.target.matches('[data-q]')) return;
    ui.q = e.target.value; ui.limit = 100;
    clearTimeout(qTimer);
    const isMobile = e.target.closest('.m-search');
    qTimer = setTimeout(() => {
      render();
      const inp = P.$(isMobile ? '.m-search input' : '.bar .search input, .group-head .search input');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }, 180);
  });

  P.onGroupCreated = (g) => { ui.group = g.id; ui.view = 'open'; ui.q = ''; ui.due = ''; ui.type = ''; P.groupId = g.id; P.render(); P.toast(`Group “${g.name}” created`); };
  P.onGroupDeleted = (g) => { if (ui.group === g.id) { ui.group = null; ui.kind = 'int'; P.groupId = null; } P.render(); P.toast(`Group “${g.name}” deleted. Its tasks are now ungrouped.`); };

  P.boot({
    page: 'tasks', groupId: ui.group, render,
    states: [['', 'Normal'], ['no-clients', 'No client work'], ['empty', 'Nothing yet (no tasks)'], ['loading', 'Loading'], ['offline', 'No connection'], ['offline-empty', 'No connection, nothing loaded'], ['group-fail', 'Creating a group fails'], ['live', 'Live change from a colleague']],
    opens: [['task-new', 'New task (quick)'], ['task-new-full', 'New task (all details)'], ['task-required', 'Description missing'], ['task-edit', 'Edit a company task'], ['task-edit-int', 'Edit an internal task'], ['task-done', 'A finished task'], ['task-names', 'Name suggestions'], ['task-names-new', 'Adding a new name'], ['task-delete', 'Delete a task'], ['columns', 'Details shown'], ['sort', 'Sort menu'], ['idle', 'No action for'], ['group-new', 'New task group'], ['group-empty', 'Group name missing'], ['group-dup', 'Group name taken'], ['group-fail', 'Group couldn\'t be created'], ['group-rename', 'Rename a group'], ['group-delete', 'Delete a group'], ['more', 'Phone: More']],
    afterBoot() {
      if (q.get('focus') === 'search') { const i = P.$(innerWidth < 900 ? '.m-search input' : '.bar .search input'); if (i) i.focus(); }
      if (P.state === 'live') setTimeout(() => {
        P.liveIds = new Set();
        const t = P.db.tasks.find((x) => !x.done && x.co);
        if (t) { t.last = P.iso(0); P.liveIds.add(t.id); P.flash.add(t.id); }
        const n = { id: 'live1', desc: 'Book the venue for the client workshop', co: null, group: ui.group || null, type: 'Admin', touch: '', prio: 'medium', start: null, end: P.iso(5), last: null, key: '', resp: ['Maya Chen'], inf: [], done: false, doneAt: null };
        P.db.tasks.unshift(n); P.liveIds.add(n.id); P.flash.add(n.id);
        P.render();
      }, 1200);
    },
    onOpen(o) {
      const map = { columns: 'cols', sort: 'sort', idle: 'idle' };
      if (map[o]) { const b = P.$(`[data-menu="${map[o]}"]`); if (b) openMenu(map[o], b); }
    },
  });
})();
