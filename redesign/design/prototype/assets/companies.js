/* Companies: the four groups, where to act, quick edits, the company record, moving between groups,
   follow-up tasks, fields and options, and export (B1 to B14, C1 to C3, E1). */
(function () {
  const { ic, esc, num, plural } = P;
  const q = P.qs;

  const GROUPS = [
    { id: 'lead', label: 'To approach', sub: 'Not contacted yet', icon: 'flag', noun: ['company to approach', 'companies to approach'] },
    { id: 'active', label: 'Active', sub: 'Prospects we’re working', icon: 'bolt', noun: ['active prospect', 'active prospects'] },
    { id: 'done', label: 'Deal done', sub: 'Our clients', icon: 'done', noun: ['client', 'clients'] },
    { id: 'hold', label: 'No or not now', sub: 'On hold or rejected', icon: 'pause', noun: ['company on hold or rejected', 'companies on hold or rejected'] },
  ];
  const G = (id) => GROUPS.find((g) => g.id === id);
  const nounOf = (g, n) => `${num(n)} ${n === 1 ? G(g).noun[0] : G(g).noun[1]}`;
  const COLORS = { blue: ['#e4edff', '#2456c9'], sky: ['#dcf0fb', '#13689a'], teal: ['#d9f3f1', '#0b7068'], green: ['#dcf5ea', '#0c7d55'], amber: ['#fff0d9', '#9a5200'], red: ['#ffe5e8', '#c22437'], violet: ['#efe6ff', '#6a3fbd'], pink: ['#ffe4f0', '#ad2f69'], slate: ['#e8ecf3', '#4a5872'] };
  const COLOR_NAMES = { blue: 'Blue', sky: 'Sky', teal: 'Teal', green: 'Green', amber: 'Amber', red: 'Red', violet: 'Violet', pink: 'Pink', slate: 'Grey' };
  const KIND_LABEL = { text: 'Short text', long: 'Long text', number: 'Number', date: 'Date', choice: 'Choice', multi: 'Several choices' };
  const KIND_ICON = { text: 'text', long: 'para', number: 'hash', date: 'cal', choice: 'choice', multi: 'choice' };
  const SECTIONS = [
    ['Where we stand', ['status', 'answer', 'prio', 'products', 'reason']],
    ['What’s happening', ['last', 'target', 'outreach', 'next', 'trial', 'notes']],
    ['Who they are', ['contact', 'type', 'industry', 'source']],
  ];

  if (P.state === 'empty-group') P.db.companies = P.db.companies.filter((c) => c.stage !== (q.get('g') || 'hold'));

  const ui = {
    g: q.get('g') || 'active', q: q.get('q') || '', prio: q.get('prio') || '', product: q.get('product') || '', status: q.get('status') || '',
    act: q.get('act') || '', sort: q.get('sort') || '', dir: q.get('dir') || '', limit: 100,
  };
  if (!G(ui.g)) ui.g = 'active';
  const coParam = q.get('co');
  if (coParam && P.company(coParam)) ui.g = P.company(coParam).stage;
  const flashCo = new Set();
  let liveCo = new Set();
  let lastSorted = [];
  let rec = null; // the open company record, if any

  /* ---------- Fields and values ---------- */
  const fields = () => P.db.coFields;
  const field = (id) => fields().find((f) => f.id === id);
  const groupFields = (g) => fields().filter((f) => f.groups.includes(g));
  const shown = (g) => (P.db.coShown[g] || []).map(field).filter((f) => f && f.groups.includes(g));
  const optsOf = (f) => P.db.coOptions[f.id] || (P.db.coOptions[f.id] = []);
  const opt = (f, id) => optsOf(f).find((o) => o.id === id);
  const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
  const colors = (o) => COLORS[o.color] || COLORS.slate;
  const chip = (o) => { const [bg, fg] = colors(o); return `<span class="ochip" style="--ob:${bg};--of:${fg}">${esc(o.label)}</span>`; };
  const swatch = (c) => { const [bg, fg] = COLORS[c] || COLORS.slate; return `<i class="sw" style="--ob:${bg};--of:${fg}"></i>`; };
  const textOf = (c, f) => {
    const v = c[f.id];
    if (isEmpty(v)) return '';
    if (f.kind === 'choice') { const o = opt(f, v); return o ? o.label : ''; }
    if (f.kind === 'multi') return v.map((id) => opt(f, id)).filter(Boolean).map((o) => o.label).join(', ');
    if (f.kind === 'date') return P.fmt(v, { year: true });
    if (f.kind === 'number') return String(v);
    return String(v);
  };
  const companiesIn = (g) => P.db.companies.filter((c) => c.stage === g);
  const openTasksOf = (c) => P.db.tasks.filter((t) => t.co === c.id && !t.done);

  /* ---------- Urgency (B6, B7) ---------- */
  const idle = (c) => (c.last ? -P.diff(c.last) : null);
  const ACTS = [
    { id: 'cold', label: 'Gone cold', hint: 'No contact for 14 days or more', icon: 'snow', tone: 'red', test: (c) => c.last && idle(c) >= 14 },
    { id: 'fu', label: 'Waiting on our follow-up', hint: 'Status is Follow-up due', icon: 'hourglass', tone: 'amber', test: (c) => c.status === 'fu' },
    { id: 'high', label: 'High priority', hint: 'Priority is High', icon: 'flag', tone: 'violet', test: (c) => c.prio === 'high' },
    { id: 'due', label: 'Target date close or missed', hint: 'Within 3 days, or already passed', icon: 'clock', tone: 'blue', test: (c) => c.target && P.diff(c.target) <= 3 },
  ];
  const lastView = (c) => {
    const n = idle(c);
    const label = n === 0 ? 'Today' : (n === 1 ? 'Yesterday' : (n < 0 ? P.fmt(c.last) : `${num(n)} days ago`));
    const warm = c.stage === 'active' || c.stage === 'done';
    const tone = warm && n >= 14 ? 'red' : (warm && n >= 7 ? 'amber' : '');
    return { label, tone, title: `Last action ${P.fmt(c.last, { year: true })}${tone === 'red' ? '. Gone cold' : ''}` };
  };
  const datePill = (iso, kind) => {
    const n = P.diff(iso);
    const word = kind === 'outreach' ? 'Planned outreach' : 'Target date';
    let label; let tone;
    if (n < 0) { label = kind === 'outreach' ? `${plural(-n, 'day')} overdue` : `Missed by ${plural(-n, 'day')}`; tone = kind === 'outreach' ? 'amber' : 'red'; }
    else if (n === 0) { label = 'Today'; tone = 'amber'; }
    else if (n === 1) { label = 'Tomorrow'; tone = 'amber'; }
    else if (n <= 3) { label = `In ${n} days`; tone = 'amber'; }
    else if (n <= 30) { label = `In ${n} days`; tone = 'calm'; }
    else { label = P.fmt(iso); tone = 'calm'; }
    return `<span class="pill p-${tone}" title="${esc(word)} ${esc(P.wd(iso))} ${esc(P.fmt(iso, { year: true }).split(' ').slice(1).join(' '))}">${tone === 'red' ? ic('alert') : ''}${esc(label)}</span>`;
  };
  function view(c, f, ctx) {
    const v = c[f.id];
    if (isEmpty(v)) return '';
    switch (f.kind) {
      case 'choice': { const o = opt(f, v); return o ? chip(o) : ''; }
      case 'multi': {
        const os = v.map((id) => opt(f, id)).filter(Boolean); const max = ctx === 'cell' ? 2 : 99;
        return `<span class="ochips">${os.slice(0, max).map(chip).join('')}${os.length > max ? `<span class="ochip more" title="${esc(os.slice(max).map((o) => o.label).join(', '))}">+${os.length - max}</span>` : ''}</span>`;
      }
      case 'date':
        if (f.id === 'last') { const l = lastView(c); return `<span class="${l.tone ? 'tone-' + l.tone : 'dv'}" title="${esc(l.title)}">${l.tone === 'red' && ctx !== 'cell' ? ic('snow') : ''}${esc(l.label)}</span>`; }
        if (f.id === 'target' || f.id === 'outreach') return datePill(v, f.id);
        return `<span class="dv">${esc(P.fmt(v, { year: true }))}</span>`;
      case 'number': return `<span class="nv">${esc(num(v))}</span>`;
      default: return ctx === 'cell' ? `<span class="tx">${esc(v)}</span>` : esc(v);
    }
  }

  /* ---------- Filtering and order (B8, B9) ---------- */
  const searchText = (c) => {
    const f = (id) => textOf(c, field(id) || { id, kind: 'text' });
    const parts = [c.name, c.contact, c.source, f('products')];
    if (c.stage === 'lead') parts.push(c.industry, c.notes);
    if (c.stage === 'hold') parts.push(c.reason);
    return parts.join(' ').toLowerCase();
  };
  // Products are free text (owner, D-012). The filter splits on commas and ignores case and spacing.
  const productsOf = (c) => String(c.products || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  const productList = (g) => {
    const seen = new Map();
    companiesIn(g).forEach((c) => productsOf(c).forEach((p) => { const k = p.toLowerCase(); const e = seen.get(k) || { name: p, n: 0 }; e.n++; seen.set(k, e); }));
    return Array.from(seen.values()).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  };
  const matchQ = (c) => !ui.q || searchText(c).includes(ui.q.toLowerCase());
  const hasF = (id) => groupFields(ui.g).some((f) => f.id === id);
  function apply(list) {
    list = list.filter(matchQ);
    if (ui.prio && hasF('prio')) list = list.filter((c) => (ui.prio === '-' ? !c.prio : c.prio === ui.prio));
    if (ui.product && hasF('products')) list = list.filter((c) => productsOf(c).some((p) => p.toLowerCase() === ui.product.toLowerCase()));
    if (ui.status && hasF('status')) list = list.filter((c) => (ui.status === '-' ? !c.status : c.status === ui.status));
    const a = ui.g === 'active' && ACTS.find((x) => x.id === ui.act);
    if (a) list = list.filter(a.test);
    return list;
  }
  const filtersOn = () => !!(ui.q || (ui.prio && hasF('prio')) || (ui.product && hasF('products')) || (ui.status && hasF('status')) || (ui.g === 'active' && ui.act));
  const defaultSort = () => (ui.g === 'lead' ? ['outreach', 'asc'] : ['last', 'desc']); // B9: most recent action first
  const sortKey = () => ((ui.sort && (ui.sort === 'name' || hasF(ui.sort))) ? ui.sort : defaultSort()[0]);
  const sortDir = () => (ui.sort && sortKey() === ui.sort ? (ui.dir || (['last'].includes(ui.sort) ? 'desc' : 'asc')) : defaultSort()[1]);
  const dirLabels = (k) => {
    if (k === 'name') return ['A to Z', 'Z to A'];
    const f = field(k);
    if (k === 'last') return ['Longest ago first', 'Most recent first'];
    if (k === 'prio') return ['High first', 'Low first'];
    if (f.kind === 'date') return ['Earliest first', 'Latest first'];
    if (f.kind === 'number') return ['Smallest first', 'Largest first'];
    if (f.kind === 'choice') return ['In option order', 'Reverse order'];
    return ['A to Z', 'Z to A'];
  };
  const sortLabel = (k) => (k === 'name' ? 'Company' : field(k).label);
  function sortList(list) {
    const k = sortKey(); const dir = sortDir() === 'asc' ? 1 : -1;
    const f = k === 'name' ? null : field(k);
    const val = (c) => {
      if (!f) return c.name.toLowerCase();
      const v = c[k]; if (isEmpty(v)) return null;
      if (f.kind === 'choice') { const i = optsOf(f).findIndex((o) => o.id === v); return i < 0 ? null : i; }
      if (f.kind === 'multi' || f.kind === 'text' || f.kind === 'long') return textOf(c, f).toLowerCase();
      return v;
    };
    return list.map((c) => [c, val(c)]).sort((a, b) => {
      if (a[1] == null && b[1] == null) return 0;
      if (a[1] == null) return 1; // empty values always last, whichever way round
      if (b[1] == null) return -1;
      return (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) * dir;
    }).map((x) => x[0]);
  }
  function syncUrl() {
    const u = new URLSearchParams();
    if (ui.g !== 'active') u.set('g', ui.g);
    ['q', 'prio', 'product', 'status', 'act'].forEach((k) => { if (ui[k]) u.set(k, ui[k]); });
    if (ui.sort) { u.set('sort', ui.sort); u.set('dir', sortDir()); }
    if (rec) u.set('co', rec.id);
    if (P.state) u.set('state', P.state);
    const s = u.toString() + (P.stress ? (u.toString() ? '&' : '') + 'stress' : '');
    history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
  }

  /* ---------- List ---------- */
  const W = { choice: 150, multi: 190, date: 132, text: 150, long: 220, number: 120 };
  const WCSS = { choice: '150px', multi: '190px', date: '132px', text: 'minmax(150px, 1fr)', long: 'minmax(220px, 1.6fr)', number: '120px' };
  const gridOf = (fs) => ['minmax(230px, 1.5fr)', ...fs.map((f) => WCSS[f.kind]), '40px'].join(' ');
  const minWidth = (fs) => 230 + fs.reduce((a, f) => a + W[f.kind], 0) + 40 + 14 * (fs.length + 1) + 28;
  const mono = (c, cls) => `<span class="cmono g-${c.stage}${cls ? ' ' + cls : ''}" aria-hidden="true">${esc(c.short || P.initials(c.name))}</span>`;
  const subOf = (c) => (c.stage === 'lead' ? c.industry : c.contact);

  function cell(c, f) {
    const v = view(c, f, 'cell');
    const label = `${f.label}: ${textOf(c, f) || 'empty'}. Change`;
    return `<button class="ccell k-${f.kind} col-${f.id}${v ? '' : ' empty-cell'}" data-edit="${f.id}" data-co="${c.id}" aria-label="${esc(label)}"><span class="lbl">${esc(f.label)}</span>${v || '<span class="empty-v">–</span>'}</button>`;
  }
  function row(c, fs) {
    const sub = subOf(c);
    const live = liveCo.has(c.id) ? '<span class="live-tag">Just changed</span>' : '';
    return `<div class="crow${flashCo.has(c.id) ? ' is-new' : ''}" data-open="${c.id}">
      <div class="cname">${mono(c)}<div class="cn"><p class="tt"><a href="${P.keep('companies.html?co=' + c.id)}" data-openlink="${c.id}">${esc(c.name)}</a></p>${sub || live ? `<p class="meta">${sub ? `<span>${esc(sub)}</span>` : ''}${live}</p>` : ''}</div></div>
      ${fs.map((f) => cell(c, f)).join('')}
      <button class="icon-btn rmenu" data-rowmenu="${c.id}" aria-label="More for ${esc(c.name)}">${ic('more')}</button></div>`;
  }
  function headRow(fs) {
    const k = sortKey(); const d = sortDir();
    const th = (label, key) => `<button data-sort="${key}"${k === key ? ` aria-sort="${d === 'asc' ? 'ascending' : 'descending'}"` : ''}>${esc(label)}${k === key ? ic(d === 'asc' ? 'up' : 'down') : ''}</button>`;
    return `<div class="chead">${`<div class="cname">${th('Company', 'name')}</div>`}${fs.map((f) => th(f.label, f.id)).join('')}<span></span></div>`;
  }

  function tiles() {
    return `<div class="cotiles" role="group" aria-label="Groups of companies">${GROUPS.map((g) => {
      const n = companiesIn(g.id).length;
      return `<button class="cotile g-${g.id}" data-g="${g.id}" aria-pressed="${ui.g === g.id}">
        <span class="ct-top"><i>${ic(g.icon)}</i><span class="ct-l">${g.label}</span></span>
        <b class="ct-n">${P.loading ? '<span class="skel" style="width:46px;height:30px"></span>' : num(n)}</b>
        <small>${g.sub}</small></button>`;
    }).join('')}</div>`;
  }
  function actsRow() {
    if (ui.g !== 'active' || P.loading) return '';
    const all = companiesIn('active'); const total = all.length;
    if (!total) return '';
    return `<section class="wta" aria-label="Where to act"><h2 class="wta-h">Where to act<span>Tap one to see only those</span></h2><div class="wta-grid">${ACTS.map((a) => {
      const n = all.filter(a.test).length;
      const pct = total ? Math.round((n / total) * 100) : 0;
      return `<button class="actc t-${a.tone}" data-act-f="${a.id}" aria-pressed="${ui.act === a.id}" title="${esc(a.hint)}">
        <span class="ac-top"><i>${ic(a.icon)}</i><b>${num(n)}</b><span class="of">of ${num(total)}</span></span>
        <span class="ac-l">${a.label}</span>
        <span class="ac-bar" aria-hidden="true"><i style="width:${Math.max(n ? 4 : 0, pct)}%"></i></span></button>`;
    }).join('')}</div></section>`;
  }
  function filters() {
    const fb = (key, icon, label, val, on) => (on
      ? `<span class="fbtn on"><button data-menu="${key}" aria-haspopup="menu">${ic(icon)}${label} <span class="v">${esc(val)}</span></button><button class="x" data-clear="${key}" aria-label="Clear the ${label.toLowerCase()} filter">${ic('x')}</button></span>`
      : `<button class="fbtn" data-menu="${key}" aria-haspopup="menu">${ic(icon)}${label}${ic('down')}</button>`);
    const parts = [];
    const optLabel = (fid, v) => (v === '-' ? 'None' : ((opt(field(fid), v) || {}).label || ''));
    if (hasF('status')) parts.push(fb('status', 'choice', 'Status', optLabel('status', ui.status), !!ui.status));
    if (hasF('prio')) parts.push(fb('prio', 'flag', 'Priority', optLabel('prio', ui.prio), !!ui.prio));
    if (hasF('products')) parts.push(fb('product', 'filter', 'Product', ui.product, !!ui.product));
    const k = sortKey();
    parts.push(`<button class="fbtn" data-menu="sort" aria-haspopup="menu">${ic('sort')}Sort <span class="v">${esc(sortLabel(k))}, ${dirLabels(k)[sortDir() === 'asc' ? 0 : 1].toLowerCase()}</span>${ic('down')}</button>`);
    parts.push('<span class="sp"></span>');
    parts.push(`<button class="fbtn" data-fields>${ic('sliders')}Fields</button>`);
    parts.push(`<button class="fbtn" data-export>${ic('download')}Export</button>`);
    return `<div class="filters" role="toolbar" aria-label="Filter, sort and export">${parts.join('')}</div>`;
  }
  function emptyState(scoped) {
    const art = (i) => `<div class="art">${ic(i)}</div>`;
    const g = G(ui.g);
    if (P.state === 'offline-empty') return `<div class="empty">${art('wifi')}<h3>No connection</h3><p>Companies will appear once you are back online.</p></div>`;
    if (filtersOn() && scoped.length) {
      const elsewhere = ui.q ? GROUPS.filter((x) => x.id !== ui.g).map((x) => [x, companiesIn(x.id).filter(matchQ).length]).filter((x) => x[1]) : [];
      const where = elsewhere.length ? `<div class="elsewhere"><span>Found in other groups:</span>${elsewhere.map(([x, n]) => `<button class="hchip" data-g="${x.id}" data-keepq><i class="g-${x.id}">${num(n)}</i>${x.label}</button>`).join('')}</div>` : '';
      return `<div class="empty">${art('search')}<h3>No ${g.noun[1].replace(/^company/, 'companies')} match</h3><p>${ui.q ? `Nothing in ${g.label} matches “${esc(ui.q)}”${filtersOn() && (ui.prio || ui.product || ui.status || ui.act) ? ' with these filters' : ''}. Search looks at the name, contact person, source and products${ui.g === 'lead' ? ', industry and notes' : (ui.g === 'hold' ? ', and the reason' : '')}.` : 'Nothing matches these filters.'}</p>${where}<div class="acts"><button class="btn" data-clearall>Clear ${ui.q && !(ui.prio || ui.product || ui.status || ui.act) ? 'search' : 'filters'}</button></div></div>`;
    }
    if (!P.db.companies.length) return `<div class="empty">${art('building')}<h3>No companies yet</h3><p>Record the first company you’re talking to, or one you plan to approach. Only the name is needed.</p><div class="acts"><button class="cta" data-new>${ic('plus')}New company</button></div></div>`;
    const copy = {
      lead: ['Nothing to approach', 'Companies you plan to contact go here, with a planned outreach date, so the backlog of leads is in one place.'],
      active: ['No active prospects', 'Companies you’re working with go here. Move one in from To approach once you’ve made contact.'],
      done: ['No deals done yet', 'When a deal is done, the company moves here and its tasks count as client work.'],
      hold: ['Nobody has said no or not now', 'Companies that say no or not now go here with the reason, so the team can learn from it and revisit later.'],
    }[ui.g];
    return `<div class="empty">${art(g.icon)}<h3>${copy[0]}</h3><p>${copy[1]}</p><div class="acts"><button class="btn" data-new>${ic('plus')}Add a company here</button></div></div>`;
  }

  function render() {
    const scoped = P.loading ? [] : companiesIn(ui.g);
    const sorted = sortList(apply(scoped));
    lastSorted = sorted;
    const fs = shown(ui.g);
    const g = G(ui.g);
    let body;
    if (P.loading && P.state !== 'offline-empty') {
      body = `<div class="loading-note"><span class="spin"></span>Loading companies</div>` + [1, 2, 3, 4, 5, 6].map(() => '<div class="skel-row" style="grid-template-columns:40px 1fr 120px 90px 110px"><span class="skel c2"></span><div><span class="skel l1"></span><span class="skel l2"></span></div><span class="skel c4"></span><span class="skel l1" style="width:100%"></span><span class="skel c4"></span></div>').join('');
    } else if (!sorted.length) {
      body = emptyState(scoped);
    } else {
      const shownRows = sorted.slice(0, ui.limit);
      const line = filtersOn()
        ? `<b>${num(sorted.length)}</b> of ${nounOf(ui.g, scoped.length)} match <button class="link" data-clearall style="margin-left:8px">Clear filters</button>`
        : `<b>${nounOf(ui.g, sorted.length)}</b>`;
      body = `<p class="result-line" role="status">${line}</p>
        <div class="ctable-wrap"><div class="ctable" style="--cols:${gridOf(fs)};--minw:${minWidth(fs)}px">${headRow(fs)}<div class="clist">${shownRows.map((c) => row(c, fs)).join('')}</div></div></div>
        ${sorted.length > shownRows.length ? `<div class="more-row">Showing ${num(shownRows.length)} of ${num(sorted.length)}<button class="btn sm" data-more>Show ${num(Math.min(100, sorted.length - shownRows.length))} more</button></div>` : ''}`;
    }
    const total = P.db.companies.length;
    const search = (cls) => `<label class="search glass ${cls}">${ic('search')}<span class="sr">Search companies</span><input type="search" data-q value="${esc(ui.q)}" placeholder="Search name, contact, source, product"></label>`;
    P.$('#main').innerHTML = `<div class="bar"><div class="ttl"><h1>Companies</h1><span class="sub">${P.loading ? '' : plural(total, 'company', 'companies')}</span></div><span class="sp"></span>${search('')}<button class="cta" data-new>${ic('plus')}New company</button><button class="icon-btn glass mob-only" data-new aria-label="New company">${ic('plus')}</button></div>
      ${P.offlineBanner()}${search('m-search')}${tiles()}${actsRow()}
      <section class="panel glass co-panel" aria-label="${esc(g.label)}">${P.loading ? '' : filters()}${body}</section>`;
    flashCo.clear();
    if (rec) rec.paint();
    syncUrl();
  }

  /* ---------- Saving a change (B10, B12) ---------- */
  const blocked = (what) => { if (!P.offline) return false; P.toast(`No connection. ${what} wasn't saved.`, { err: true }); return true; };
  function snapshot(c) { return { c: JSON.parse(JSON.stringify(c)), tasks: P.db.tasks.filter((t) => t.co === c.id).map((t) => [t, t.end, t.last]) }; }
  function restore(s) {
    const c = P.company(s.c.id); if (c) Object.assign(c, s.c); else P.db.companies.unshift(s.c);
    s.tasks.forEach(([t, end, last]) => { t.end = end; t.last = last; });
    flashCo.add(s.c.id); P.render();
  }
  function setVal(c, f, v, quiet) {
    if (blocked('The change')) return;
    if (JSON.stringify(c[f.id] == null ? '' : c[f.id]) === JSON.stringify(v == null ? '' : v)) return;
    const snap = snapshot(c);
    if (f.id === 'status' && v === 'won' && c.stage === 'active') { moveTo(c, 'done', {}, snap); return; }
    c[f.id] = v;
    let msg = isEmpty(v) ? `${f.label} cleared` : `${f.label} updated`;
    if ((f.id === 'last' || f.id === 'target') && f.groups.includes(c.stage)) {
      const n = P.syncCompany(c.id, { [f.id]: v });
      if (n) msg += `. ${plural(n, 'linked task')} now ${n === 1 ? 'matches' : 'match'}`;
    }
    flashCo.add(c.id); P.render();
    if (!quiet) P.toast(msg, { action: 'Undo', onAction: () => restore(snap) });
  }

  /* Quick editor: one detail in one step, from the list or the record */
  function editField(anchor, c, f) {
    const v = c[f.id];
    const title = `<h4>${esc(f.label)}</h4>`;
    const editOpts = `<hr><button class="mi" data-v="+opts">${ic('sliders')}<span>Edit options</span></button>`;
    if (f.kind === 'choice') {
      const locked = f.id === 'status' && c.stage !== 'active';
      const items = optsOf(f).map((o) => `<button class="mi" role="menuitemradio" data-v="${esc(o.id)}" aria-checked="${v === o.id}">${chip(o)}${o.id === 'won' && c.stage === 'active' ? '<small class="mi-note">Moves it to Deal done</small>' : ''}${ic('check', 'tick')}</button>`).join('');
      return P.menu(anchor, `${title}${locked ? `<p class="foot">Status is used while a company is Active.</p>` : ''}${items}${v ? `<hr><button class="mi" data-v="+clear">${ic('x')}<span>Clear</span></button>` : ''}${editOpts}`, (x) => {
        if (x === '+opts') { P.closeTop(); openOptions(f.id); return true; }
        setVal(c, f, x === '+clear' ? '' : x);
      });
    }
    if (f.kind === 'multi') {
      const cur = new Set(v || []); let told = false;
      return P.menu(anchor, `${title}${optsOf(f).map((o) => `<button class="mi" role="menuitemcheckbox" data-v="${esc(o.id)}" aria-checked="${cur.has(o.id)}"><span class="box">${ic('check')}</span>${chip(o)}</button>`).join('')}${editOpts}`, (x, b) => {
        if (x === '+opts') { P.closeTop(); openOptions(f.id); return true; }
        if (cur.has(x)) cur.delete(x); else cur.add(x);
        b.setAttribute('aria-checked', String(cur.has(x)));
        setVal(c, f, optsOf(f).map((o) => o.id).filter((id) => cur.has(id)), told); // one message per menu
        told = true;
        return true;
      });
    }
    if (f.kind === 'date') {
      const quick = f.id === 'last' ? [[0, 'Today'], [-1, 'Yesterday']] : [[0, 'Today'], [1, 'Tomorrow'], [7, 'In a week']];
      return P.menu(anchor, `${title}<div class="qe"><input class="input" type="date" value="${v || ''}" aria-label="${esc(f.label)}"></div>
        <div class="qe-quick">${quick.map(([n, l]) => `<button class="chip" data-v="d:${n}">${l}</button>`).join('')}</div>
        ${f.id === 'last' || f.id === 'target' ? `<p class="foot">${ic('sync')}Linked tasks follow this date.</p>` : ''}
        ${v ? `<hr><button class="mi" data-v="+clear">${ic('x')}<span>Clear</span></button>` : ''}`, (x) => {
        setVal(c, f, x === '+clear' ? null : P.iso(+x.slice(2)));
      }, { onReady: (m) => m.querySelector('input').addEventListener('change', (e) => { if (e.target.value) { P.closeTop(); setVal(c, f, e.target.value); } }) });
    }
    const multi = f.kind === 'long';
    const input = multi ? `<textarea class="textarea" rows="5" aria-label="${esc(f.label)}">${esc(v || '')}</textarea>` : `<input class="input" ${f.kind === 'number' ? 'type="number" inputmode="decimal"' : ''} value="${esc(v == null ? '' : v)}" aria-label="${esc(f.label)}">`;
    const m = P.menu(anchor, `${title}<div class="qe${multi ? ' wide' : ''}">${input}</div><div class="qe-acts">${v != null && v !== '' ? '<button class="btn sm quiet" data-v="+clear">Clear</button>' : ''}<span class="sp"></span><button class="btn sm" data-v="+cancel">Cancel</button><button class="cta sm" data-v="+save">Save</button></div>${multi ? '<p class="foot">Ctrl + Enter saves.</p>' : ''}`, (x, b, menu) => {
      if (x === '+cancel') return;
      const raw = menu.querySelector('input, textarea').value;
      let nv = x === '+clear' ? '' : raw.trim();
      if (f.kind === 'number') nv = nv === '' ? null : Number(nv);
      setVal(c, f, nv);
    }, { onReady: (menu) => {
      const i = menu.querySelector('input, textarea'); i.focus(); i.setSelectionRange && i.value && i.setSelectionRange(i.value.length, i.value.length);
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (!multi || e.ctrlKey || e.metaKey)) { e.preventDefault(); menu.querySelector('[data-v="+save"]').click(); } });
    } });
    m.classList.add('qe-menu');
    return m;
  }

  /* ---------- Follow-up task (B11) ---------- */
  function followUp(c) {
    if (P.offline || P.state === 'task-fail') {
      P.toast('Couldn’t create the follow-up task. Check your connection and try again.', { err: true, action: 'Try again', onAction: () => followUp(c) });
      return;
    }
    const t = { id: 'n' + Date.now(), desc: `Follow up with ${c.name}`, co: c.id, group: null, type: 'Follow-up', touch: '', prio: c.prio === 'high' ? 'high' : '', start: null, end: c.target || null, last: c.last || null, key: c.next || '', resp: [], inf: [], done: false, doneAt: null };
    P.db.tasks.unshift(t); P.flash.add(t.id); P.render();
    P.toast(`Follow-up task created for ${c.name}`, { action: 'Open', onAction: () => P.openTask(t.id) });
  }
  function logToday(c) { setVal(c, field('last'), P.iso(0)); }

  /* ---------- Moving between groups (B5) ---------- */
  function moveTo(c, to, vals, snap) {
    snap = snap || snapshot(c);
    const from = c.stage;
    Object.assign(c, vals);
    c.stage = to;
    if (to === 'done') c.status = 'won';
    else if (c.status === 'won') c.status = '';
    const tasks = openTasksOf(c).length;
    const kindNote = (from === 'done') !== (to === 'done') && tasks ? ` Its ${plural(tasks, 'open task')} ${to === 'done' ? 'now count as client work' : 'count as prospect work again'}.` : '';
    flashCo.add(c.id); P.render();
    P.toast(`${to === 'done' ? 'Deal done. ' : ''}${c.name} moved to ${G(to).label}.${kindNote}`, { action: 'Undo', onAction: () => restore(snap) });
  }
  function inputFor(f, v, err) {
    const id = 'mv-' + f.id;
    const lab = `<label for="${id}">${esc(f.label)} <span class="opt">optional</span></label>`;
    if (f.kind === 'choice') return `<div class="field">${lab}<select class="select" id="${id}" data-fv="${f.id}"><option value="">None</option>${optsOf(f).filter((o) => o.id !== 'won').map((o) => `<option value="${esc(o.id)}"${v === o.id ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>`;
    if (f.kind === 'multi') return `<div class="field"><span class="lbl">${esc(f.label)} <span class="opt">optional</span></span><div class="chips">${optsOf(f).map((o) => `<button type="button" class="chip" data-multi="${f.id}" data-o="${esc(o.id)}" aria-pressed="${(v || []).includes(o.id)}">${esc(o.label)}</button>`).join('')}</div></div>`;
    if (f.kind === 'date') return `<div class="field">${lab}<input class="input" type="date" id="${id}" data-fv="${f.id}" value="${v || ''}"></div>`;
    if (f.kind === 'long') return `<div class="field">${lab}<textarea class="textarea" id="${id}" data-fv="${f.id}" rows="3">${esc(v || '')}</textarea></div>`;
    return `<div class="field${err ? ' has-err' : ''}">${lab}<input class="input" id="${id}" data-fv="${f.id}" ${f.kind === 'number' ? 'type="number"' : ''} value="${esc(v == null ? '' : v)}"></div>`;
  }
  function openMove(c, to) {
    const others = GROUPS.filter((g) => g.id !== c.stage);
    const st = { to: to || (c.stage === 'lead' ? 'active' : (c.stage === 'active' ? 'done' : 'active')), vals: {} };
    const defaults = (g) => {
      const d = {};
      if (g === 'active') { if (!c.status || c.status === 'won') d.status = 'meet'; if (c.stage === 'lead') d.last = P.iso(0); }
      if (g === 'hold' && !c.answer) d.answer = 'later';
      return d;
    };
    st.vals = defaults(st.to);
    const scrim = P.el('<div class="scrim top"></div>');
    const d = P.el('<div class="dialog wide over-sheet" role="dialog" aria-modal="true" aria-labelledby="mv-h"></div>');
    scrim.addEventListener('click', () => P.closeTop());
    P.layer([scrim, d]);
    function paint() {
      const fromF = groupFields(c.stage).map((f) => f.id);
      const target = groupFields(st.to);
      const carried = target.filter((f) => fromF.includes(f.id) && !isEmpty(c[f.id]) && !(f.id in st.vals));
      const needs = new Set(P.db.coShown[st.to]);
      const toFill = target.filter((f) => !carried.includes(f) && (needs.has(f.id) || f.id in st.vals));
      const tasks = openTasksOf(c).length;
      const kindNote = (c.stage === 'done') !== (st.to === 'done') && tasks ? `<div class="sync-note">${ic('info')}<span>Its ${plural(tasks, 'open task')} will ${st.to === 'done' ? 'count as client work' : 'count as prospect work again'}.</span></div>` : '';
      d.innerHTML = `<h2 id="mv-h">Move ${esc(c.name)}</h2>
        <p>From <span class="gtag g-${c.stage}">${ic(G(c.stage).icon)}${G(c.stage).label}</span> to:</p>
        <div class="gopts" role="radiogroup" aria-label="New group">${others.map((g) => `<button class="gopt g-${g.id}" role="radio" aria-checked="${st.to === g.id}" data-to="${g.id}"><i>${ic(g.icon)}</i><span><b>${g.label}</b><small>${g.sub}</small></span></button>`).join('')}</div>
        ${carried.length ? `<h3 class="mv-h3">${ic('check')}Carried over</h3><div class="carry">${carried.map((f) => `<span><em>${esc(f.label)}</em>${esc(textOf(c, f))}</span>`).join('')}</div>` : ''}
        ${toFill.length ? `<h3 class="mv-h3">${ic('edit')}What ${G(st.to).label} needs</h3>${toFill.map((f) => inputFor(f, f.id in st.vals ? st.vals[f.id] : c[f.id])).join('')}<p class="help">Anything else can be filled in later from the record.</p>` : ''}
        ${kindNote}
        <div class="acts"><button class="btn" data-x>Cancel</button><button class="cta" data-ok>${ic('swap')}Move to ${G(st.to).label}</button></div>`;
    }
    paint();
    d.querySelector('[aria-checked="true"]').focus();
    d.addEventListener('input', (e) => { const k = e.target.dataset.fv; if (k) st.vals[k] = field(k).kind === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : (e.target.value || (field(k).kind === 'date' ? null : '')); });
    d.addEventListener('change', (e) => { const k = e.target.dataset.fv; if (k) st.vals[k] = e.target.value || (field(k).kind === 'date' ? null : ''); });
    d.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-x]')) { P.closeTop(); return; }
      const g = t.closest('[data-to]'); if (g) { st.to = g.dataset.to; st.vals = defaults(st.to); paint(); d.querySelector(`[data-to="${st.to}"]`).focus(); return; }
      const m = t.closest('[data-multi]');
      if (m) { const k = m.dataset.multi; const cur = new Set(k in st.vals ? st.vals[k] : (c[k] || [])); if (cur.has(m.dataset.o)) cur.delete(m.dataset.o); else cur.add(m.dataset.o); st.vals[k] = optsOf(field(k)).map((o) => o.id).filter((id) => cur.has(id)); m.setAttribute('aria-pressed', String(cur.has(m.dataset.o))); return; }
      if (t.closest('[data-ok]')) {
        if (blocked('The move')) return;
        P.closeTop();
        const snap = snapshot(c);
        const dates = {}; ['last', 'target'].forEach((k) => { if (k in st.vals) dates[k] = st.vals[k]; });
        moveTo(c, st.to, st.vals, snap);
        if (Object.keys(dates).length) { P.syncCompany(c.id, dates); P.render(); }
      }
    });
  }

  /* ---------- Delete (B14) ---------- */
  function deleteCo(c) {
    const n = openTasksOf(c).length; const all = P.db.tasks.filter((t) => t.co === c.id).length;
    P.confirm({
      title: `Delete ${c.name}?`,
      body: `It will be removed for everyone on the team.${all ? ` Its ${plural(all, 'task')}${n && n !== all ? ` (${num(n)} open)` : ''} stay, as internal work.` : ''} Its qualification notes, if any, stay too, without a company.`,
      ok: 'Delete company',
      onOk: () => {
        if (blocked('The deletion')) return;
        P.closeAll();
        P.db.tasks.forEach((t) => { if (t.co === c.id) t.co = null; });
        P.db.companies = P.db.companies.filter((x) => x !== c);
        rec = null; P.render(); P.toast(`${c.name} deleted`);
      },
    });
  }

  /* ---------- Row menu ---------- */
  function rowMenu(btn, c) {
    const hasLast = groupFields(c.stage).some((f) => f.id === 'last');
    P.menu(btn, `<button class="mi" data-v="open">${ic('building')}<span>Open company</span></button>
      <button class="mi" data-v="fu">${ic('plus')}<span>Create a follow-up task</span></button>
      ${hasLast ? `<button class="mi" data-v="today">${ic('clock')}<span>Last action: today</span></button>` : ''}
      <button class="mi" data-v="move">${ic('swap')}<span>Move to another group</span></button>
      <a class="mi" href="${P.keep('soon.html?area=notes&co=' + c.id)}">${ic('note')}<span>Qualification notes</span></a>
      <hr><button class="mi red" data-v="delete">${ic('trash')}<span>Delete company</span></button>`, (v) => {
      P.closeTop();
      if (v === 'open') openRecord(c.id);
      if (v === 'fu') followUp(c);
      if (v === 'today') logToday(c);
      if (v === 'move') openMove(c);
      if (v === 'delete') deleteCo(c);
      return true;
    }, { alignRight: true });
  }

  /* ---------- The company record (B1, B10, B11, B12, B13) ---------- */
  function openRecord(id) {
    const c0 = P.company(id); if (!c0) return;
    if (rec) P.closeTop();
    const scrim = P.el('<div class="scrim"></div>');
    const sh = P.el('<section class="sheet co-sheet" role="dialog" aria-modal="true" aria-labelledby="co-h"></section>');
    scrim.addEventListener('click', () => P.closeTop());
    P.layer([scrim, sh], { onClose: () => { rec = null; syncUrl(); } });
    let showDone = false;
    function paint() {
      const c = P.company(id);
      if (!c) { P.closeTop(); return; }
      const scroll = sh.querySelector('.sheet-body') ? sh.querySelector('.sheet-body').scrollTop : 0;
      const gf = groupFields(c.stage);
      const used = new Set();
      const prop = (f) => {
        used.add(f.id);
        const v = view(c, f, 'rec');
        const sync = (f.id === 'last' || f.id === 'target') && openTasksOf(c).length ? `<span class="psync" title="Linked tasks follow this date">${ic('sync')}</span>` : '';
        return `<div class="prop k-${f.kind}"><span class="pl">${esc(f.label)}${sync}</span><button class="pv" data-edit="${f.id}" data-co="${c.id}" aria-label="${esc(f.label)}: ${esc(textOf(c, f) || 'empty')}. Change">${v || '<span class="ph">Add</span>'}</button></div>`;
      };
      const sections = SECTIONS.map(([h, ids]) => {
        const fs = ids.map((x) => gf.find((f) => f.id === x)).filter(Boolean);
        return fs.length ? `<section class="rsect"><h3>${h}</h3>${fs.map(prop).join('')}</section>` : '';
      }).join('');
      const own = gf.filter((f) => !used.has(f.id));
      const ownHTML = `<section class="rsect"><h3>Added by the team<button class="link" data-r="fields">Edit fields</button></h3>${own.length ? own.map(prop).join('') : '<p class="rnone">No fields of your own yet in this group.</p>'}</section>`;
      const open = openTasksOf(c);
      const done = P.db.tasks.filter((t) => t.co === c.id && t.done);
      const trow = (t) => `<div class="rtask k-${P.kind(t)}${t.done ? ' is-done' : ''}${P.flash.has(t.id) ? ' is-new' : ''}" data-task="${t.id}"><button class="check" data-tdone="${t.id}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}: ${esc(t.desc)}">${ic('check')}</button><p class="tt">${esc(t.desc)}</p>${P.pill(t)}</div>`;
      const alerts = [];
      if (c.stage === 'active' && c.last && idle(c) >= 14) alerts.push(`<div class="notice err">${ic('snow')}<div><p><b>Gone cold.</b> No contact for ${plural(idle(c), 'day')}.</p></div></div>`);
      if (gf.some((f) => f.id === 'target') && c.target && P.diff(c.target) < 0) alerts.push(`<div class="notice warn">${ic('alert')}<div><p><b>Target date missed</b> by ${plural(-P.diff(c.target), 'day')}. Set a new one, or log what happened.</p></div></div>`);
      if (c.stage === 'lead' && c.outreach && P.diff(c.outreach) < 0) alerts.push(`<div class="notice warn">${ic('flag')}<div><p><b>Outreach was planned ${plural(-P.diff(c.outreach), 'day')} ago.</b> Reach out, or plan a new date.</p></div></div>`);
      sh.innerHTML = `<span class="grab" aria-hidden="true"></span>
        <div class="sheet-head rhead">${mono(c, 'lg')}<div class="rh"><h2 id="co-h">${esc(c.name)}</h2><p><span class="gtag g-${c.stage}">${ic(G(c.stage).icon)}${G(c.stage).label}</span>${c.contact ? `<span class="rc">${esc(c.contact)}</span>` : ''}</p></div><span class="sp"></span><button class="icon-btn" data-r="menu" aria-label="More for ${esc(c.name)}">${ic('more')}</button><button class="icon-btn" data-r="close" aria-label="Close">${ic('x')}</button></div>
        <div class="rec-acts"><button class="btn sm" data-r="fu">${ic('plus')}Follow-up task</button>${gf.some((f) => f.id === 'last') ? `<button class="btn sm" data-r="today">${ic('clock')}Last action: today</button>` : ''}<a class="btn sm" href="${P.keep('soon.html?area=notes&co=' + c.id)}">${ic('note')}Qualification notes</a><button class="btn sm" data-r="move">${ic('swap')}Move</button></div>
        <div class="sheet-body">${P.offline ? '<div class="notice warn">' + ic('wifi') + '<div><p><b>No connection.</b> You can read this record, but changes can’t be saved until you’re back online.</p></div></div>' : ''}${alerts.join('')}
          ${sections}${ownHTML}
          <section class="rsect rtasks"><h3>Tasks<span class="c">${open.length ? num(open.length) + ' open' : ''}</span><button class="link" data-r="fu">${ic('plus')}Follow-up task</button></h3>
            ${open.length ? `${gf.some((f) => f.id === 'last' || f.id === 'target') ? `<p class="sync-note">${ic('sync')}<span>The last action and target date stay in step with ${open.length === 1 ? 'this task' : `these ${num(open.length)} tasks`}. Change either side and the other follows.</span></p>` : ''}${open.map(trow).join('')}` : '<p class="rnone">No open tasks. A follow-up task keeps the next step on everyone’s list.</p>'}
            ${done.length ? `<button class="link rdone" data-r="done">${showDone ? 'Hide' : 'Show'} ${plural(done.length, 'finished task')}</button>${showDone ? done.map(trow).join('') : ''}` : ''}
          </section></div>
        <div class="sheet-foot rfoot"><span class="saved">${ic(P.offline ? 'wifi' : 'done')}${P.offline ? 'Offline. Changes can’t be saved.' : 'Changes save as you make them, for everyone.'}</span></div>`;
      sh.querySelector('.sheet-body').scrollTop = scroll;
    }
    rec = { id, paint };
    paint();
    syncUrl();
    sh.querySelector('[data-r="close"]').focus();
    sh.addEventListener('click', (e) => {
      const t = e.target; const c = P.company(id); if (!c) return;
      const ed = t.closest('[data-edit]'); if (ed) { editField(ed, c, field(ed.dataset.edit)); return; }
      const td = t.closest('[data-tdone]'); if (td) { const task = P.task(td.dataset.tdone); if (task.done) P.reopen(task.id); else P.markDone(task.id); return; }
      const tr = t.closest('[data-task]'); if (tr) { P.openTask(tr.dataset.task); return; }
      const r = t.closest('[data-r]'); if (!r) return;
      const a = r.dataset.r;
      if (a === 'close') P.closeTop();
      if (a === 'fu') followUp(c);
      if (a === 'today') logToday(c);
      if (a === 'move') openMove(c);
      if (a === 'fields') openFields(c.stage);
      if (a === 'done') { showDone = !showDone; paint(); }
      if (a === 'menu') {
        P.menu(r, `<button class="mi" data-v="rename">${ic('edit')}<span>Rename</span></button><button class="mi" data-v="move">${ic('swap')}<span>Move to another group</span></button><hr><button class="mi red" data-v="delete">${ic('trash')}<span>Delete company</span></button>`, (v) => {
          P.closeTop();
          if (v === 'rename') renameCo(r, c);
          if (v === 'move') openMove(c);
          if (v === 'delete') deleteCo(c);
          return true;
        }, { alignRight: true });
      }
    });
  }
  function renameCo(anchor, c) {
    P.menu(anchor, `<h4>Company name</h4><div class="qe"><input class="input" value="${esc(c.name)}" aria-label="Company name"></div><p class="err-msg qe-err" hidden>${ic('alert')}A company needs a name.</p><div class="qe-acts"><span class="sp"></span><button class="btn sm" data-v="x">Cancel</button><button class="cta sm" data-v="ok">Save</button></div>`, (v, b, m) => {
      if (v === 'x') return;
      const name = m.querySelector('input').value.trim();
      if (!name) { m.querySelector('.qe-err').hidden = false; m.querySelector('.qe').classList.add('field', 'has-err'); return true; }
      if (blocked('The new name')) return;
      const snap = snapshot(c); c.name = name; c.short = P.initials(name).slice(0, 2); flashCo.add(c.id); P.render();
      P.toast('Company renamed', { action: 'Undo', onAction: () => restore(snap) });
    }, { alignRight: true, onReady: (m) => { const i = m.querySelector('input'); i.focus(); i.select(); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); m.querySelector('[data-v="ok"]').click(); } }); } });
  }

  /* ---------- New company (B1, B3) ---------- */
  function openNew(opts) {
    opts = opts || {};
    const st = { name: opts.name || '', g: opts.g || ui.g, vals: {}, err: opts.err || null };
    const scrim = P.el('<div class="scrim"></div>');
    const sh = P.el('<section class="sheet co-sheet" role="dialog" aria-modal="true" aria-labelledby="nc-h"></section>');
    scrim.addEventListener('click', () => P.closeTop());
    P.layer([scrim, sh]);
    function paint(focus) {
      const fs = groupFields(st.g).filter((f) => P.db.coShown[st.g].includes(f.id) || f.id === 'contact');
      sh.innerHTML = `<span class="grab" aria-hidden="true"></span><div class="sheet-head"><h2 id="nc-h">New company</h2><span class="sp"></span><button class="icon-btn" data-x aria-label="Close">${ic('x')}</button></div>
        <div class="sheet-body">
          <div class="field${st.err ? ' has-err' : ''}" style="margin-top:4px"><label for="nc-name">Company name</label><input class="input big" id="nc-name" value="${esc(st.name)}" placeholder="Who are they?" autocomplete="off" ${st.err ? 'aria-invalid="true" aria-describedby="nc-err"' : ''}>${st.err ? `<p class="err-msg" id="nc-err">${ic('alert')}Add the company’s name. It’s the only thing needed.</p>` : ''}</div>
          <div class="field"><span class="lbl" id="nc-g">Goes in</span><div class="gopts four" role="radiogroup" aria-labelledby="nc-g">${GROUPS.map((g) => `<button class="gopt g-${g.id}" role="radio" aria-checked="${st.g === g.id}" data-g2="${g.id}"><i>${ic(g.icon)}</i><span><b>${g.label}</b><small>${g.sub}</small></span></button>`).join('')}</div></div>
          ${fs.map((f) => inputFor(f, st.vals[f.id])).join('')}
          <p class="help" style="margin-top:18px">Everything except the name is optional, and more fields are in the record once it’s added.</p>
        </div>
        <div class="sheet-foot"><span class="sp"></span><button class="btn" data-x>Cancel</button><button class="cta" data-ok>Add company</button></div>`;
      const f = sh.querySelector(focus || '#nc-name'); if (f) f.focus();
    }
    paint();
    sh.addEventListener('input', (e) => {
      if (e.target.id === 'nc-name') { st.name = e.target.value; if (st.err && st.name.trim()) { st.err = null; paint('#nc-name'); const i = sh.querySelector('#nc-name'); i.setSelectionRange(i.value.length, i.value.length); } return; }
      const k = e.target.dataset.fv; if (k) st.vals[k] = field(k).kind === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : (e.target.value || (field(k).kind === 'date' ? null : ''));
    });
    sh.addEventListener('keydown', (e) => { if (e.target.id === 'nc-name' && e.key === 'Enter') { e.preventDefault(); submit(); } });
    sh.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-x]')) { P.closeTop(); return; }
      const g = t.closest('[data-g2]'); if (g) { st.g = g.dataset.g2; paint(`[data-g2="${st.g}"]`); return; }
      const m = t.closest('[data-multi]');
      if (m) { const k = m.dataset.multi; const cur = new Set(st.vals[k] || []); if (cur.has(m.dataset.o)) cur.delete(m.dataset.o); else cur.add(m.dataset.o); st.vals[k] = optsOf(field(k)).map((o) => o.id).filter((id) => cur.has(id)); m.setAttribute('aria-pressed', String(cur.has(m.dataset.o))); return; }
      if (t.closest('[data-ok]')) submit();
    });
    function submit() {
      const name = st.name.trim();
      if (!name) { st.err = 'name'; paint('#nc-name'); return; }
      if (blocked('The company')) return;
      const base = { contact: '', type: '', status: '', answer: '', prio: '', products: '', reason: '', outreach: null, last: null, target: null, next: '', trial: '', industry: '', source: '', notes: '' };
      const c = Object.assign(base, st.vals, { id: 'co' + Date.now(), name, short: P.initials(name).slice(0, 2), stage: st.g });
      if (st.g === 'done') c.status = 'won';
      P.db.companies.unshift(c);
      P.closeTop();
      ui.g = st.g; ui.q = ''; ui.prio = ''; ui.product = ''; ui.status = ''; ui.act = '';
      flashCo.add(c.id); P.render();
      P.toast(`${name} added to ${G(st.g).label}`, { action: 'Open', onAction: () => openRecord(c.id) });
    }
  }

  /* ---------- Fields (C1, C2) ---------- */
  function openFields(g0, init) {
    const st = { g: g0 || ui.g, adding: init && init.adding ? { name: '', kind: init.adding, opts: [{ label: 'Yes', color: 'green' }, { label: 'No', color: 'slate' }] } : null, renaming: null, err: null };
    const scrim = P.el('<div class="scrim"></div>');
    const sh = P.el('<section class="sheet co-sheet" role="dialog" aria-modal="true" aria-labelledby="fl-h"></section>');
    scrim.addEventListener('click', () => P.closeTop());
    P.layer([scrim, sh], { onClose: () => P.render() });
    const nameTaken = (name, except) => groupFields(st.g).some((f) => f !== except && f.label.trim().toLowerCase() === name.trim().toLowerCase()) || name.trim().toLowerCase() === 'company name';
    function paint(focus) {
      const g = G(st.g);
      const list = P.db.coShown[st.g];
      const gf = groupFields(st.g).slice().sort((a, b) => {
        const ia = list.indexOf(a.id); const ib = list.indexOf(b.id);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });
      const frow = (f) => {
        const on = list.includes(f.id);
        const name = st.renaming === f.id
          ? `<div class="fren${st.err ? ' field has-err' : ''}"><input class="input" data-ren="${f.id}" value="${esc(st.renVal != null ? st.renVal : f.label)}" aria-label="New name for ${esc(f.label)}">${st.err ? `<p class="err-msg">${ic('alert')}${st.err}</p>` : ''}<div class="fren-acts"><button class="btn sm" data-fx="ren-cancel">Cancel</button><button class="cta sm" data-fx="ren-save">Save</button></div></div>`
          : `<div class="fname"><b>${esc(f.label)}</b><small>${ic(KIND_ICON[f.kind])}${KIND_LABEL[f.kind]}${f.own ? '<span class="own">Added by the team</span>' : ''}${f.kind === 'choice' || f.kind === 'multi' ? ` · ${plural(optsOf(f).length, 'option')}` : ''}</small></div>`;
        return `<div class="frow${on ? '' : ' off'}">
          <button class="switch" role="switch" aria-checked="${on}" data-show="${f.id}" aria-label="Show ${esc(f.label)} in the ${esc(g.label)} list"><i></i></button>
          ${name}
          ${st.renaming === f.id ? '' : `<div class="facts">${f.kind === 'choice' || f.kind === 'multi' ? `<button class="btn sm quiet" data-fx="opts" data-f="${f.id}">${ic('choice')}<span>Options</span></button>` : ''}<button class="icon-btn" data-fx="ren" data-f="${f.id}" aria-label="Rename ${esc(f.label)}" title="Rename">${ic('edit')}</button>${f.own ? `<button class="icon-btn red" data-fx="rm" data-f="${f.id}" aria-label="Remove ${esc(f.label)}" title="Remove">${ic('trash')}</button>` : ''}</div>`}
        </div>`;
      };
      const add = st.adding;
      const addHTML = add
        ? `<div class="fadd">
            <div class="field${st.err && !st.renaming ? ' has-err' : ''}" style="margin-top:0"><label for="fa-name">Field name</label><input class="input" id="fa-name" value="${esc(add.name)}" placeholder="Like “Decision maker” or “Branches”" autocomplete="off">${st.err && !st.renaming ? `<p class="err-msg">${ic('alert')}${st.err}</p>` : ''}</div>
            <div class="field"><span class="lbl" id="fa-k">Kind</span><div class="chips" role="radiogroup" aria-labelledby="fa-k">${['text', 'long', 'number', 'date', 'choice'].map((k) => `<button class="chip" role="radio" aria-checked="${add.kind === k}" aria-pressed="${add.kind === k}" data-kind="${k}">${ic(KIND_ICON[k])}${KIND_LABEL[k]}</button>`).join('')}</div></div>
            ${add.kind === 'choice' ? `<div class="field"><span class="lbl">Options <span class="opt">add as many as you need; more can come later</span></span><div class="fa-opts">${add.opts.map((o, i) => `<span class="ochip" style="--ob:${COLORS[o.color][0]};--of:${COLORS[o.color][1]}">${esc(o.label)}<button data-fx="fa-rmopt" data-i="${i}" aria-label="Remove ${esc(o.label)}">${ic('x')}</button></span>`).join('')}<input class="input sm" id="fa-opt" placeholder="Type an option, then Enter" autocomplete="off"></div></div>` : ''}
            <div class="fadd-acts"><span class="sp"></span><button class="btn" data-fx="add-cancel">Cancel</button><button class="cta" data-fx="add-save">Add field</button></div></div>`
        : `<button class="more-details" data-fx="add">${ic('plus')}<span>Add a field</span><span class="sp"></span><small>Short text, long text, number, date or choice</small></button>`;
      sh.innerHTML = `<span class="grab" aria-hidden="true"></span><div class="sheet-head"><h2 id="fl-h">Fields</h2><span class="sp"></span><button class="icon-btn" data-x aria-label="Close">${ic('x')}</button></div>
        <div class="sheet-body">
          <div class="seg full fl-seg" role="group" aria-label="Group of companies">${GROUPS.map((x) => `<button aria-pressed="${st.g === x.id}" data-fg="${x.id}">${x.label}</button>`).join('')}</div>
          <p class="fl-intro">Switch on what the <b>${g.label}</b> list shows. Every field stays in each company’s record, and exports use the fields shown here. Changes apply for everyone on the team.</p>
          <div class="flist"><div class="frow fixed"><span class="switch" aria-hidden="true" aria-checked="true"><i></i></span><div class="fname"><b>Company name</b><small>${ic('lock')}Always shown, and the only required field</small></div></div>${gf.map(frow).join('')}</div>
          ${addHTML}
          ${fields().some((f) => f.own && !f.groups.length) ? `<p class="help">${plural(fields().filter((f) => f.own && !f.groups.length).length, 'removed field')} still ${fields().filter((f) => f.own && !f.groups.length).length === 1 ? 'has' : 'have'} stored values. They aren’t shown anywhere.</p>` : ''}
        </div>
        <div class="sheet-foot"><span class="saved">${ic('done')}Saved as you go.</span><span class="sp"></span><button class="cta" data-x>Done</button></div>`;
      const f = focus ? sh.querySelector(focus) : null;
      if (f) { f.focus(); if (f.setSelectionRange && f.value) f.setSelectionRange(f.value.length, f.value.length); }
    }
    paint();
    sh.querySelector('[data-x]').focus();
    sh.addEventListener('input', (e) => {
      if (e.target.id === 'fa-name') { st.adding.name = e.target.value; if (st.err) { st.err = null; paint('#fa-name'); } }
      if (e.target.dataset.ren) st.renVal = e.target.value;
    });
    sh.addEventListener('keydown', (e) => {
      if (e.target.id === 'fa-opt' && e.key === 'Enter') {
        e.preventDefault(); const v = e.target.value.trim(); if (!v) return;
        if (!st.adding.opts.some((o) => o.label.toLowerCase() === v.toLowerCase())) st.adding.opts.push({ label: v, color: Object.keys(COLORS)[st.adding.opts.length % 9] });
        paint('#fa-opt');
      }
      if (e.target.id === 'fa-name' && e.key === 'Enter') { e.preventDefault(); sh.querySelector('[data-fx="add-save"]').click(); }
      if (e.target.dataset.ren && e.key === 'Enter') { e.preventDefault(); sh.querySelector('[data-fx="ren-save"]').click(); }
      if (e.target.dataset.ren && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); st.renaming = null; st.err = null; paint(); }
    });
    sh.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-x]')) { P.closeTop(); return; }
      const sg = t.closest('[data-fg]'); if (sg) { st.g = sg.dataset.fg; st.adding = null; st.renaming = null; st.err = null; paint(`[data-fg="${st.g}"]`); return; }
      const sw = t.closest('[data-show]');
      if (sw) {
        if (blocked('The change')) return;
        const id = sw.dataset.show; const list = P.db.coShown[st.g];
        if (list.includes(id)) P.db.coShown[st.g] = list.filter((x) => x !== id); else list.push(id);
        paint(`[data-show="${id}"]`); P.render(); return;
      }
      const k = t.closest('[data-kind]'); if (k) { st.adding.kind = k.dataset.kind; paint(`[data-kind="${k.dataset.kind}"]`); return; }
      const fx = t.closest('[data-fx]'); if (!fx) return;
      const a = fx.dataset.fx; const f = fx.dataset.f ? field(fx.dataset.f) : null;
      if (a === 'add') { st.adding = { name: '', kind: 'text', opts: [] }; st.err = null; st.renaming = null; paint('#fa-name'); }
      if (a === 'add-cancel') { st.adding = null; st.err = null; paint(); }
      if (a === 'fa-rmopt') { st.adding.opts.splice(+fx.dataset.i, 1); paint('#fa-opt'); }
      if (a === 'add-save') {
        const name = st.adding.name.trim();
        if (!name) { st.err = 'Give the field a name.'; paint('#fa-name'); return; }
        if (nameTaken(name)) { st.err = `${G(st.g).label} already has a field called “${esc(name)}”.`; paint('#fa-name'); return; }
        if (blocked('The field')) return;
        const id = 'own' + Date.now();
        P.db.coFields.push({ id, label: name, kind: st.adding.kind, groups: [st.g], own: true });
        if (st.adding.kind === 'choice') P.db.coOptions[id] = st.adding.opts.map((o, i) => ({ id: 'o' + i + Date.now(), label: o.label, color: o.color }));
        P.db.coShown[st.g].push(id);
        st.adding = null; paint(`[data-show="${id}"]`); P.render();
        P.toast(`“${name}” added to ${G(st.g).label}, and shown in its list`);
      }
      if (a === 'ren') { st.renaming = f.id; st.renVal = f.label; st.err = null; st.adding = null; paint(`[data-ren="${f.id}"]`); }
      if (a === 'ren-cancel') { st.renaming = null; st.err = null; paint(); }
      if (a === 'ren-save') {
        const fld = field(st.renaming); const name = (st.renVal || '').trim();
        if (!name) { st.err = 'A field needs a name.'; paint(`[data-ren="${fld.id}"]`); return; }
        if (nameTaken(name, fld)) { st.err = `There’s already a field called “${esc(name)}”.`; paint(`[data-ren="${fld.id}"]`); return; }
        if (blocked('The new name')) return;
        const old = fld.label; fld.label = name; st.renaming = null; st.err = null; paint(); P.render();
        if (old !== name) P.toast(`Renamed to “${name}” everywhere`);
      }
      if (a === 'opts') openOptions(f.id);
      if (a === 'rm') {
        const used = P.db.companies.filter((c) => !isEmpty(c[f.id])).length;
        P.confirm({ title: `Remove “${f.label}”?`, body: `It disappears from ${G(st.g).label}, its list and its records. ${used ? `The values already entered for ${plural(used, 'company', 'companies')} stay stored.` : 'No company has a value in it yet.'}`, ok: 'Remove field', onOk: () => {
          if (blocked('The change')) return;
          f.groups = f.groups.filter((x) => x !== st.g); P.db.coShown[st.g] = P.db.coShown[st.g].filter((x) => x !== f.id);
          paint(); P.render(); P.toast(`“${f.label}” removed from ${G(st.g).label}`);
        } });
      }
    });
  }

  /* ---------- Options (C3) ---------- */
  function openOptions(fid) {
    const f = field(fid);
    const st = { err: null, errId: null, newLabel: '', newColor: 'blue' };
    const scrim = P.el('<div class="scrim top"></div>');
    const d = P.el('<div class="dialog wide over-sheet" role="dialog" aria-modal="true" aria-labelledby="op-h"></div>');
    scrim.addEventListener('click', () => P.closeTop());
    P.layer([scrim, d], { onClose: () => P.render() });
    const usedBy = (o) => P.db.companies.filter((c) => (f.kind === 'multi' ? (c[fid] || []).includes(o.id) : c[fid] === o.id)).length;
    function paint(focus) {
      const os = optsOf(f);
      const locked = os.filter((o) => o.lock);
      d.innerHTML = `<h2 id="op-h">${esc(f.label)} options</h2>
        <p>Renaming changes it on every company that uses it. Removing clears it from them.</p>
        ${locked.length ? `<div class="notice" style="margin:14px 0 0">${ic('lock')}<div><p>${locked.map((o) => `<b>${esc(o.label)}</b>`).join(' and ')} can’t be renamed or removed: the groups and the figures depend on ${locked.length === 1 ? 'it' : 'them'}. ${locked.length === 1 ? 'Its' : 'Their'} colour can change.</p></div></div>` : ''}
        <div class="olist">${os.map((o) => {
          const n = usedBy(o);
          return `<div class="orow${st.errId === o.id ? ' has-err' : ''}"><button class="swb" data-col="${esc(o.id)}" aria-label="Colour of ${esc(o.label)}: ${COLOR_NAMES[o.color] || 'Grey'}. Change">${swatch(o.color)}</button>
            ${o.lock ? `<span class="olock"><b>${esc(o.label)}</b><small>${ic('lock')}${esc(o.lock)}</small></span>` : `<input class="input sm" data-oren="${esc(o.id)}" value="${esc(o.label)}" aria-label="Rename ${esc(o.label)}">`}
            <span class="ocount">${n ? plural(n, 'company', 'companies') : 'Not used'}</span>
            ${o.lock ? '<span class="orm-sp"></span>' : `<button class="icon-btn" data-orm="${esc(o.id)}" aria-label="Remove ${esc(o.label)}">${ic('trash')}</button>`}</div>${st.errId === o.id ? `<p class="err-msg">${ic('alert')}${st.err}</p>` : ''}`;
        }).join('')}</div>
        <div class="orow add${st.errId === '+new' ? ' has-err' : ''}"><button class="swb" data-col="+new" aria-label="Colour for the new option: ${COLOR_NAMES[st.newColor]}. Change">${swatch(st.newColor)}</button><input class="input sm" id="op-new" value="${esc(st.newLabel)}" placeholder="New option" autocomplete="off"><button class="btn sm" data-oadd>${ic('plus')}Add</button></div>
        ${st.errId === '+new' ? `<p class="err-msg">${ic('alert')}${st.err}</p>` : ''}
        <p class="help">To clear one company’s choice, open the company and choose Clear.</p>
        <div class="acts"><button class="cta" data-x>Done</button></div>`;
      const el = focus ? d.querySelector(focus) : null; if (el) el.focus();
    }
    paint();
    const tryRename = (input) => {
      const o = opt(f, input.dataset.oren); const name = input.value.trim();
      if (name === o.label) { if (st.errId === o.id) { st.err = null; st.errId = null; paint(); } return; }
      if (!name) { st.err = 'An option needs a name. Remove it instead if it isn’t needed.'; st.errId = o.id; paint(`[data-oren="${o.id}"]`); return; }
      if (optsOf(f).some((x) => x !== o && x.label.toLowerCase() === name.toLowerCase())) { st.err = `There’s already an option called “${esc(name)}”.`; st.errId = o.id; paint(`[data-oren="${o.id}"]`); return; }
      if (blocked('The new name')) { input.value = o.label; return; }
      const n = usedBy(o); o.label = name; st.err = null; st.errId = null; paint(); P.render();
      P.toast(n ? `Renamed. ${plural(n, 'company', 'companies')} now show “${name}”` : `Renamed to “${name}”`);
    };
    d.addEventListener('change', (e) => { if (e.target.dataset.oren) tryRename(e.target); });
    d.addEventListener('input', (e) => { if (e.target.id === 'op-new') st.newLabel = e.target.value; });
    d.addEventListener('keydown', (e) => {
      if (e.target.dataset.oren && e.key === 'Enter') { e.preventDefault(); tryRename(e.target); }
      if (e.target.id === 'op-new' && e.key === 'Enter') { e.preventDefault(); d.querySelector('[data-oadd]').click(); }
    });
    d.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-x]')) { P.closeTop(); return; }
      const col = t.closest('[data-col]');
      if (col) {
        const id = col.dataset.col;
        P.menu(col, `<h4>Colour</h4><div class="palette">${Object.keys(COLORS).map((c) => `<button data-v="${c}" aria-label="${COLOR_NAMES[c]}" title="${COLOR_NAMES[c]}">${swatch(c)}</button>`).join('')}</div>`, (c) => {
          if (id === '+new') { st.newColor = c; paint('#op-new'); return; }
          if (blocked('The colour')) return;
          opt(f, id).color = c; paint(`[data-col="${id}"]`); P.render();
        });
        return;
      }
      const rm = t.closest('[data-orm]');
      if (rm) {
        const o = opt(f, rm.dataset.orm); const n = usedBy(o);
        P.confirm({ title: `Remove “${o.label}”?`, body: n ? `It will be cleared from the ${plural(n, 'company', 'companies')} that use it.` : 'No company uses it.', ok: 'Remove option', onOk: () => {
          if (blocked('The change')) return;
          P.db.coOptions[fid] = optsOf(f).filter((x) => x !== o);
          P.db.companies.forEach((c) => { if (f.kind === 'multi') { if ((c[fid] || []).includes(o.id)) c[fid] = c[fid].filter((x) => x !== o.id); } else if (c[fid] === o.id) c[fid] = ''; });
          if (ui[fid] === o.id) ui[fid] = '';
          paint(); P.render(); P.toast(n ? `“${o.label}” removed and cleared from ${plural(n, 'company', 'companies')}` : `“${o.label}” removed`);
        } });
        return;
      }
      if (t.closest('[data-oadd]')) {
        const name = st.newLabel.trim();
        if (!name) { st.err = 'Type the new option first.'; st.errId = '+new'; paint('#op-new'); return; }
        if (optsOf(f).some((x) => x.label.toLowerCase() === name.toLowerCase())) { st.err = `There’s already an option called “${esc(name)}”.`; st.errId = '+new'; paint('#op-new'); return; }
        if (blocked('The option')) return;
        const os = optsOf(f); const o = { id: 'o' + Date.now(), label: name, color: st.newColor, lock: null };
        const lockAt = os.findIndex((x) => x.lock); if (lockAt >= 0) os.splice(lockAt, 0, o); else os.push(o);
        st.newLabel = ''; st.err = null; st.errId = null; st.newColor = Object.keys(COLORS)[(os.length + 1) % 9]; paint('#op-new'); P.render();
        P.toast(`“${name}” added`);
      }
    });
  }

  /* ---------- Export (E1) ---------- */
  function openExport() {
    const fs = shown(ui.g); const g = G(ui.g);
    const n = lastSorted.length;
    const scrim = P.el('<div class="scrim top"></div>');
    const d = P.el('<div class="dialog over-sheet" role="dialog" aria-modal="true" aria-labelledby="ex-h"></div>');
    scrim.addEventListener('click', () => P.closeTop());
    P.layer([scrim, d]);
    const file = `companies-${g.label.toLowerCase().replace(/[^a-z]+/g, '-')}-${P.iso(0)}.csv`;
    d.innerHTML = `<h2 id="ex-h">Export ${esc(g.label)}</h2>
      <p>${n ? `<b>${nounOf(ui.g, n)}</b>${filtersOn() ? ', as filtered now' : ''}, in the current order, with the ${plural(fs.length + 1, 'field')} the list shows:` : 'No companies are shown right now, so there’s nothing to export. Clear the filters or pick another group.'}</p>
      ${n ? `<div class="ex-fields"><span>Company</span>${fs.map((f) => `<span>${esc(f.label)}</span>`).join('')}</div>
      <div class="ex-file">${ic('download')}<div><b>${esc(file)}</b><small>A comma-separated spreadsheet file. It opens in Excel, Numbers and Google Sheets.</small></div></div>` : ''}
      <div class="acts"><button class="btn" data-x>Cancel</button><button class="cta" data-ok${n ? '' : ' disabled'}>${ic('download')}Download</button></div>`;
    d.querySelector(n ? '[data-ok]' : '[data-x]').focus();
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) P.closeTop();
      if (e.target.closest('[data-ok]')) {
        const cellTxt = (s) => { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        const rows = [['Company', ...fs.map((f) => f.label)]].concat(lastSorted.map((c) => [c.name, ...fs.map((f) => (f.kind === 'date' && c[f.id] ? c[f.id] : textOf(c, f)))]));
        const blob = new Blob(['﻿' + rows.map((r) => r.map(cellTxt).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file; document.body.appendChild(a); a.click(); a.remove();
        P.closeTop(); P.toast(`Downloaded ${file}`);
      }
    });
  }

  /* ---------- Menus ---------- */
  function openMenu(key, btn) {
    if (key === 'product') {
      const list = productList(ui.g); const cur = ui.product.toLowerCase();
      return P.menu(btn, `<h4>Product</h4>${P.mi('', 'Any product', !cur)}${list.slice(0, 60).map((p) => `<button class="mi" role="menuitemradio" data-v="${esc(p.name)}" aria-checked="${cur === p.name.toLowerCase()}"><span class="mi-t">${esc(p.name)}</span><small class="mi-note">${num(p.n)}</small>${ic('check', 'tick')}</button>`).join('')}${list.length > 60 ? `<p class="foot">Showing the 60 most used of ${num(list.length)}. Search finds the rest.</p>` : ''}${list.length ? '' : '<p class="foot">No products written down in this group yet.</p>'}`, (v) => { ui.product = v; ui.limit = 100; render(); });
    }
    if (key === 'status' || key === 'prio') {
      const f = field(key); const cur = ui[key];
      return P.menu(btn, `<h4>${esc(f.label)}</h4>${P.mi('', 'Any', !cur)}${optsOf(f).filter((o) => o.id !== 'won').map((o) => `<button class="mi" role="menuitemradio" data-v="${esc(o.id)}" aria-checked="${cur === o.id}">${chip(o)}${ic('check', 'tick')}</button>`).join('')}${P.mi('-', 'None set', cur === '-')}`, (v) => { ui[key] = v; ui.limit = 100; render(); });
    }
    if (key === 'sort') {
      const k = sortKey(); const d = sortDir(); const dl = dirLabels(k);
      const keys = ['name', ...groupFields(ui.g).map((f) => f.id)];
      return P.menu(btn, `<h4>Sort by</h4>${keys.map((x) => P.mi('k:' + x, esc(sortLabel(x)), k === x)).join('')}<hr>${P.mi('d:asc', dl[0], d === 'asc')}${P.mi('d:desc', dl[1], d === 'desc')}<p class="foot">Companies without a value always go last. ${ui.g === 'lead' ? 'Normally: planned outreach, soonest first.' : 'Normally: most recent action first.'}</p>`, (v) => {
        const [t, x] = v.split(':');
        if (t === 'k') { ui.sort = x; ui.dir = ''; } else { ui.sort = k; ui.dir = x; }
        render();
      });
    }
  }

  /* ---------- Events ---------- */
  P.$('#app').addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-new]')) { openNew(); return; }
    const gt = t.closest('[data-g]');
    // Switching group keeps the search (B8) but drops filters that belong to the old group.
    if (gt) { ui.g = gt.dataset.g; ui.limit = 100; ui.prio = ''; ui.product = ''; ui.status = ''; ui.act = ''; ui.sort = ''; render(); return; }
    const af = t.closest('[data-act-f]'); if (af) { ui.act = ui.act === af.dataset.actF ? '' : af.dataset.actF; ui.limit = 100; render(); return; }
    const clr = t.closest('[data-clear]'); if (clr) { e.stopPropagation(); ui[clr.dataset.clear] = ''; render(); return; }
    const mb = t.closest('[data-menu]'); if (mb) { openMenu(mb.dataset.menu, mb); return; }
    if (t.closest('[data-clearall]')) { ui.q = ''; ui.prio = ''; ui.product = ''; ui.status = ''; ui.act = ''; render(); return; }
    if (t.closest('[data-fields]')) { openFields(ui.g); return; }
    if (t.closest('[data-export]')) { openExport(); return; }
    if (t.closest('[data-more]')) { ui.limit += 100; render(); return; }
    const s = t.closest('[data-sort]'); if (s) { const key = s.dataset.sort; if (sortKey() === key) { ui.sort = key; ui.dir = sortDir() === 'asc' ? 'desc' : 'asc'; } else { ui.sort = key; ui.dir = ''; } render(); return; }
    const rm = t.closest('[data-rowmenu]'); if (rm) { rowMenu(rm, P.company(rm.dataset.rowmenu)); return; }
    const ed = t.closest('[data-edit]'); if (ed) { const c = P.company(ed.dataset.co); editField(ed, c, field(ed.dataset.edit)); return; }
    const ol = t.closest('[data-openlink]'); if (ol) { e.preventDefault(); openRecord(ol.dataset.openlink); return; }
    const r = t.closest('[data-open]'); if (r) openRecord(r.dataset.open);
  });
  let qTimer;
  P.$('#app').addEventListener('input', (e) => {
    if (!e.target.matches('[data-q]')) return;
    ui.q = e.target.value; ui.limit = 100;
    clearTimeout(qTimer);
    const mobile = !!e.target.closest('.m-search');
    qTimer = setTimeout(() => { render(); const i = P.$(mobile ? '.m-search input' : '.bar .search input'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 180);
  });

  P.boot({
    page: 'companies', render,
    states: [['', 'Normal'], ['empty', 'Nothing yet (no companies)'], ['empty-group', 'One group empty (No or not now)'], ['loading', 'Loading'], ['offline', 'No connection'], ['offline-empty', 'No connection, nothing loaded'], ['task-fail', 'Creating a follow-up task fails'], ['live', 'Live change from a colleague']],
    opens: [['record', 'Company record (Active)'], ['record-cold', 'Record: gone cold, target missed'], ['record-lead', 'Record: to approach'], ['record-hold', 'Record: no or not now'], ['new', 'New company'], ['new-required', 'New company: name missing'], ['edit-status', 'Quick edit: status'], ['edit-date', 'Quick edit: target date'], ['edit-text', 'Quick edit: next actions'], ['move', 'Move to another group'], ['move-hold', 'Move to No or not now'], ['followup', 'Follow-up task created'], ['delete', 'Delete a company'], ['fields', 'Fields'], ['field-new', 'Add a field (choice)'], ['field-remove', 'Remove an own field'], ['options', 'Status options'], ['option-remove', 'Remove an option'], ['export', 'Export'], ['sort', 'Sort menu'], ['row-menu', 'Row menu'], ['more', 'Phone: More']],
    afterBoot() {
      if (coParam && P.company(coParam)) openRecord(coParam);
      if (P.state === 'live') setTimeout(() => {
        liveCo = new Set();
        const c = P.company('pel') || P.db.companies.find((x) => x.stage === 'active');
        if (c) { c.status = 'nego'; c.last = P.iso(0); liveCo.add(c.id); flashCo.add(c.id); }
        const n = { id: 'live1', name: 'Cendana Hotels', short: 'CH', stage: ui.g, contact: 'Nadia Putri', type: 'client', status: ui.g === 'active' ? 'meet' : '', answer: ui.g === 'hold' ? 'later' : '', prio: 'medium', products: 'Point of sale', reason: '', outreach: null, last: P.iso(0), target: P.iso(9), next: '', trial: '', industry: 'Hospitality', source: 'Referral', notes: '' };
        P.db.companies.unshift(n); liveCo.add(n.id); flashCo.add(n.id);
        P.render();
      }, 1200);
    },
    onOpen(o) {
      const first = (g) => lastSorted[0] || P.db.companies.find((c) => c.stage === g);
      const pick = (id, g) => P.company(id) || P.db.companies.find((c) => c.stage === g);
      if (o === 'record') openRecord(pick('hal', 'active').id);
      if (o === 'record-cold') openRecord(pick('sem', 'active').id);
      if (o === 'record-lead') { ui.g = 'lead'; render(); openRecord(pick('bal', 'lead').id); }
      if (o === 'record-hold') { ui.g = 'hold'; render(); openRecord(pick('jas', 'hold').id); }
      if (o === 'new') openNew();
      if (o === 'new-required') openNew({ err: 'name' });
      const cellOf = (fid) => P.$(`.crow [data-edit="${fid}"]`);
      if (o === 'edit-status') { const b = cellOf('status'); if (b) editField(b, P.company(b.dataset.co), field('status')); }
      if (o === 'edit-date') { const b = cellOf('target'); if (b) editField(b, P.company(b.dataset.co), field('target')); }
      if (o === 'edit-text') { const b = cellOf('next'); if (b) editField(b, P.company(b.dataset.co), field('next')); }
      if (o === 'move') openMove(pick('lum', 'lead'), 'active');
      if (o === 'move-hold') openMove(pick('hal', 'active'), 'hold');
      if (o === 'followup') followUp(first(ui.g));
      if (o === 'delete') deleteCo(pick('hal', 'active'));
      if (o === 'fields') openFields(ui.g);
      if (o === 'field-new') openFields(ui.g, { adding: 'choice' });
      if (o === 'field-remove') { openFields(ui.g); const b = P.$('[data-fx="rm"]'); if (b) b.click(); }
      if (o === 'options') openOptions('status');
      if (o === 'option-remove') { openOptions('status'); const b = P.$('[data-orm]'); if (b) b.click(); }
      if (o === 'export') openExport();
      if (o === 'sort') { const b = P.$('[data-menu="sort"]'); if (b) openMenu('sort', b); }
      if (o === 'row-menu') { const b = P.$('[data-rowmenu]'); if (b) rowMenu(b, P.company(b.dataset.rowmenu)); }
    },
  });
})();
