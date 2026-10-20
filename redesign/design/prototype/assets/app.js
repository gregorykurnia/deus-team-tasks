/* Shared prototype script: data access, shell, task editor, dialogs, menus, toasts.
   Pages call P.boot({ page, render, states }) and re-render through P.render(). */
(function () {
  const P = window.P = {};
  const qs = new URLSearchParams(location.search);
  P.qs = qs;
  P.stress = qs.has('stress');
  P.state = qs.get('state') || '';
  P.openParam = qs.get('open') || '';
  P.TODAY = PROTO_DATA.TODAY;

  /* ---------- Icons ---------- */
  const ICONS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    list: '<path d="m4 7 2 2 3.5-3.5M4 15.5l2 2 3.5-3.5M13 7.5h7M13 16h7"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="4"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    building: '<path d="M4 20.5V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14.5M15 10h3a2 2 0 0 1 2 2v8.5M2.5 20.5h19M8 8h3M8 12h3M8 16h3"/>',
    note: '<path d="M6 3.5h8l4.5 4.5v12.5H6z"/><path d="M14 3.5V8h4.5M9 12.5h6M9 16h6"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="2"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"/>',
    flow: '<rect x="3" y="3.5" width="7" height="5" rx="2"/><rect x="14" y="15.5" width="7" height="5" rx="2"/><path d="M6.5 8.5v4a3 3 0 0 0 3 3h4.5"/>',
    more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    star: '<path fill="currentColor" stroke="none" d="m12 3.2 2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.5l-5.4 2.9 1.2-5.9-4.4-4.1 6-.7z"/>',
    starline: '<path d="m12 3.6 2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.3 6.9 19l1.1-5.6-4.2-3.9 5.7-.7z"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    team: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 5.5a3 3 0 0 1 0 6M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
    alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5M12 16h.01"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    sort: '<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5"/>',
    cols: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15M14.5 4.5v15"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="3"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 16a5 5 0 0 1 6.8 0M12 19.5h.01"/><path d="M3 3l18 18"/>',
    sync: '<path d="M20 11a8 8 0 0 0-14.3-4.5L4 8.5M4 13a8 8 0 0 0 14.3 4.5L20 15.5"/><path d="M4 4v4.5h4.5M20 20v-4.5h-4.5"/>',
    trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8l1-12M9.5 7V4.5h5V7"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
    people: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-3.7 3.4-5.5 7-5.5s6.3 1.8 7 5.5"/>',
    chat: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4z"/>',
    pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.5"/>',
    folder: '<path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4.5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    minus: '<path d="M6 12h12"/>',
    checks: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="m8 12 3 3 5-6"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    done: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  };
  P.ic = (name, cls) => `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const ic = P.ic;

  /* ---------- Small helpers ---------- */
  P.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esc = P.esc;
  P.$ = (sel, root) => (root || document).querySelector(sel);
  P.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  P.num = (n) => n.toLocaleString('en-GB');
  P.plural = (n, one, many) => `${P.num(n)} ${n === 1 ? one : (many || one + 's')}`;
  const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  P.word = (n) => (n <= 10 ? WORDS[n] : P.num(n));
  P.lsGet = (k, def) => { try { const v = localStorage.getItem('proto.' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } };
  P.lsSet = (k, v) => { try { localStorage.setItem('proto.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } };

  /* ---------- Dates ---------- */
  const DAY = 86400000;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  P.parse = (iso) => { if (!iso) return null; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  P.diff = (iso) => (iso ? Math.round((P.parse(iso) - P.TODAY) / DAY) : null);
  P.iso = PROTO_DATA.d;
  P.fmt = (iso, opts) => {
    if (!iso) return '';
    const x = P.parse(iso);
    const base = `${x.getDate()} ${MON[x.getMonth()]}`;
    return x.getFullYear() !== P.TODAY.getFullYear() || (opts && opts.year) ? `${base} ${x.getFullYear()}` : base;
  };
  P.fmtLong = (x) => `${WEEKDAY[x.getDay()]}, ${x.getDate()} ${MONTH[x.getMonth()]}`;
  P.wd = (iso) => { const x = P.parse(iso); return `${WD[x.getDay()]} ${x.getDate()}`; };
  P.ago = (iso) => {
    const n = -P.diff(iso);
    if (n === 0) return 'today';
    if (n === 1) return 'yesterday';
    if (n < 0) return P.fmt(iso);
    return `${P.num(n)} days ago`;
  };

  /* ---------- Data ---------- */
  P.db = P.stress ? PROTO_DATA.stress() : PROTO_DATA.normal();
  // Changes made while clicking through carry across pages in this tab (normal state only). ?reset starts over.
  const SAVE_KEY = 'proto.db.' + (P.stress ? 'stress' : 'normal');
  try {
    if (qs.has('reset')) sessionStorage.removeItem(SAVE_KEY);
    else if (!P.state && sessionStorage.getItem(SAVE_KEY)) P.db = JSON.parse(sessionStorage.getItem(SAVE_KEY));
  } catch (e) { /* storage unavailable */ }
  P.save = () => { if (P.state) return; try { sessionStorage.setItem(SAVE_KEY, JSON.stringify(P.db)); } catch (e) { /* full or unavailable */ } };
  if (P.state === 'empty' || P.state === 'offline-empty') { P.db.tasks = []; P.db.groups = []; }
  if (P.state === 'no-clients') P.db.tasks = P.db.tasks.filter((t) => { const c = t.co && P.db.companies.find((x) => x.id === t.co); return !(c && c.stage === 'done'); });
  if (P.state === 'quiet') P.db.tasks = P.db.tasks.filter((t) => t.done || (t.end && P.diff(t.end) > 3));
  P.loading = P.state === 'loading' || P.state === 'offline-empty';
  P.eventsState = { loading: 'loading', 'offline-empty': 'loading', 'events-loading': 'loading', 'events-off': 'off', 'events-fail': 'fail', offline: 'fail' }[P.state] || 'ok';
  P.offline = P.state === 'offline' || P.state === 'offline-empty';

  const coMap = () => { if (!P._co || P._coLen !== P.db.companies.length) { P._co = new Map(P.db.companies.map((c) => [c.id, c])); P._coLen = P.db.companies.length; } return P._co; };
  P.company = (id) => (id ? coMap().get(id) : null);
  P.group = (id) => P.db.groups.find((g) => g.id === id) || null;
  P.task = (id) => P.db.tasks.find((t) => t.id === id) || null;
  P.kind = (t) => { if (!t.co) return 'int'; const c = P.company(t.co); return c && c.stage === 'done' ? 'cli' : 'pro'; };
  P.KIND = { pro: 'Prospect work', cli: 'Client work', int: 'Internal' };
  P.KIND_PL = { pro: 'Prospects', cli: 'Clients', int: 'Internal' };
  P.GROUP_HUES = [['#e4edff', '#2f6bea'], ['#dcf5ec', '#0d8a6b'], ['#ffe6dc', '#b8501f'], ['#e8ecf3', '#5a6a85'], ['#f1e6ff', '#7a43c9'], ['#fff0d0', '#9a6400']];
  P.gi = (g, cls) => { const [bg, fg] = P.GROUP_HUES[g.hue % 6]; return `<span class="gi${cls ? ' ' + cls : ''}" style="background:${bg};color:${fg}" aria-hidden="true">${esc(g.short)}</span>`; };
  P.openTasks = () => P.db.tasks.filter((t) => !t.done || t.id === P.justDone);
  P.groupOpen = (gid) => P.db.tasks.filter((t) => !t.done && t.group === gid).length;
  P.sortedGroups = () => P.db.groups.slice().sort((a, b) => (b.important - a.important) || a.name.localeCompare(b.name));

  /* People: initials and a stable colour */
  P.initials = (name) => {
    const n = String(name).trim();
    if (/[　-鿿가-힯]/.test(n)) { const m = n.match(/[　-鿿가-힯]+/); return m[0].slice(0, 2); }
    const parts = n.split(/\s+/).filter((p) => /\p{L}/u.test(p));
    if (parts.length === 0) return '?';
    if (parts.length === 1) return Array.from(parts[0]).slice(0, 2).join('').toUpperCase();
    return (Array.from(parts[0])[0] + Array.from(parts[parts.length - 1])[0]).toUpperCase();
  };
  P.hue = (name) => { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h % 6; };
  P.av = (name, extra) => `<span class="av a${P.hue(name)}${extra ? ' ' + extra : ''}" title="${esc(name)}">${esc(P.initials(name))}</span>`;
  P.avStack = (t, max) => {
    max = max || 3;
    const all = t.resp.map((n) => ({ n, inf: false })).concat(t.inf.map((i) => ({ n: i.name, inf: true, note: i.note })));
    if (!all.length) return '<span class="avs"></span>';
    const shown = all.slice(0, max);
    const rest = all.length - shown.length;
    const label = `Responsible: ${t.resp.join(', ') || 'nobody'}${t.inf.length ? '. Informed: ' + t.inf.map((i) => i.name + (i.note ? ' (' + i.note + ')' : '')).join(', ') : ''}`;
    return `<span class="avs" role="img" aria-label="${esc(label)}" title="${esc(label)}">${shown.map((p) => P.av(p.n, p.inf ? 'inf' : '')).join('')}${rest > 0 ? `<span class="av more">+${rest}</span>` : ''}</span>`;
  };
  P.allNames = () => {
    const s = new Set(P.db.people);
    P.db.tasks.forEach((t) => { t.resp.forEach((n) => s.add(n)); t.inf.forEach((i) => s.add(i.name)); });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  };

  /* ---------- Urgency ---------- */
  P.deadline = (t) => {
    if (t.done) return { label: 'Done ' + P.ago(t.doneAt || P.iso(0)), tone: 'done' };
    if (!t.end) return { label: t.start ? 'No deadline' : 'No dates', tone: 'none' };
    const n = P.diff(t.end);
    if (n < 0) return { label: `${P.plural(-n, 'day')} late`, tone: 'red', icon: 'alert' };
    if (n === 0) return { label: 'Today', tone: 'amber' };
    if (n === 1) return { label: 'Tomorrow', tone: 'amber' };
    if (n <= 3) return { label: `In ${n} days`, tone: 'amber' };
    if (n <= 30) return { label: `In ${n} days`, tone: 'calm' };
    return { label: P.fmt(t.end), tone: 'calm' };
  };
  P.pill = (t) => {
    const x = P.deadline(t);
    const title = t.done ? `Finished ${P.fmt(t.doneAt)}` : (t.end ? `Deadline ${P.wd(t.end)} ${MON[P.parse(t.end).getMonth()]}` : 'No deadline set');
    return `<span class="pill p-${x.tone}" title="${esc(title)}">${x.icon ? ic(x.icon) : ''}${esc(x.label)}</span>`;
  };
  P.idleDays = (t) => (t.last ? -P.diff(t.last) : null);
  P.lastAction = (t) => {
    if (!t.co || !t.last) return null;
    const n = P.idleDays(t);
    if (n >= 14) return { label: `No action for ${P.num(n)} days`, short: `${P.num(n)} days ago`, tone: 'red' };
    if (n >= 7) return { label: `Last action ${P.num(n)} days ago`, short: `${P.num(n)} days ago`, tone: 'amber' };
    return { label: `Last action ${P.ago(t.last)}`, short: n === 0 ? 'Today' : (n === 1 ? 'Yesterday' : `${n} days ago`), tone: '' };
  };
  P.bucket = (t) => {
    if (!t.end) return 'nodate';
    const n = P.diff(t.end);
    if (n < 0) return 'overdue';
    if (n <= 3) return 'soon';
    if (t.start && P.diff(t.start) <= 0) return 'active';
    return 'later';
  };

  /* ---------- Shell ---------- */
  const NAV = [
    { id: 'today', label: 'Today', icon: 'sun', href: 'index.html' },
    { id: 'tasks', label: 'All tasks', icon: 'list', href: 'tasks.html' },
    { id: 'plan', label: 'Plan', icon: 'cal', href: 'plan.html' },
    { id: 'companies', label: 'Companies', icon: 'building', href: 'soon.html?area=companies' },
    { id: 'notes', label: 'Qualification notes', icon: 'note', href: 'soon.html?area=notes' },
    { id: 'past', label: 'Past clients', icon: 'archive', href: 'soon.html?area=past' },
    { id: 'flows', label: 'Flows', icon: 'flow', href: 'soon.html?area=flows' },
  ];
  P.NAV = NAV;
  P.keep = (href) => {
    // Carry the stress switch across pages so a whole walk-through uses one data set.
    if (!P.stress) return href;
    return href + (href.includes('?') ? '&' : '?') + 'stress';
  };
  P.todayCount = () => P.db.tasks.filter((t) => !t.done && ['overdue', 'soon'].includes(P.bucket(t))).length;

  function sideHTML() {
    const counts = { today: P.loading ? '' : P.todayCount(), tasks: P.loading ? '' : P.db.tasks.filter((t) => !t.done).length };
    const nav = NAV.map((n) => `<a href="${P.keep(n.href)}"${P.page === n.id && !P.groupId ? ' aria-current="page"' : ''}>${ic(n.icon)}${n.label}${counts[n.id] !== undefined && counts[n.id] !== '' ? `<span class="n">${P.num(counts[n.id])}</span>` : ''}</a>`).join('');
    const groups = P.loading ? [1, 2, 3].map(() => '<span class="skel" style="height:22px;margin:8px 12px"></span>').join('')
      : P.sortedGroups().map((g) => `<a href="${P.keep('tasks.html?group=' + g.id)}"${P.groupId === g.id ? ' aria-current="page"' : ''}>${P.gi(g)}<span class="nm">${esc(g.name)}</span>${g.important ? `<span class="sr">, important</span>${ic('star', 'star')}` : ''}<span class="n">${P.num(P.groupOpen(g.id))}</span></a>`).join('')
      || '<p style="margin:0;padding:4px 12px;color:var(--muted);font-size:13px;font-weight:500">Group internal work by topic, like “Hiring”.</p>';
    return `<div class="brand"><span class="logo" role="img" aria-label="Company logo"></span>Team desk</div>
      <nav class="nav" aria-label="Areas">${nav}</nav>
      <div class="side-groups"><h2 class="side-h">Task groups<button class="add" data-act="group-new" aria-label="New task group" title="New task group">${ic('plus')}</button></h2><div class="groups">${groups}</div></div>
      ${liveHTML()}`;
  }
  function liveHTML() {
    return P.offline
      ? `<div class="side-foot" role="status"><span class="dot off"></span>Offline. Changes can't be saved.</div>`
      : `<div class="side-foot" role="status"><span class="dot"></span>Live, everyone's up to date</div>`;
  }
  function tabbarHTML() {
    const cur = (id) => (P.page === id ? ' aria-current="page"' : '');
    return `<a href="${P.keep('index.html')}"${cur('today')}>${ic('sun')}Today</a>
      <a href="${P.keep('tasks.html')}"${cur('tasks')}>${ic('list')}Tasks</a>
      <button class="mid" data-act="task-new" aria-label="New task">${ic('plus')}</button>
      <a href="${P.keep('soon.html?area=companies')}"${cur('companies')}>${ic('building')}Companies</a>
      <button class="tb" data-act="more"${['plan', 'notes', 'past', 'flows'].includes(P.page) ? ' aria-current="page"' : ''}>${ic('more')}More</button>`;
  }
  P.offlineBanner = () => (P.offline ? `<div class="banner" role="status">${ic('wifi')}<div><b>No connection.</b> ${P.state === 'offline-empty' ? 'Nothing has loaded yet. Everything will appear once you are back online.' : 'You are seeing what was loaded at 09:12. Changes can\'t be saved until you are back online.'}</div></div>` : '');

  /* ---------- Overlays ---------- */
  const layers = [];
  P.closeTop = () => { const l = layers.pop(); if (!l) return; l.els.forEach((e) => e.remove()); if (l.onClose) l.onClose(); if (!layers.length) document.body.classList.remove('locked'); if (l.restore && document.contains(l.restore)) l.restore.focus(); };
  P.closeAll = () => { while (layers.length) P.closeTop(); };
  P.layer = (els, opts) => {
    opts = opts || {};
    els.forEach((e) => document.body.appendChild(e));
    layers.push({ els, onClose: opts.onClose, restore: document.activeElement, kind: opts.kind });
    if (opts.lock !== false) document.body.classList.add('locked');
  };
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  P.el = el;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && layers.length) { e.preventDefault(); e.stopImmediatePropagation(); P.closeTop(); }
  });

  /* Popover menu anchored to a button */
  P.menu = (anchor, html, onPick, opts) => {
    opts = opts || {};
    if (layers.length && layers[layers.length - 1].kind === 'menu') P.closeTop();
    const m = el(`<div class="menu" role="menu">${html}</div>`);
    const catcher = el('<div style="position:fixed;inset:0;z-index:39"></div>');
    catcher.addEventListener('click', () => P.closeTop());
    P.layer([catcher, m], { lock: false, kind: 'menu' });
    const r = anchor.getBoundingClientRect();
    const w = m.offsetWidth, h = m.offsetHeight;
    let left = opts.alignRight ? r.right - w : r.left;
    left = Math.max(12, Math.min(left, innerWidth - w - 12));
    let top = r.bottom + 8;
    if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 8);
    m.style.left = left + 'px'; m.style.top = top + 'px';
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b || b.disabled) return;
      const keep = onPick(b.dataset.v, b, m);
      if (keep !== true) P.closeTop();
    });
    const first = m.querySelector('[aria-checked="true"], .mi, input');
    if (first) first.focus();
    if (opts.onReady) opts.onReady(m);
    return m;
  };
  P.mi = (v, label, checked, extra) => `<button class="mi" role="menuitemradio" data-v="${esc(v)}" aria-checked="${checked ? 'true' : 'false'}"${extra || ''}><span>${label}</span>${ic('check', 'tick')}</button>`;
  P.mc = (v, label, checked) => `<button class="mi" role="menuitemcheckbox" data-v="${esc(v)}" aria-checked="${checked ? 'true' : 'false'}"><span class="box">${ic('check')}</span><span>${label}</span></button>`;

  /* Toasts */
  P.toast = (msg, opts) => {
    opts = opts || {};
    let host = P.$('.toasts');
    if (!host) { host = el('<div class="toasts" role="status" aria-live="polite"></div>'); document.body.appendChild(host); }
    const t = el(`<div class="toast${opts.err ? ' err' : ''}${opts.action ? '' : ' solo'}">${ic(opts.err ? 'alert' : 'done')}<span class="msg">${esc(msg)}</span>${opts.action ? `<button>${esc(opts.action)}</button>` : ''}</div>`);
    if (opts.action) t.querySelector('button').addEventListener('click', () => { opts.onAction(); t.remove(); });
    host.appendChild(t);
    setTimeout(() => t.remove(), opts.keep ? 600000 : 5200);
  };

  /* Confirmation dialog */
  P.confirm = (o) => {
    const scrim = el('<div class="scrim top"></div>');
    const d = el(`<div class="dialog over-sheet" role="alertdialog" aria-modal="true" aria-labelledby="cf-h" aria-describedby="cf-p">
      <h2 id="cf-h">${esc(o.title)}</h2>
      ${o.quote ? `<p class="quote">${esc(o.quote)}</p>` : ''}
      <p id="cf-p">${o.body}</p>
      <div class="acts"><button class="btn" data-x>Cancel</button><button class="cta danger" data-ok>${esc(o.ok)}</button></div></div>`);
    scrim.addEventListener('click', () => P.closeTop());
    d.querySelector('[data-x]').addEventListener('click', () => P.closeTop());
    d.querySelector('[data-ok]').addEventListener('click', () => { P.closeTop(); o.onOk(); });
    P.layer([scrim, d]);
    d.querySelector('[data-x]').focus();
  };

  /* ---------- Mutations ---------- */
  P.justDone = null;
  P.flash = new Set();
  P.markDone = (id) => {
    const t = P.task(id); if (!t) return;
    if (P.offline) { P.toast('No connection. The task wasn\'t updated.', { err: true }); return; }
    t.done = true; t.doneAt = P.iso(0); P.justDone = id;
    P.render();
    P.toast('Marked done', { action: 'Undo', onAction: () => { t.done = false; t.doneAt = null; P.justDone = null; P.flash.add(id); P.render(); } });
    setTimeout(() => { if (P.justDone === id) { P.justDone = null; P.render(); } }, 900);
  };
  P.reopen = (id) => { const t = P.task(id); t.done = false; t.doneAt = null; P.flash.add(id); P.render(); P.toast('Moved back to open tasks'); };
  P.deleteTask = (id) => {
    const t = P.task(id);
    P.confirm({ title: 'Delete this task?', quote: t.desc, body: 'It will be removed for everyone on the team.', ok: 'Delete task', onOk: () => {
      P.closeAll();
      P.db.tasks = P.db.tasks.filter((x) => x !== t);
      P.render(); P.toast('Task deleted');
    } });
  };
  P.quickAdd = (text, extra) => {
    const desc = text.trim(); if (!desc) return null;
    if (P.offline) { P.toast('No connection. The task wasn\'t added.', { err: true }); return null; }
    const t = Object.assign({ id: 'n' + Date.now(), desc, co: null, group: null, type: '', touch: '', prio: '', start: null, end: null, last: null, key: '', resp: [], inf: [], done: false, doneAt: null }, extra || {});
    P.db.tasks.unshift(t); P.flash.add(t.id); P.render();
    P.toast('Task added', { action: 'Add details', onAction: () => P.openTask(t.id) });
    return t;
  };

  /* ---------- Task editor (drawer on large screens, bottom sheet on phones) ---------- */
  P.openTask = (id, opts) => {
    opts = opts || {};
    const src = id ? P.task(id) : null;
    const draft = src ? JSON.parse(JSON.stringify(src)) : { desc: '', co: null, group: opts.group || null, type: '', touch: '', prio: '', start: null, end: null, last: null, key: '', resp: [], inf: [], done: false };
    if (!src && opts.co) draft.co = opts.co;
    const ui = { full: !!src || !!opts.full, about: draft.co ? 'co' : 'int', err: opts.err || null, coSearch: false };
    const scrim = el('<div class="scrim"></div>');
    const sh = el(`<section class="sheet${ui.full ? '' : ' short'}" role="dialog" aria-modal="true" aria-labelledby="ts-h"></section>`);
    scrim.addEventListener('click', () => P.closeTop());
    P.layer([scrim, sh]);

    const kindOf = () => (ui.about === 'int' ? 'int' : (draft.co ? P.kind({ co: draft.co }) : 'pro'));
    const dateField = (key, label, help) => `<div class="field"><label for="f-${key}">${label} <span class="opt">optional</span></label><div class="date-in"><input class="input" id="f-${key}" type="date" data-k="${key}" value="${draft[key] || ''}">${draft[key] ? `<button class="clr" data-clear="${key}" aria-label="Clear ${label.toLowerCase()}">${ic('x')}</button>` : ''}</div>${help ? `<p class="help">${help}</p>` : ''}</div>`;
    const personChip = (n, i) => `<span class="person">${P.av(n)}<span class="nm">${esc(n)}</span><button class="rm" data-rm-resp="${i}" aria-label="Remove ${esc(n)}">${ic('x')}</button></span>`;

    function body() {
      const k = kindOf();
      const co = P.company(draft.co);
      const errDesc = ui.err === 'desc';
      const groupsOpts = P.sortedGroups().map((g) => `<option value="${g.id}"${draft.group === g.id ? ' selected' : ''}>${esc(g.name)}${g.important ? ' ★' : ''}</option>`).join('');
      const about = ui.about === 'co'
        ? (co ? `<div class="co-pick"><span class="mono k-${k}" style="background:var(--${k}-soft);color:var(--${k})">${esc(co.short)}</span><div style="min-width:0"><div class="nm">${esc(co.name)}</div><small>${k === 'cli' ? 'Client, deal done' : 'Prospect'}</small></div><span class="sp"></span>${src ? `<a class="link" href="${P.keep('soon.html?area=companies&co=' + co.id)}">Open company</a>` : `<button class="btn sm quiet" data-act="co-change">Change</button>`}</div>`
          : `<div class="field" style="margin-top:0"><select class="select" id="f-co" data-k="co" aria-label="Company"><option value="">Choose a company</option>${P.db.companies.slice(0, 300).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>`)
        : `<select class="select" id="f-group" data-k="group" aria-label="Task group"><option value="">No group</option>${groupsOpts}</select>`;
      const more = ui.full ? `
        <div class="row2">
          <div class="field"><label for="f-type">Task type <span class="opt">optional</span></label><select class="select" id="f-type" data-k="type"><option value="">None</option>${P.db.types.map((t) => `<option${draft.type === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
          <div class="field"><span class="lbl" id="l-prio">Priority <span class="opt">optional</span></span><div class="seg full" role="group" aria-labelledby="l-prio">${['high', 'medium', 'low'].map((p) => `<button aria-pressed="${draft.prio === p}" data-prio="${p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div></div>
        </div>
        <div class="field"><span class="lbl" id="l-touch">Touch point <span class="opt">optional</span></span><div class="chips" role="group" aria-labelledby="l-touch">${P.db.touch.map((t) => `<button class="chip" aria-pressed="${draft.touch === t}" data-touch="${esc(t)}">${ic({ Call: 'phone', Email: 'mail', Meeting: 'people', Message: 'chat', Visit: 'pin' }[t] || 'chat')}${esc(t)}</button>`).join('')}</div></div>
        <div class="row3">${dateField('start', 'Start')}${dateField('end', 'Deadline')}${dateField('last', 'Last action')}</div>
        ${co ? `<div class="sync-note">${ic('sync')}<span>The deadline and last action stay in step with ${esc(co.name)}. Changing them here updates the company too.</span></div>` : ''}
        <div class="field"><span class="lbl" id="l-resp">Responsible <span class="opt">one or more</span></span>
          <div class="people" data-picker="resp">${draft.resp.map(personChip).join('')}<input class="add-in" id="f-resp" aria-labelledby="l-resp" placeholder="${draft.resp.length ? 'Add someone else' : 'Type a name'}" autocomplete="off"></div></div>
        <div class="field"><span class="lbl" id="l-inf">Informed <span class="opt">optional, with a note on their part</span></span>
          <div class="informed">${draft.inf.map((p, i) => `<div class="inf-row"><span class="who-n">${P.av(p.name)}<span>${esc(p.name)}</span></span><input class="note-in" data-inf-note="${i}" value="${esc(p.note)}" placeholder="Their part, like “backup”" aria-label="Note for ${esc(p.name)}"><button class="rm" data-rm-inf="${i}" aria-label="Remove ${esc(p.name)}">${ic('x')}</button></div>`).join('')}
            <div class="inf-add" data-picker="inf">${ic('plus')}<input class="add-in" id="f-inf" aria-labelledby="l-inf" placeholder="Add someone to keep informed" autocomplete="off"></div></div></div>
        <div class="field"><label for="f-key">Key points <span class="opt">optional</span></label><textarea class="textarea" id="f-key" data-k="key" rows="4" placeholder="What someone picking this up should know">${esc(draft.key)}</textarea></div>
        ${src ? `<p class="edit-meta">${src.done ? 'Finished ' + P.ago(src.doneAt) + '.' : ''}</p>` : ''}`
        : `<button class="more-details" data-act="full">${ic('plus')}<span>Add details</span><span class="sp"></span><small>Dates, people, type, priority</small></button>`;
      return `
        <div class="field" style="margin-top:4px${errDesc ? '' : ''}" ${errDesc ? 'data-err' : ''}>
          <label class="sr" for="f-desc">Description</label>
          <div class="${errDesc ? 'field has-err' : ''}" style="margin:0"><textarea class="textarea big" id="f-desc" data-k="desc" rows="2" placeholder="What needs doing?" ${errDesc ? 'aria-invalid="true" aria-describedby="e-desc"' : ''}>${esc(draft.desc)}</textarea></div>
          ${errDesc ? `<p class="err-msg" id="e-desc">${ic('alert')}Add a short description so the team knows what this is.</p>` : ''}
        </div>
        <div class="field"><span class="lbl" id="l-about">About</span>
          <div class="seg full lg" role="group" aria-labelledby="l-about"><button aria-pressed="${ui.about === 'co'}" data-about="co">${ic('building')}A company</button><button aria-pressed="${ui.about === 'int'}" data-about="int">${ic('team')}Internal work</button></div>
          <div class="about-box">${about}</div>
        </div>
        ${more}`;
    }
    function head() {
      const k = kindOf();
      return `<span class="grab" aria-hidden="true"></span><div class="sheet-head"><h2 id="ts-h">${src ? (src.done ? 'Finished task' : 'Task') : 'New task'}</h2><span class="tag ${k}">${P.KIND[k]}</span><span class="sp"></span><button class="icon-btn" data-act="close" aria-label="Close">${ic('x')}</button></div>`;
    }
    function foot() {
      if (!src) return `<div class="sheet-foot"><span class="sp"></span><button class="btn" data-act="close">Cancel</button><button class="cta" data-act="save">Add task</button></div>`;
      return `<div class="sheet-foot"><button class="btn quiet red" data-act="delete">${ic('trash')}Delete</button><span class="sp"></span>${src.done ? `<button class="btn" data-act="reopen">${ic('undo')}Mark not done</button>` : `<button class="btn" data-act="done">${ic('check')}Mark done</button>`}<button class="cta" data-act="save">Save changes</button></div>`;
    }
    function paint(focusSel) {
      const scroll = sh.querySelector('.sheet-body') ? sh.querySelector('.sheet-body').scrollTop : 0;
      sh.className = 'sheet' + (ui.full ? '' : ' short');
      sh.innerHTML = head() + `<div class="sheet-body">${body()}</div>` + foot();
      sh.querySelector('.sheet-body').scrollTop = scroll;
      const f = focusSel ? sh.querySelector(focusSel) : null;
      if (f) { f.focus(); if (f.setSelectionRange && f.value) f.setSelectionRange(f.value.length, f.value.length); }
    }
    paint();
    if (!src || ui.err) sh.querySelector('#f-desc').focus();
    else sh.querySelector('[data-act="close"]').focus();

    // Name picker with suggestions (W4)
    let sugg = null;
    function closeSuggest() { if (sugg) { sugg.remove(); sugg = null; } }
    function showSuggest(input) {
      closeSuggest();
      const which = input.closest('[data-picker]').dataset.picker;
      const q = input.value.trim().toLowerCase();
      const taken = new Set(which === 'resp' ? draft.resp : draft.inf.map((i) => i.name));
      const names = P.allNames().filter((n) => !taken.has(n) && (!q || n.toLowerCase().includes(q)));
      const counts = {}; P.db.tasks.forEach((t) => { if (!t.done) t.resp.forEach((n) => { counts[n] = (counts[n] || 0) + 1; }); });
      const exact = P.allNames().some((n) => n.toLowerCase() === q);
      let html = names.slice(0, 7).map((n, i) => `<button type="button" data-pick="${esc(n)}" class="${i === 0 ? 'hl' : ''}">${P.av(n)}<span>${esc(n)}</span><small>${counts[n] ? P.plural(counts[n], 'open task') : ''}</small></button>`).join('');
      if (names.length) html = `<h4>Names already in use</h4>` + html;
      if (q && !exact) html += `<button type="button" class="new${names.length ? '' : ' hl'}" data-pick="${esc(input.value.trim())}" data-new><span class="plus">${ic('plus')}</span><span>Add “${esc(input.value.trim())}” as a new name</span></button>`;
      if (!html) return;
      sugg = el(`<div class="suggest" role="listbox">${html}</div>`);
      input.closest('[data-picker]').appendChild(sugg);
      sugg.addEventListener('mousedown', (e) => e.preventDefault());
      sugg.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) pickName(which, b.dataset.pick); });
    }
    function pickName(which, name) {
      name = name.trim(); if (!name) return;
      if (which === 'resp') { if (!draft.resp.includes(name)) draft.resp.push(name); }
      else if (!draft.inf.some((i) => i.name === name)) draft.inf.push({ name, note: '' });
      closeSuggest();
      paint(which === 'resp' ? '#f-resp' : `[data-inf-note="${draft.inf.length - 1}"]`);
    }
    P._showSuggest = (sel, text) => { const i = sh.querySelector(sel); i.value = text; i.focus(); showSuggest(i); };

    sh.addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (k) { draft[k] = e.target.value || (k === 'desc' || k === 'key' || k === 'type' ? '' : null); if (k === 'desc' && ui.err === 'desc' && draft.desc.trim()) { ui.err = null; paint('#f-desc'); } }
      if (e.target.dataset.infNote !== undefined) draft.inf[+e.target.dataset.infNote].note = e.target.value;
      if (e.target.classList.contains('add-in')) showSuggest(e.target);
    });
    sh.addEventListener('change', (e) => {
      const k = e.target.dataset.k;
      if (k === 'co' || k === 'start' || k === 'end' || k === 'last') { draft[k] = e.target.value || null; paint(); }
      if (k === 'group' || k === 'type') draft[k] = e.target.value || (k === 'type' ? '' : null);
    });
    sh.addEventListener('focusin', (e) => { if (e.target.classList.contains('add-in')) showSuggest(e.target); });
    sh.addEventListener('focusout', (e) => { if (e.target.classList.contains('add-in')) setTimeout(() => { if (!sh.contains(document.activeElement) || !document.activeElement.classList.contains('add-in')) closeSuggest(); }, 0); });
    sh.addEventListener('keydown', (e) => {
      if (e.target.classList.contains('add-in')) {
        const items = sugg ? Array.from(sugg.querySelectorAll('[data-pick]')) : [];
        const cur = items.findIndex((b) => b.classList.contains('hl'));
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; items.forEach((b) => b.classList.remove('hl')); items[(cur + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].classList.add('hl'); }
        if (e.key === 'Enter') { e.preventDefault(); const h = items[cur]; pickName(e.target.closest('[data-picker]').dataset.picker, h ? h.dataset.pick : e.target.value); }
        if (e.key === 'Backspace' && !e.target.value && e.target.id === 'f-resp' && draft.resp.length) { draft.resp.pop(); paint('#f-resp'); }
        if (e.key === 'Escape' && sugg) { e.stopPropagation(); closeSuggest(); }
      }
      if (e.target.id === 'f-desc' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
    });
    sh.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.about) { ui.about = b.dataset.about; if (ui.about === 'int') draft.co = null; else draft.group = null; paint(); return; }
      if (b.dataset.prio) { draft.prio = draft.prio === b.dataset.prio ? '' : b.dataset.prio; paint(); return; }
      if (b.dataset.touch) { draft.touch = draft.touch === b.dataset.touch ? '' : b.dataset.touch; paint(); return; }
      if (b.dataset.clear) { draft[b.dataset.clear] = null; paint(); return; }
      if (b.dataset.rmResp !== undefined) { draft.resp.splice(+b.dataset.rmResp, 1); paint('#f-resp'); return; }
      if (b.dataset.rmInf !== undefined) { draft.inf.splice(+b.dataset.rmInf, 1); paint('#f-inf'); return; }
      const act = b.dataset.act;
      if (act === 'close') P.closeTop();
      if (act === 'full') { ui.full = true; paint('#f-type'); }
      if (act === 'co-change') { draft.co = null; paint(); }
      if (act === 'save') save();
      if (act === 'delete') P.deleteTask(src.id);
      if (act === 'done') { P.closeTop(); P.markDone(src.id); }
      if (act === 'reopen') { P.closeTop(); P.reopen(src.id); }
    });
    function save() {
      draft.desc = draft.desc.trim();
      if (!draft.desc) { ui.err = 'desc'; paint('#f-desc'); return; }
      if (P.offline) { P.toast('No connection. Your changes weren\'t saved.', { err: true }); return; }
      if (ui.about === 'int') draft.co = null; else draft.group = null;
      if (src) { Object.assign(src, draft); P.flash.add(src.id); P.closeTop(); P.render(); P.toast('Changes saved'); }
      else { P.closeTop(); const t = Object.assign({ id: 'n' + Date.now() }, draft); P.db.tasks.unshift(t); P.flash.add(t.id); P.render(); P.toast('Task added'); }
    }
    return sh;
  };

  /* ---------- Task group dialog (create, rename) and delete ---------- */
  P.openGroup = (id, opts) => {
    opts = opts || {};
    const g = id ? P.group(id) : null;
    const st = { name: opts.name != null ? opts.name : (g ? g.name : ''), important: g ? g.important : false, err: opts.err || null, fail: !!opts.fail };
    const scrim = el('<div class="scrim top"></div>');
    const d = el('<div class="dialog over-sheet" role="dialog" aria-modal="true" aria-labelledby="gd-h"></div>');
    scrim.addEventListener('click', () => P.closeTop());
    P.layer([scrim, d]);
    function paint() {
      const errText = st.err === 'empty' ? 'Give the group a name.' : (st.err === 'dup' ? `There's already a group called “${esc(st.name.trim())}”. Pick another name.` : '');
      d.innerHTML = `<h2 id="gd-h">${g ? 'Rename task group' : 'New task group'}</h2>
        <p>${g ? 'Its tasks stay where they are.' : 'Keep related internal work together, like “Hiring” or “Office move”.'}</p>
        ${st.fail ? `<div class="notice err" style="margin:16px 0 0">${ic('alert')}<div><p><b>Couldn't ${g ? 'rename' : 'create'} the group.</b></p><p>Check your connection and try again. Nothing was lost.</p></div></div>` : ''}
        <div class="field${st.err ? ' has-err' : ''}"><label for="g-name">Name</label><input class="input" id="g-name" value="${esc(st.name)}" placeholder="Group name" autocomplete="off" ${st.err ? 'aria-invalid="true" aria-describedby="g-err"' : ''}>${errText ? `<p class="err-msg" id="g-err">${ic('alert')}${errText}</p>` : ''}</div>
        ${g ? '' : `<div class="field"><button class="chip" aria-pressed="${st.important}" data-imp>${ic(st.important ? 'star' : 'starline')}Mark as important</button><p class="help">Important groups sit at the top of the list.</p></div>`}
        <div class="acts"><button class="btn" data-x>Cancel</button><button class="cta" data-ok>${st.fail ? 'Try again' : (g ? 'Save' : 'Create group')}</button></div>`;
      const inp = d.querySelector('#g-name'); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
    }
    paint();
    d.addEventListener('input', (e) => { if (e.target.id === 'g-name') st.name = e.target.value; });
    d.addEventListener('keydown', (e) => { if (e.target.id === 'g-name' && e.key === 'Enter') { e.preventDefault(); submit(); } });
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) P.closeTop();
      if (e.target.closest('[data-imp]')) { st.important = !st.important; paint(); }
      if (e.target.closest('[data-ok]')) submit();
    });
    function submit() {
      const name = st.name.trim();
      if (!name) { st.err = 'empty'; st.fail = false; paint(); return; }
      const norm = (s) => s.trim().toLowerCase();
      if (P.db.groups.some((x) => x !== g && norm(x.name) === norm(name))) { st.err = 'dup'; st.fail = false; paint(); return; }
      if (P.offline || P.state === 'group-fail') { st.err = null; st.fail = true; paint(); return; }
      if (g) { g.name = name; P.closeTop(); P.render(); P.toast('Group renamed'); return; }
      const ng = { id: 'g' + Date.now(), name, short: P.initials(name).slice(0, 2), hue: P.db.groups.length % 6, important: st.important };
      P.db.groups.push(ng); P.closeTop(); P.save();
      if (P.onGroupCreated) P.onGroupCreated(ng); else location.href = P.keep('tasks.html?group=' + ng.id);
    }
  };
  P.deleteGroup = (id) => {
    const g = P.group(id); const n = P.groupOpen(id) + P.db.tasks.filter((t) => t.done && t.group === id).length;
    P.confirm({ title: `Delete “${g.name}”?`, body: n ? `Its ${P.plural(n, 'task')} stay and become ungrouped. You'll find them under Internal.` : 'The group is empty, so no tasks are affected.', ok: 'Delete group', onOk: () => {
      if (P.offline) { P.toast('No connection. The group wasn\'t deleted.', { err: true }); return; }
      P.db.tasks.forEach((t) => { if (t.group === id) t.group = null; });
      P.db.groups = P.db.groups.filter((x) => x !== g);
      P.save();
      if (P.onGroupDeleted) P.onGroupDeleted(g); else { P.render(); P.toast(`Group “${g.name}” deleted. Its tasks are now ungrouped.`); }
    } });
  };
  P.toggleImportant = (id) => { const g = P.group(id); g.important = !g.important; P.render(); P.toast(g.important ? 'Marked as important' : 'No longer marked as important'); };

  /* Phone "More" sheet */
  P.openMore = () => {
    const scrim = el('<div class="scrim"></div>');
    const sh = el(`<section class="sheet short" role="dialog" aria-modal="true" aria-labelledby="mo-h"><span class="grab" aria-hidden="true"></span>
      <div class="sheet-head"><h2 id="mo-h">More</h2><span class="sp"></span><button class="icon-btn" data-x aria-label="Close">${ic('x')}</button></div>
      <div class="sheet-body"><div class="more-list">${NAV.filter((n) => ['plan', 'notes', 'past', 'flows'].includes(n.id)).map((n) => `<a href="${P.keep(n.href)}">${ic(n.icon)}<span>${n.label}<small>${{ plan: 'Deadlines, events and who carries what', notes: 'Qualify prospects', past: 'Every company we have served', flows: 'How work moves between people' }[n.id]}</small></span></a>`).join('')}</div>
      <div style="margin-top:16px">${liveHTML()}</div></div></section>`);
    scrim.addEventListener('click', () => P.closeTop());
    sh.querySelector('[data-x]').addEventListener('click', () => P.closeTop());
    P.layer([scrim, sh]);
    sh.querySelector('a').focus();
  };

  /* ---------- Prototype controls (not part of the design) ---------- */
  function protoHTML() {
    const link = (params, label) => {
      const u = new URL(location.href);
      u.search = '';
      Object.entries(params).forEach(([k, v]) => { if (v !== null && v !== undefined) u.searchParams.set(k, v); });
      ['group', 'kind', 'view', 'area'].forEach((k) => { if (P.qs.has(k) && !(k in params)) u.searchParams.set(k, P.qs.get(k)); });
      const s = u.toString().replace(/=(&|$)/g, '$1');
      const on = Object.entries(params).every(([k, v]) => (v === null ? !P.qs.has(k) : P.qs.get(k) === v || (v === '' && P.qs.has(k))));
      return `<a href="${s}" class="${on ? 'on' : ''}">${label}</a>`;
    };
    const stress = P.stress ? '' : null;
    const states = (P.states || []).map(([v, l]) => link({ state: v || null, stress }, l)).join('');
    const opens = (P.opens || []).map(([v, l]) => link({ open: v, state: P.state || null, stress }, l)).join('');
    return `<button aria-expanded="false">Prototype: ${P.stress ? 'stress data' : 'normal data'}${P.state ? ', ' + P.state : ''}</button>
      <div class="pp" hidden><h5>Data</h5>${link({ stress: null, state: P.state || null }, 'Normal data')}${link({ stress: '', state: P.state || null }, 'Stress data')}
      <h5>State</h5>${states}${opens ? '<h5>Open on load</h5>' + opens : ''}
      <p><a href="map.html">Map of every screen and state</a></p><p><a href="?reset">Start over with fresh data</a></p><p>This control is not part of the design.</p></div>`;
  }

  /* ---------- Boot ---------- */
  P.boot = (cfg) => {
    P.page = cfg.page; P.groupId = cfg.groupId || null; P.states = cfg.states; P.opens = cfg.opens;
    P.renderPage = cfg.render;
    const app = P.$('#app');
    app.innerHTML = `<aside class="side glass" aria-label="Main navigation"></aside><main id="main"></main>`;
    const tb = el('<nav class="tabbar glass" aria-label="Main navigation"></nav>');
    document.body.appendChild(tb);
    const proto = el('<div class="proto"></div>');
    proto.innerHTML = protoHTML();
    if (!P.qs.has('clean')) document.body.appendChild(proto);
    proto.querySelector('button').addEventListener('click', (e) => { const pp = proto.querySelector('.pp'); pp.hidden = !pp.hidden; e.currentTarget.setAttribute('aria-expanded', String(!pp.hidden)); });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.closest('.sheet') || b.closest('.dialog') || b.closest('.menu')) return;
      const act = b.dataset.act;
      if (act === 'task-new') { e.preventDefault(); P.openTask(null, { group: P.groupId, full: false }); }
      if (act === 'group-new') { e.preventDefault(); P.openGroup(null); }
      if (act === 'more') { e.preventDefault(); P.openMore(); }
    });
    P.render();
    if (cfg.afterBoot) cfg.afterBoot();
    const o = P.openParam;
    const firstOpen = () => P.db.tasks.find((t) => !t.done);
    if (o === 'task-new') P.openTask(null, {});
    if (o === 'task-new-full') P.openTask(null, { full: true });
    if (o === 'task-required') P.openTask(null, { full: true, err: 'desc' });
    if (o === 'task-edit') P.openTask((P.task('t1') || P.task('s1') || firstOpen()).id);
    if (o === 'task-edit-int') P.openTask((P.task('t7') || P.task('s8') || firstOpen()).id);
    if (o === 'task-done') { const t = P.db.tasks.find((x) => x.done); if (t) P.openTask(t.id); }
    if (o === 'task-names') { P.openTask((P.task('t5') || P.task('s1') || firstOpen()).id); P._showSuggest('#f-resp', 'ra'); }
    if (o === 'task-names-new') { P.openTask((P.task('t5') || P.task('s1') || firstOpen()).id); P._showSuggest('#f-inf', 'Nadia'); }
    if (o === 'task-delete') P.deleteTask((P.task('t1') || P.task('s1') || firstOpen()).id);
    if (o === 'group-new') P.openGroup(null);
    if (o === 'group-empty') P.openGroup(null, { name: '', err: 'empty' });
    if (o === 'group-dup') P.openGroup(null, { name: 'Hiring', err: 'dup' });
    if (o === 'group-fail') P.openGroup(null, { name: 'Partner events', fail: true });
    if (o === 'group-rename') P.openGroup(P.db.groups[2] ? P.db.groups[2].id : null);
    if (o === 'group-delete' && P.db.groups[2]) P.deleteGroup(P.db.groups[2].id);
    if (o === 'more') P.openMore();
    if (cfg.onOpen) cfg.onOpen(o);
  };
  P.render = () => {
    const side = P.$('.side'); if (side) side.innerHTML = sideHTML();
    const tb = P.$('.tabbar'); if (tb) tb.innerHTML = tabbarHTML();
    P.renderPage();
    P.flash.clear();
    if (!P.justDone) P.save();
  };
})();
