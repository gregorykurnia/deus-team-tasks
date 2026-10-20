/* Past clients: the long-term record of every company we've served. Subsidiaries sit under parent companies, umbrella
   parents are kept but not counted, client totals, the breakdown by sector, search and order, export (R1 to R9, E1). */
(function () {
  const { ic, esc, num, plural } = P;
  const q = P.qs;
  if (!P.db.past) P.db.past = [];
  if (P.state === 'one-parent') P.db.past = P.db.past.filter((x) => x.id === 'p3' || x.parent === 'p3');
  if (P.state === 'umbrella-only') P.db.past = P.db.past.filter((x) => x.id === 'p2').map((x) => Object.assign({}, x));

  const ui = {
    q: q.get('q') || '', sec: q.get('sec') || '', nc: q.has('nc'), sort: q.get('sort') || 'name-asc', mview: q.get('view') === 'sectors' ? 'sectors' : 'list',
    open: new Set((q.get('x') || '').split(',').filter(Boolean)), closed: new Set(), full: new Set(), subLimit: {}, limit: 100, secAll: false, recovered: false,
  };
  const flash = new Set(); const live = new Set();
  const coll = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  const SUBS = (n) => plural(n, 'subsidiary', 'subsidiaries');
  const PARENTS = (n) => plural(n, 'parent company', 'parent companies');

  /* ---------- Sectors: one sector whatever the spelling (R6) ---------- */
  const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ');
  const norm = (s) => clean(s).toLowerCase();
  function sectors() {
    const m = new Map();
    P.db.past.forEach((x) => {
      const k = norm(x.sector); if (!k) return;
      let s = m.get(k); if (!s) { s = { key: k, n: 0, sp: {} }; m.set(k, s); }
      s.n++; const c = clean(x.sector); s.sp[c] = (s.sp[c] || 0) + 1;
    });
    // The spelling most companies use is the one shown; on a tie, the capitalised one.
    m.forEach((s) => { s.label = Object.entries(s.sp).sort((a, b) => b[1] - a[1] || (/^\p{Lu}/u.test(b[0]) - /^\p{Lu}/u.test(a[0])) || coll.compare(a[0], b[0]))[0][0]; });
    return m;
  }
  let S = sectors();
  const secLabel = (s) => { const x = S.get(norm(s)); return x ? x.label : clean(s); };
  const canon = (typed) => { const k = norm(typed); if (!k) return ''; const x = S.get(k); return x ? x.label : clean(typed); };

  /* ---------- Records, totals and the breakdown (R3, R4, R5) ---------- */
  const rec = (id) => P.db.past.find((x) => x.id === id) || null;
  function index() {
    const parents = []; const subsOf = new Map();
    P.db.past.forEach((x) => { if (!x.parent) parents.push(x); else { if (!subsOf.has(x.parent)) subsOf.set(x.parent, []); subsOf.get(x.parent).push(x); } });
    subsOf.forEach((l) => l.sort((a, b) => coll.compare(a.name, b.name)));
    return { parents, subsOf };
  }
  let IX = index();
  const subsOf = (id) => IX.subsOf.get(id) || [];
  function refresh() { S = sectors(); IX = index(); }
  function totals() {
    const parents = IX.parents.length; const subs = P.db.past.length - parents;
    const counted = IX.parents.filter((x) => x.counted).length;
    return { parents, subs, counted, excluded: parents - counted, total: counted + subs };
  }
  function breakdown() {
    const m = new Map(); let none = 0;
    P.db.past.forEach((x) => { if (!x.parent && !x.counted) return; const k = norm(x.sector); if (!k) { none++; return; } m.set(k, (m.get(k) || 0) + 1); });
    const rows = Array.from(m, ([k, n]) => ({ k, label: S.get(k).label, n })).sort((a, b) => b.n - a.n || coll.compare(a.label, b.label));
    return { rows, none, total: rows.reduce((a, r) => a + r.n, 0) + none };
  }
  const pct = (n, t) => { const v = (n / t) * 100; return v > 0 && v < 1 ? '<1%' : Math.round(v) + '%'; };

  /* ---------- Search, filters and order (R7) ---------- */
  const qn = () => norm(ui.q);
  const hitQ = (x) => !ui.q || norm(x.name).includes(qn()) || norm(x.sector).includes(qn()) || norm(secLabel(x.sector)).includes(qn());
  const hitSec = (x) => !ui.sec || (ui.sec === '-' ? !norm(x.sector) : norm(x.sector) === ui.sec);
  const hit = (x) => hitQ(x) && hitSec(x);
  const narrowing = () => !!(ui.q || ui.sec);
  const filtersOn = () => !!(ui.q || ui.sec || ui.nc);
  const SORTS = { 'name-asc': 'Name, A to Z', 'name-desc': 'Name, Z to A', 'subs-desc': 'Most subsidiaries first', 'subs-asc': 'Fewest subsidiaries first', 'sector-asc': 'Sector, A to Z', 'sector-desc': 'Sector, Z to A', 'counted-desc': 'Counted first', 'counted-asc': 'Not counted first' };
  function entries() {
    const out = [];
    IX.parents.forEach((p) => {
      if (ui.nc && p.counted) return;
      const subs = subsOf(p.id);
      const own = narrowing() ? hit(p) : true;
      const hits = narrowing() ? subs.filter(hit) : null;
      if (!own && !(hits && hits.length)) return;
      out.push({ p, subs, own, hits });
    });
    const [k, d] = ui.sort.split('-'); const s = d === 'asc' ? 1 : -1;
    const by = {
      name: (a, b) => s * coll.compare(a.p.name, b.p.name),
      subs: (a, b) => s * (a.subs.length - b.subs.length) || coll.compare(a.p.name, b.p.name),
      sector: (a, b) => { const x = secLabel(a.p.sector), y = secLabel(b.p.sector); if (!x !== !y) return x ? -1 : 1; return s * coll.compare(x, y) || coll.compare(a.p.name, b.p.name); },
      counted: (a, b) => s * (a.p.counted - b.p.counted) || coll.compare(a.p.name, b.p.name),
    }[k];
    return out.sort(by);
  }
  const isOpen = (e) => e.subs.length > 0 && !ui.closed.has(e.p.id) && (ui.open.has(e.p.id) || !!(e.hits && e.hits.length));
  function mark(text) {
    const t = String(text); const s = ui.q.trim();
    if (!s) return esc(t);
    const i = t.toLowerCase().indexOf(s.toLowerCase());
    if (i < 0) return esc(t);
    return `${esc(t.slice(0, i))}<mark>${esc(t.slice(i, i + s.length))}</mark>${esc(t.slice(i + s.length))}`;
  }
  function syncUrl() {
    const u = new URLSearchParams();
    if (ui.q) u.set('q', ui.q); if (ui.sec) u.set('sec', ui.sec); if (ui.nc) u.set('nc', '');
    if (ui.sort !== 'name-asc') u.set('sort', ui.sort);
    if (ui.mview === 'sectors') u.set('view', 'sectors');
    if (P.state) u.set('state', P.state);
    const s = u.toString().replace(/=(&|$)/g, '$1') + (P.stress ? (u.toString() ? '&' : '') + 'stress' : '');
    history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
  }

  /* ---------- Totals (R3, R4) ---------- */
  function hero() {
    if (P.loading) return `<section class="track glass" aria-label="Client totals"><div class="tr-main"><span class="skel" style="width:150px;height:14px"></span><span class="skel" style="width:140px;height:64px;margin-top:12px;border-radius:16px"></span><span class="skel" style="width:80%;height:14px;margin-top:16px"></span></div><div class="tr-figs">${[1, 2, 3].map((i) => `${i > 1 ? '<span class="op"></span>' : ''}<div class="fig"><span class="skel" style="width:50px;height:26px"></span><span class="skel" style="width:90%;height:11px;margin-top:6px"></span></div>`).join('')}</div></section>`;
    const t = totals();
    return `<section class="track glass" aria-label="Client totals">
      <div class="tr-main"><p class="tr-k">Clients we’ve served</p><p class="tr-n">${num(t.total)}</p>
        <p class="tr-s">${t.total ? `${PARENTS(t.counted)} and ${SUBS(t.subs)}.` : 'Nothing is counted yet.'}${t.excluded ? ` ${plural(t.excluded, 'umbrella company', 'umbrella companies')} ${t.excluded === 1 ? 'is' : 'are'} kept on record but not counted.` : ''}</p>
        <button class="btn sm" data-copy>${ic('copy')}Copy these figures</button></div>
      <div class="tr-figs" role="group" aria-label="How the total adds up">
        <div class="fig"><b>${num(t.counted)}</b><span>Parent companies counted</span></div><span class="op" aria-hidden="true">+</span>
        <div class="fig"><b>${num(t.subs)}</b><span>Subsidiaries</span></div><span class="op" aria-hidden="true">=</span>
        <div class="fig tot"><b>${num(t.total)}</b><span>Clients in total</span></div>
        <button class="fig nc" data-nc aria-pressed="${ui.nc}"${t.excluded ? '' : ' disabled'}><b>${num(t.excluded)}</b><span>Not counted<small>${t.excluded ? `Umbrella companies, on record for their subsidiaries. ${ui.nc ? 'Showing only these.' : 'Tap to see them.'}` : 'Every parent company counts.'}</small></span></button>
      </div></section>`;
  }

  /* ---------- Breakdown by sector (R5) ---------- */
  function sectorsPanel() {
    const head = (extra) => `<div class="sp-h"><h2>By sector</h2>${extra || ''}</div>`;
    if (P.loading) return `<section class="panel glass secpanel" aria-label="Clients by sector">${head()}${[90, 70, 55, 40, 30, 20].map((w) => `<div class="secr"><span class="skel" style="height:12px;width:${w + 20}px"></span><span></span><span></span><span class="sb"><i class="skel" style="width:${w}%"></i></span></div>`).join('')}</section>`;
    const b = breakdown();
    if (!b.total) return `<section class="panel glass secpanel" aria-label="Clients by sector">${head()}<div class="empty sm"><div class="art">${ic('archive')}</div><h3>No counted companies yet</h3><p>The breakdown counts every subsidiary and every parent company that’s counted. ${P.db.past.length ? 'Everything on record now is an umbrella company that isn’t counted.' : ''}</p></div></section>`;
    const max = Math.max(b.none, b.rows.length ? b.rows[0].n : 0);
    const row = (k, label, n, none) => `<button class="secr${none ? ' none' : ''}" data-sec="${esc(k)}" aria-pressed="${ui.sec === k}" title="${esc(label)}: ${num(n)} of ${num(b.total)}"><span class="sl">${esc(label)}</span><span class="sn">${num(n)}</span><span class="sv">${pct(n, b.total)}</span><span class="sb" aria-hidden="true"><i style="width:${(n / max) * 100}%"></i></span></button>`;
    const shown = ui.secAll ? b.rows : b.rows.slice(0, 8);
    return `<section class="panel glass secpanel" aria-label="Clients by sector">${head(`<span>${plural(b.rows.length, 'sector')}, largest first</span>`)}
      <div class="secs">${shown.map((r) => row(r.k, r.label, r.n)).join('')}</div>
      ${b.rows.length > 8 ? `<button class="link sec-all" data-secall>${ui.secAll ? `${ic('up')}Show the top 8` : `${ic('down')}Show all ${num(b.rows.length)} sectors`}</button>` : ''}
      ${b.none ? `<div class="secs sec-none">${row('-', 'No sector', b.none, true)}</div>` : ''}
      <div class="sp-tot"><span>Total</span><b>${num(b.total)}</b><small>The same as the client total: every counted company, in one sector each.</small></div>
      <p class="sp-hint">Tap a sector to see its companies.</p></section>`;
  }

  /* ---------- The record (R2, R7) ---------- */
  const secCell = (x) => `<button class="psec" data-sector="${x.id}" title="${x.sector ? 'Change the sector' : 'Add a sector'}">${x.sector ? `<span class="sec">${mark(secLabel(x.sector))}</span>` : '<span class="nosec">Add sector</span>'}</button>`;
  const liveTag = (x) => (live.has(x.id) ? '<span class="live-tag">Just added</span>' : '');
  function subRow(s, last) {
    return `<div class="srow${last ? ' last' : ''}${flash.has(s.id) || live.has(s.id) ? ' is-new' : ''}" data-row="${s.id}">
      <span class="branch" aria-hidden="true"></span>
      <div class="pname"><button class="pn" data-rename="${s.id}" title="Rename">${mark(s.name)}</button>${liveTag(s)}</div>
      ${secCell(s)}<span class="ps-sp"></span>
      <button class="icon-btn rmenu" data-smenu="${s.id}" aria-label="More for ${esc(s.name)}">${ic('more')}</button></div>`;
  }
  function subsBlock(e) {
    const p = e.p;
    const onlyHits = e.hits && e.hits.length && !ui.full.has(p.id);
    const list = onlyHits ? e.hits : e.subs;
    const shown = list.slice(0, ui.subLimit[p.id] || 50);
    return `<div class="subs" role="group" aria-label="Subsidiaries of ${esc(p.name)}">
      ${p.counted ? '' : `<p class="subs-note">${ic('info')}<span>${esc(p.name)} isn’t counted in the totals. Its ${SUBS(e.subs.length)} ${e.subs.length === 1 ? 'is' : 'are'}.</span></p>`}
      ${shown.map((s, i) => subRow(s, i === shown.length - 1)).join('')}
      ${list.length > shown.length ? `<div class="subs-more">Showing ${num(shown.length)} of ${num(list.length)}<button class="btn sm" data-sublim="${p.id}">Show ${num(Math.min(100, list.length - shown.length))} more</button></div>` : ''}
      ${onlyHits && e.subs.length > e.hits.length ? `<button class="link subs-all" data-full="${p.id}">Show its other ${SUBS(e.subs.length - e.hits.length)}</button>` : ''}
      <label class="subadd">${ic('plus')}<span class="sr">New subsidiary of ${esc(p.name)}</span><input data-subadd="${p.id}" placeholder="Add a subsidiary" autocomplete="off"><span class="hint">${p.sector ? `Sector: ${esc(secLabel(p.sector))} · ` : ''}Enter to add</span></label></div>`;
  }
  function parentRow(e) {
    const p = e.p; const n = e.subs.length; const open = isOpen(e);
    return `<div class="pgroup${open ? ' open' : ''}" data-pg="${p.id}">
      <div class="prow${p.counted ? '' : ' nc'}${flash.has(p.id) ? ' is-new' : ''}" data-row="${p.id}">
        <button class="chev" data-toggle="${p.id}" aria-expanded="${open}" ${n ? `aria-label="${open ? 'Hide' : 'Show'} the subsidiaries of ${esc(p.name)}"` : 'disabled aria-label="No subsidiaries"'}>${n ? ic(open ? 'down' : 'right') : ''}</button>
        <div class="pname"><span class="pmono" aria-hidden="true">${esc(P.initials(p.name))}</span><button class="pn" data-rename="${p.id}" title="Rename">${mark(p.name)}</button>${p.counted ? '' : `<button class="nctag" data-count="${p.id}" title="Not counted in the totals. Tap to change.">Not counted</button>`}</div>
        ${secCell(p)}
        <button class="psubs" data-toggle="${p.id}"${n ? '' : ' disabled'} tabindex="-1">${n ? `${ic('tree')}${SUBS(n)}` : '<span class="nosubs">None</span>'}</button>
        <button class="icon-btn rmenu" data-pmenu="${p.id}" aria-label="More for ${esc(p.name)}">${ic('more')}</button>
      </div>${open ? subsBlock(e) : ''}</div>`;
  }
  function emptyList() {
    const art = (i) => `<div class="art">${ic(i)}</div>`;
    const what = [ui.q ? `matches “${esc(ui.q)}”` : '', ui.sec ? `is in ${ui.sec === '-' ? 'no sector' : esc((S.get(ui.sec) || { label: ui.sec }).label)}` : '', ui.nc ? 'is left out of the count' : ''].filter(Boolean).join(' and ');
    return `<div class="empty">${art('search')}<h3>No past client ${what}</h3><p>${ui.q ? 'Search looks at the names of parent companies and subsidiaries, and at sectors.' : ''}</p><div class="acts"><button class="btn" data-clearall>Clear ${ui.q && !ui.sec && !ui.nc ? 'search' : 'filters'}</button></div></div>`;
  }
  function listPanel(list) {
    if (P.loading) return `<section class="panel glass plist" aria-label="Past clients">${P.state === 'offline-empty' ? '' : `<div class="loading-note"><span class="spin"></span>Loading past clients</div>${[1, 2, 3, 4, 5, 6].map(() => '<div class="skel-row" style="grid-template-columns:32px 36px 1fr 120px 100px"><span class="skel c1"></span><span class="skel c2" style="width:36px;height:36px"></span><div><span class="skel l1"></span></div><span class="skel c4"></span><span class="skel l1" style="width:100%"></span></div>').join('')}`}</section>`;
    const chip = (key, label, val) => `<span class="fbtn on"><button data-menu="${key}" aria-haspopup="menu">${label} <span class="v">${esc(val)}</span></button><button class="x" data-clear="${key}" aria-label="Clear the ${label.toLowerCase()} filter">${ic('x')}</button></span>`;
    const anyOpen = list.some(isOpen);
    const tools = `<div class="filters" role="toolbar" aria-label="Filter, order and export">
      ${ui.sec ? chip('sec', 'Sector', ui.sec === '-' ? 'None' : (S.get(ui.sec) || { label: ui.sec }).label) : `<button class="fbtn" data-menu="sec" aria-haspopup="menu">${ic('filter')}Sector${ic('down')}</button>`}
      ${ui.nc ? chip('nc', 'Showing', 'Not counted') : ''}
      <button class="fbtn" data-menu="sort" aria-haspopup="menu">${ic('sort')}<span class="v">${SORTS[ui.sort]}</span>${ic('down')}</button>
      <button class="fbtn" data-expand="${anyOpen ? 'none' : 'all'}">${ic(anyOpen ? 'up' : 'down')}${anyOpen ? 'Hide subsidiaries' : 'Show all subsidiaries'}</button>
      <span class="sp"></span><button class="fbtn" data-export>${ic('download')}Export</button></div>`;
    if (!list.length) return `<section class="panel glass plist" aria-label="Past clients">${tools}${emptyList()}</section>`;
    const subHits = list.reduce((a, e) => a + (e.hits ? e.hits.length : 0), 0);
    const ownHits = list.filter((e) => e.own).length;
    const t = totals();
    const line = narrowing() || ui.nc
      ? `<b>${num(ownHits + subHits)}</b> ${ownHits + subHits === 1 ? 'match' : 'matches'}: ${PARENTS(ownHits)}${narrowing() ? ` and ${SUBS(subHits)}` : ''}<button class="link" data-clearall style="margin-left:8px">Clear</button>`
      : `<b>${PARENTS(t.parents)}</b>${t.subs ? `, with ${SUBS(t.subs)} under them` : ', no subsidiaries yet'}`;
    const shown = list.slice(0, ui.limit);
    return `<section class="panel glass plist" aria-label="Past clients">${tools}<p class="result-line" role="status">${line}</p>
      <div class="phead" aria-hidden="true"><span></span><span>Company</span><span>Sector</span><span>Subsidiaries</span><span></span></div>
      <div class="pgroups">${shown.map(parentRow).join('')}</div>
      ${list.length > shown.length ? `<div class="more-row">Showing ${num(shown.length)} of ${num(list.length)} parent companies<button class="btn sm" data-more>Show ${num(Math.min(100, list.length - shown.length))} more</button></div>` : ''}</section>`;
  }

  function render() {
    refresh();
    const list = P.loading ? [] : entries();
    const t = totals();
    const empty = !P.loading && !P.db.past.length;
    const search = (cls) => `<label class="search glass ${cls}">${ic('search')}<span class="sr">Search past clients</span><input type="search" data-q value="${esc(ui.q)}" placeholder="Search companies and sectors"></label>`;
    let body;
    if (P.state === 'offline-empty') body = `<section class="panel glass" style="margin-top:22px"><div class="empty"><div class="art">${ic('wifi')}</div><h3>No connection</h3><p>The record of past clients will appear once you are back online.</p></div></section>`;
    else if (empty) body = `<section class="panel glass" style="margin-top:22px"><div class="empty"><div class="art">${ic('archive')}</div><h3>No past clients yet</h3><p>Keep a record of every company we’ve served, with its sector and any subsidiaries, so the team can quote how many clients we’ve had and where our experience lies.</p><div class="acts"><button class="cta" data-add>${ic('plus')}Add a past client</button></div></div></section>`;
    else body = `${hero()}
      <div class="seg full pview" role="group" aria-label="Show"><button aria-pressed="${ui.mview === 'list'}" data-mview="list">${ic('archive')}Companies</button><button aria-pressed="${ui.mview === 'sectors'}" data-mview="sectors">${ic('choice')}By sector</button></div>
      <div class="pwrap" data-mview="${ui.mview}">${listPanel(list)}${sectorsPanel()}</div>`;
    P.$('#main').innerHTML = `<div class="bar"><div class="ttl"><h1>Past clients</h1><span class="sub">${P.loading || empty ? '' : `${plural(t.total, 'client')} served`}</span></div><span class="sp"></span>${empty ? '' : search('')}<button class="cta" data-add>${ic('plus')}Add a past client</button><button class="icon-btn glass mob-only" data-add aria-label="Add a past client">${ic('plus')}</button></div>
      ${P.offlineBanner()}${empty || P.loading ? '' : search('m-search')}${body}`;
    flash.clear(); live.clear();
    syncUrl();
  }

  /* ---------- Saving (R9) ---------- */
  // A save that fails asks to try again. In the prototype, "Try again" works the second time.
  const failing = () => P.state === 'save-fail' && !ui.recovered;
  function commit(what, fn) {
    if (P.offline) { P.toast(`No connection. ${what} wasn’t saved.`, { err: true }); return false; }
    if (failing()) { P.toast(`Couldn’t save ${what.toLowerCase()}. Please try again.`, { err: true, action: 'Try again', onAction: () => { ui.recovered = true; commit(what, fn); } }); return false; }
    fn(); return true;
  }
  const busyBtn = (label) => `<span class="spin light"></span>${label}`;

  /* ---------- Sector picker with existing sectors (R6) ---------- */
  function secOptions(typed) {
    const k = norm(typed); const all = Array.from(S.values());
    const hits = all.filter((s) => !k || s.key.includes(k)).sort((a, b) => ((b.key === k) - (a.key === k)) || b.n - a.n || coll.compare(a.label, b.label)).slice(0, 6);
    const ex = S.get(k);
    let note = '';
    if (k && ex && clean(typed) !== ex.label) note = `${ic('sync')}Same sector as “${esc(ex.label)}”, so it’s saved that way.`;
    else if (k && !ex) note = `${ic('plus')}“${esc(clean(typed))}” will be a new sector.`;
    return { hits, note };
  }
  function secListHTML(typed, cur) {
    const { hits, note } = secOptions(typed);
    return `${hits.length ? `<h4>Sectors already in use</h4>${hits.map((s) => `<button type="button" class="mi" data-v="pick" data-sec-pick="${esc(s.label)}"${norm(cur) === s.key ? ' aria-current="true"' : ''}><span class="mi-t">${mark2(s.label, typed)}</span><small class="mi-note">${plural(s.n, 'company', 'companies')}</small></button>`).join('')}` : ''}${note ? `<p class="foot sec-note">${note}</p>` : ''}`;
  }
  function mark2(label, typed) { const s = clean(typed); const i = s ? label.toLowerCase().indexOf(s.toLowerCase()) : -1; return i < 0 ? esc(label) : `${esc(label.slice(0, i))}<b>${esc(label.slice(i, i + s.length))}</b>${esc(label.slice(i + s.length))}`; }

  function editSector(anchor, x) {
    const cur = x.sector ? secLabel(x.sector) : '';
    const m = P.menu(anchor, `<h4>Sector of ${esc(x.name)}</h4><div class="qe"><input class="input" value="${esc(cur)}" placeholder="Like “Retail”" aria-label="Sector" autocomplete="off"></div><div class="sec-list">${secListHTML(cur, x.sector)}</div>
      <div class="qe-acts">${x.sector ? '<button class="btn sm quiet" data-v="clear">Clear</button>' : ''}<span class="sp"></span><button class="btn sm" data-v="x">Cancel</button><button class="cta sm" data-v="ok">Save</button></div>`, (v, b, menu) => {
      if (v === 'x') return;
      const typed = v === 'pick' ? b.dataset.secPick : (v === 'clear' ? '' : menu.querySelector('input').value);
      setSector(x, typed);
    }, { onReady: (menu) => {
      const i = menu.querySelector('input'); i.focus(); i.select();
      i.addEventListener('input', () => { menu.querySelector('.sec-list').innerHTML = secListHTML(i.value, x.sector); });
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); menu.querySelector('[data-v="ok"]').click(); } });
    } });
    m.classList.add('qe-menu', 'sec-menu');
  }
  function setSector(x, typed) {
    const before = x.sector; const next = canon(typed);
    if (norm(before) === norm(next) && clean(before) === next) return;
    commit('The sector', () => {
      x.sector = next; flash.add(x.id); P.render();
      P.toast(next ? `Sector set to ${next}` : 'Sector cleared', { action: 'Undo', onAction: () => { x.sector = before; flash.add(x.id); P.render(); } });
    });
  }

  /* ---------- Rename, count, delete (R2, R3, R8) ---------- */
  function rename(anchor, x) {
    P.menu(anchor, `<h4>${x.parent ? 'Subsidiary' : 'Company'} name</h4><div class="qe"><input class="input" value="${esc(x.name)}" aria-label="Name" autocomplete="off"></div><p class="err-msg qe-err" hidden>${ic('alert')}A past client needs a name.</p><div class="qe-acts"><span class="sp"></span><button class="btn sm" data-v="x">Cancel</button><button class="cta sm" data-v="ok">Save</button></div>`, (v, b, m) => {
      if (v === 'x') return;
      const name = m.querySelector('input').value.trim();
      if (!name) { m.querySelector('.qe-err').hidden = false; m.querySelector('.qe').classList.add('field', 'has-err'); return true; }
      if (name === x.name) return;
      const was = x.name;
      commit('The new name', () => { x.name = name; flash.add(x.id); P.render(); P.toast('Renamed', { action: 'Undo', onAction: () => { x.name = was; flash.add(x.id); P.render(); } }); });
    }, { alignRight: false, onReady: (m) => { m.classList.add('qe-menu'); const i = m.querySelector('input'); i.focus(); i.select(); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); m.querySelector('[data-v="ok"]').click(); } }); } });
  }
  function toggleCount(p) {
    const before = totals().total;
    commit('The change', () => {
      p.counted = !p.counted; flash.add(p.id); P.render();
      const after = totals().total;
      P.toast(`${p.name} ${p.counted ? 'counted again' : 'no longer counted'}. Clients: ${num(before)} → ${num(after)}`, { action: 'Undo', onAction: () => { p.counted = !p.counted; flash.add(p.id); P.render(); } });
    });
  }
  function remove(x) {
    const subs = x.parent ? [] : subsOf(x.id);
    if (subs.length) { blocked(x, subs.length); return; }
    const t = totals(); const counts = x.parent || x.counted;
    P.confirm({
      title: `Delete ${x.name}?`,
      body: `It comes off the record of past clients for everyone on the team. ${counts ? `The client total goes from ${num(t.total)} to ${num(t.total - 1)}.` : 'It isn’t counted, so the totals stay the same.'}`,
      ok: x.parent ? 'Delete subsidiary' : 'Delete company',
      onOk: () => commit('The deletion', () => {
        const i = P.db.past.indexOf(x); P.db.past.splice(i, 1); P.render();
        P.toast(`${x.name} deleted`, { action: 'Undo', onAction: () => { P.db.past.splice(i, 0, x); flash.add(x.id); P.render(); } });
      }),
    });
  }
  // R8: a parent company that still has subsidiaries can't be deleted until they're moved or deleted.
  function blocked(p, n) {
    const scrim = P.el('<div class="scrim top"></div>');
    const d = P.el(`<div class="dialog over-sheet" role="alertdialog" aria-modal="true" aria-labelledby="bl-h" aria-describedby="bl-p">
      <div class="dl-art">${ic('tree')}</div><h2 id="bl-h">Move or delete its subsidiaries first</h2>
      <p id="bl-p">${esc(p.name)} still has ${SUBS(n)}. Move ${n === 1 ? 'it' : 'them'} to another parent company or delete ${n === 1 ? 'it' : 'them'}, so no subsidiary is left without a parent. Then ${esc(p.name)} can be deleted.</p>
      <div class="acts"><button class="btn" data-x>Close</button><button class="cta" data-ok>${ic('tree')}Show its subsidiaries</button></div></div>`);
    scrim.addEventListener('click', () => P.closeTop());
    d.querySelector('[data-x]').addEventListener('click', () => P.closeTop());
    d.querySelector('[data-ok]').addEventListener('click', () => { P.closeTop(); reveal(p.id); });
    P.layer([scrim, d]);
    d.querySelector('[data-ok]').focus();
  }
  function reveal(id) {
    ui.closed.delete(id); ui.open.add(id); ui.full.add(id);
    if (!entries().some((e) => e.p.id === id)) { ui.q = ''; ui.sec = ''; ui.nc = false; }
    const pos = entries().findIndex((e) => e.p.id === id); if (pos >= ui.limit) ui.limit = pos + 1;
    ui.mview = 'list'; render();
    const g = P.$(`[data-pg="${id}"]`); if (g) { g.scrollIntoView({ block: 'center' }); g.classList.add('is-new'); }
  }

  /* ---------- Moving a subsidiary (R2) ---------- */
  function openMove(s, opts) {
    opts = opts || {};
    const from = rec(s.parent);
    const others = IX.parents.filter((p) => p.id !== s.parent).sort((a, b) => coll.compare(a.name, b.name));
    const st = { q: '', busy: opts.busy || null, fail: false };
    const scrim = P.el('<div class="scrim top"></div>');
    const d = P.el('<div class="dialog wide over-sheet" role="dialog" aria-modal="true" aria-labelledby="mv-h"></div>');
    scrim.addEventListener('click', () => { if (!st.busy) P.closeTop(); });
    P.layer([scrim, d]);
    function paint(focus) {
      if (!others.length) {
        d.innerHTML = `<h2 id="mv-h">Move ${esc(s.name)}</h2><p>There’s no other parent company to move it to. Add the new parent company first, then move ${esc(s.name)} there.</p>
          <div class="acts"><button class="btn" data-x>Close</button><button class="cta" data-addparent>${ic('plus')}Add a parent company</button></div>`;
        d.querySelector('[data-addparent]').focus();
        return;
      }
      const hits = others.filter((p) => !st.q || norm(p.name).includes(norm(st.q))).slice(0, 40);
      d.innerHTML = `<h2 id="mv-h">Move ${esc(s.name)}</h2><p>Now under <b>${esc(from ? from.name : '')}</b>. Choose its new parent company. Subsidiaries always count, so the totals stay the same.</p>
        ${st.fail ? `<div class="notice err" style="margin:16px 0 0">${ic('alert')}<div><p><b>Couldn’t move ${esc(s.name)}.</b></p><p>Check your connection and choose again. Nothing was changed.</p></div></div>` : ''}
        ${st.busy ? `<div class="mv-busy" role="status"><span class="spin"></span>Moving to ${esc(rec(st.busy).name)}…</div>`
          : `<div class="field"><label class="sr" for="mv-s">Search parent companies</label><input class="input" id="mv-s" value="${esc(st.q)}" placeholder="Search parent companies" autocomplete="off"></div>
        <div class="nn-list">${hits.map((p) => `<button class="nn-co" data-to="${p.id}"><span class="pmono" aria-hidden="true">${esc(P.initials(p.name))}</span><span class="nm">${esc(p.name)}<small>${[p.sector ? secLabel(p.sector) : 'No sector', SUBS(subsOf(p.id).length)].join(' · ')}</small></span><span class="go">Move here${ic('right')}</span></button>`).join('') || '<p class="help">No parent company has that name.</p>'}</div>`}
        <div class="acts"><button class="btn" data-x${st.busy ? ' disabled' : ''}>Cancel</button></div>`;
      const f = d.querySelector(focus || '#mv-s'); if (f) { f.focus(); if (f.value) f.setSelectionRange(f.value.length, f.value.length); }
    }
    paint();
    d.addEventListener('input', (e) => { if (e.target.id === 'mv-s') { st.q = e.target.value; paint('#mv-s'); } });
    d.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-x]') && !st.busy) { P.closeTop(); return; }
      if (t.closest('[data-addparent]')) { P.closeTop(); openAdd({ mode: 'own' }); return; }
      const to = t.closest('[data-to]');
      if (to && !st.busy) {
        if (P.offline) { P.toast(`No connection. ${s.name} wasn’t moved.`, { err: true }); return; }
        st.busy = to.dataset.to; st.fail = false; paint();
        if (P.state === 'saving') return; // stays in progress, to show the state
        setTimeout(() => {
          if (failing()) { ui.recovered = true; st.busy = null; st.fail = true; paint(); return; }
          const was = s.parent; s.parent = st.busy; P.closeTop();
          ui.open.add(s.parent); ui.closed.delete(s.parent); flash.add(s.id); P.render();
          P.toast(`${s.name} moved to ${rec(s.parent).name}`, { action: 'Undo', onAction: () => { s.parent = was; flash.add(s.id); P.render(); } });
        }, 700);
      }
    });
  }

  /* ---------- Adding a past client (R1, R2, R3, R6, R9) ---------- */
  function openAdd(opts) {
    opts = opts || {};
    const st = { name: opts.name || '', sector: opts.sector || '', mode: opts.mode || 'own', parent: opts.parent || null, counted: true, err: opts.err || null, fail: !!opts.fail, busy: !!opts.busy, pq: '', sugg: !!opts.sugg };
    if (st.parent && !st.sector) { const p = rec(st.parent); if (p && p.sector) st.sector = secLabel(p.sector); }
    const scrim = P.el('<div class="scrim top"></div>');
    const d = P.el('<div class="dialog wide over-sheet" role="dialog" aria-modal="true" aria-labelledby="ad-h"></div>');
    scrim.addEventListener('click', () => { if (!st.busy) P.closeTop(); });
    P.layer([scrim, d]);
    const parents = () => IX.parents.slice().sort((a, b) => coll.compare(a.name, b.name));
    function where() {
      if (st.mode === 'own') return `<div class="field"><button class="chip" aria-pressed="${st.counted}" data-counted>${ic(st.counted ? 'check' : 'minus')}Count it in the totals</button><p class="help">${st.counted ? 'Counts as one client.' : 'Kept on record as an umbrella company. Its subsidiaries will still count.'} Turn this off for a group that’s only on record for its subsidiaries.</p></div>`;
      const p = st.parent && rec(st.parent);
      if (p) return `<div class="co-pick" style="margin-top:12px"><span class="pmono" aria-hidden="true">${esc(P.initials(p.name))}</span><div style="min-width:0"><div class="nm">${esc(p.name)}</div><small>${[p.sector ? secLabel(p.sector) : 'No sector', SUBS(subsOf(p.id).length)].join(' · ')}</small></div><span class="sp"></span><button class="btn sm quiet" data-pchange>Change</button></div><p class="help">Subsidiaries always count, even when their parent company doesn’t.</p>`;
      const all = parents();
      if (!all.length) return `<p class="help">There’s no parent company on record yet. Add this one as a parent company first.</p>`;
      const hits = all.filter((x) => !st.pq || norm(x.name).includes(norm(st.pq))).slice(0, 30);
      return `<div class="field"><label class="sr" for="ad-ps">Search parent companies</label><input class="input" id="ad-ps" value="${esc(st.pq)}" placeholder="Search parent companies" autocomplete="off"></div>
        <div class="nn-list short">${hits.map((x) => `<button class="nn-co" data-parent="${x.id}"><span class="pmono" aria-hidden="true">${esc(P.initials(x.name))}</span><span class="nm">${esc(x.name)}<small>${[x.sector ? secLabel(x.sector) : 'No sector', SUBS(subsOf(x.id).length)].join(' · ')}</small></span><span class="go">Choose${ic('right')}</span></button>`).join('') || '<p class="help">No parent company has that name.</p>'}</div>`;
    }
    function paint(focus) {
      d.innerHTML = `<h2 id="ad-h">Add a past client</h2><p>A company we’ve finished work with. Only the name is needed.</p>
        ${st.fail ? `<div class="notice err" style="margin:16px 0 0" role="alert">${ic('alert')}<div><p><b>Couldn’t save ${esc(st.name.trim() || 'the company')}.</b></p><p>Check your connection and try again. What you typed is still here.</p></div></div>` : ''}
        <div class="field${st.err ? ' has-err' : ''}"><label for="ad-name">Name</label><input class="input" id="ad-name" value="${esc(st.name)}" placeholder="Like “Meridian Bank”" autocomplete="off"${st.err ? ' aria-invalid="true" aria-describedby="ad-err"' : ''}${st.busy ? ' disabled' : ''}>${st.err ? `<p class="err-msg" id="ad-err">${ic('alert')}Add the company’s name. It’s the only thing needed.</p>` : ''}</div>
        <div class="field sec-field"><label for="ad-sec">Sector <span class="opt">optional</span></label><input class="input" id="ad-sec" value="${esc(st.sector)}" placeholder="Like “Retail”" autocomplete="off"${st.busy ? ' disabled' : ''}><div class="suggest sec-sugg"${st.sugg ? '' : ' hidden'}>${secListHTML(st.sector, '')}</div></div>
        <div class="field"><span class="lbl" id="ad-w">Where it sits</span><div class="seg full lg" role="group" aria-labelledby="ad-w"><button aria-pressed="${st.mode === 'own'}" data-mode="own"${st.busy ? ' disabled' : ''}>${ic('building')}A parent company</button><button aria-pressed="${st.mode === 'sub'}" data-mode="sub"${st.busy ? ' disabled' : ''}>${ic('tree')}A subsidiary of…</button></div>${where()}</div>
        <div class="acts"><button class="btn" data-x${st.busy ? ' disabled' : ''}>Cancel</button><button class="cta" data-ok${st.busy ? ' disabled' : ''}>${st.busy ? busyBtn('Adding…') : (st.fail ? 'Try again' : 'Add past client')}</button></div>`;
      const f = d.querySelector(focus || '#ad-name'); if (f && !f.disabled) { f.focus(); if (f.value && f.setSelectionRange) f.setSelectionRange(f.value.length, f.value.length); }
    }
    paint(opts.sugg ? '#ad-sec' : null);
    const sugg = () => d.querySelector('.sec-sugg');
    d.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'ad-name') { st.name = t.value; if (st.err && st.name.trim()) { st.err = null; paint('#ad-name'); } }
      if (t.id === 'ad-sec') { st.sector = t.value; sugg().innerHTML = secListHTML(st.sector, ''); sugg().hidden = !sugg().innerHTML; }
      if (t.id === 'ad-ps') { st.pq = t.value; paint('#ad-ps'); }
    });
    d.addEventListener('focusin', (e) => { if (e.target.id === 'ad-sec') { sugg().innerHTML = secListHTML(st.sector, ''); sugg().hidden = !sugg().innerHTML; } });
    d.addEventListener('focusout', (e) => { if (e.target.id === 'ad-sec') setTimeout(() => { const s = sugg(); if (s && (!document.activeElement || document.activeElement.id !== 'ad-sec')) s.hidden = true; }, 0); });
    d.addEventListener('mousedown', (e) => { if (e.target.closest('.sec-sugg')) e.preventDefault(); });
    d.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.target.id === 'ad-name') { e.preventDefault(); submit(); }
      if (e.target.id === 'ad-sec') { e.preventDefault(); st.sector = canon(st.sector); sugg().hidden = true; d.querySelector('#ad-sec').value = st.sector; }
    });
    d.addEventListener('click', (e) => {
      const t = e.target;
      if (st.busy) return;
      if (t.closest('[data-x]')) { P.closeTop(); return; }
      const pk = t.closest('[data-sec-pick]'); if (pk) { st.sector = pk.dataset.secPick; d.querySelector('#ad-sec').value = st.sector; sugg().hidden = true; return; }
      const m = t.closest('[data-mode]'); if (m) { st.mode = m.dataset.mode; paint(st.mode === 'sub' && !st.parent ? '#ad-ps' : `[data-mode="${st.mode}"]`); return; }
      if (t.closest('[data-counted]')) { st.counted = !st.counted; paint('[data-counted]'); return; }
      const pa = t.closest('[data-parent]'); if (pa) { st.parent = pa.dataset.parent; const p = rec(st.parent); if (!clean(st.sector) && p.sector) st.sector = secLabel(p.sector); paint('[data-pchange]'); return; }
      if (t.closest('[data-pchange]')) { st.parent = null; paint('#ad-ps'); return; }
      if (t.closest('[data-ok]')) submit();
    });
    function submit() {
      const name = st.name.trim();
      if (!name) { st.err = 'name'; st.fail = false; paint('#ad-name'); return; }
      if (st.mode === 'sub' && !st.parent) { const ps = d.querySelector('#ad-ps'); if (ps) { ps.focus(); ps.placeholder = 'Choose a parent company first'; } return; }
      if (P.offline) { P.toast('No connection. The company wasn’t added.', { err: true }); return; }
      st.busy = true; st.fail = false; paint();
      setTimeout(() => {
        if (failing()) { ui.recovered = true; st.busy = false; st.fail = true; paint(); return; }
        const x = { id: 'pp' + Date.now(), name, sector: canon(st.sector), parent: st.mode === 'sub' ? st.parent : null, counted: st.mode === 'sub' ? true : st.counted };
        P.db.past.push(x); P.closeTop();
        ui.q = ''; ui.sec = ''; ui.nc = false;
        if (x.parent) { ui.open.add(x.parent); ui.closed.delete(x.parent); }
        flash.add(x.id); ui.mview = 'list'; refresh(); reveal(x.parent || x.id);
        P.toast(x.parent ? `${name} added under ${rec(x.parent).name}` : `${name} added`, { action: 'Undo', onAction: () => { P.db.past = P.db.past.filter((y) => y !== x); P.render(); } });
      }, 700);
    }
  }
  // Quick add, inside an open parent company: a name and Enter. It takes the parent's sector.
  function quickSub(input) {
    const p = rec(input.dataset.subadd); const name = input.value.trim();
    if (!p || !name) return;
    commit('The subsidiary', () => {
      const x = { id: 'pp' + Date.now(), name, sector: p.sector ? secLabel(p.sector) : '', parent: p.id, counted: true };
      P.db.past.push(x); flash.add(x.id); ui.open.add(p.id); P.render();
      const again = P.$(`[data-subadd="${p.id}"]`); if (again) again.focus();
      P.toast(`${name} added under ${p.name}`, { action: 'Undo', onAction: () => { P.db.past = P.db.past.filter((y) => y !== x); P.render(); } });
    });
  }

  /* ---------- Export (E1): the full record ---------- */
  function openExport() {
    const t = totals(); const file = `past-clients-${P.iso(0)}.csv`;
    const cols = ['Name', 'Parent or subsidiary', 'Parent company', 'Sector', 'Counted'];
    const scrim = P.el('<div class="scrim top"></div>');
    const d = P.el('<div class="dialog over-sheet" role="dialog" aria-modal="true" aria-labelledby="ex-h"></div>');
    scrim.addEventListener('click', () => P.closeTop());
    P.layer([scrim, d]);
    const n = P.db.past.length;
    d.innerHTML = `<h2 id="ex-h">Export past clients</h2>
      <p>${n ? `The full record: <b>${PARENTS(t.parents)}</b> and <b>${SUBS(t.subs)}</b>, one row each${filtersOn() ? ', whatever the search and filters show' : ''}. Each subsidiary follows its parent company. Columns:` : 'There are no past clients on record yet, so there’s nothing to export.'}</p>
      ${n ? `<div class="ex-fields">${cols.map((x) => `<span>${x}</span>`).join('')}</div>
      <div class="ex-file">${ic('download')}<div><b>${file}</b><small>A comma-separated spreadsheet file. Sectors are written the way the breakdown shows them.</small></div></div>` : ''}
      <div class="acts"><button class="btn" data-x>Cancel</button><button class="cta" data-ok${n ? '' : ' disabled'}>${ic('download')}Download</button></div>`;
    d.querySelector(n ? '[data-ok]' : '[data-x]').focus();
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) P.closeTop();
      if (e.target.closest('[data-ok]')) {
        const cell = (s) => { s = String(s == null ? '' : s); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        const rows = [cols];
        IX.parents.slice().sort((a, b) => coll.compare(a.name, b.name)).forEach((p) => {
          rows.push([p.name, 'Parent company', '', secLabel(p.sector), p.counted ? 'Yes' : 'No']);
          subsOf(p.id).forEach((s) => rows.push([s.name, 'Subsidiary', p.name, secLabel(s.sector), 'Yes']));
        });
        const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file; document.body.appendChild(a); a.click(); a.remove();
        P.closeTop(); P.toast(`Downloaded ${file}`);
      }
    });
  }

  /* ---------- Menus ---------- */
  function openMenu(key, btn) {
    if (key === 'sort') return P.menu(btn, `<h4>Order parent companies by</h4>${Object.entries(SORTS).map(([k, l]) => P.mi(k, l, ui.sort === k)).join('')}<p class="foot">Subsidiaries are listed by name under their parent company.</p>`, (v) => { ui.sort = v; render(); });
    if (key === 'sec') {
      const all = Array.from(S.values()).sort((a, c) => c.n - a.n || coll.compare(a.label, c.label));
      return P.menu(btn, `<h4>Show one sector</h4>${P.mi('', 'All sectors', !ui.sec)}${all.slice(0, 60).map((s) => P.mi(s.key, `<span class="mi-t">${esc(s.label)}</span><small class="mi-note">${num(s.n)}</small>`, ui.sec === s.key)).join('')}${P.mi('-', 'No sector', ui.sec === '-')}${all.length > 60 ? `<p class="foot">${num(all.length - 60)} smaller sectors are in the breakdown.</p>` : ''}`, (v) => { ui.sec = v; ui.closed.clear(); ui.limit = 100; render(); });
    }
    if (key === 'nc') { ui.nc = false; render(); }
  }
  function parentMenu(btn, p) {
    P.menu(btn, `<button class="mi" data-v="sub">${ic('plus')}<span>Add a subsidiary</span></button>
      <button class="mi" data-v="rename">${ic('edit')}<span>Rename</span></button>
      <button class="mi" data-v="sector">${ic('choice')}<span>${p.sector ? 'Change the sector' : 'Add a sector'}</span></button>
      <button class="mi" data-v="count">${ic(p.counted ? 'minus' : 'check')}<span>${p.counted ? 'Stop counting it in the totals' : 'Count it in the totals'}</span></button>
      <hr><button class="mi red" data-v="delete">${ic('trash')}<span>Delete company</span></button>`, (v) => {
      P.closeTop();
      if (v === 'sub') { reveal(p.id); const i = P.$(`[data-subadd="${p.id}"]`); if (i) i.focus(); }
      if (v === 'rename') rename(anchorOf(p.id, '[data-rename]', btn), p);
      if (v === 'sector') editSector(anchorOf(p.id, '[data-sector]', btn), p);
      if (v === 'count') toggleCount(p);
      if (v === 'delete') remove(p);
      return true;
    }, { alignRight: true });
  }
  function subMenu(btn, s) {
    P.menu(btn, `<button class="mi" data-v="rename">${ic('edit')}<span>Rename</span></button>
      <button class="mi" data-v="sector">${ic('choice')}<span>${s.sector ? 'Change the sector' : 'Add a sector'}</span></button>
      <button class="mi" data-v="move">${ic('swap')}<span>Move to another parent company</span></button>
      <hr><button class="mi red" data-v="delete">${ic('trash')}<span>Delete subsidiary</span></button>`, (v) => {
      P.closeTop();
      if (v === 'rename') rename(anchorOf(s.id, '[data-rename]', btn), s);
      if (v === 'sector') editSector(anchorOf(s.id, '[data-sector]', btn), s);
      if (v === 'move') openMove(s);
      if (v === 'delete') remove(s);
      return true;
    }, { alignRight: true });
  }
  const anchorOf = (id, sel, fallback) => { const r = P.$(`[data-row="${id}"]`); const a = r && r.querySelector(sel); return a && a.offsetParent ? a : fallback; };

  function copyFigures() {
    const t = totals(); const b = breakdown();
    const top = b.rows.slice(0, 3).map((r) => `${r.label} ${num(r.n)}`).join(', ');
    const text = `We have served ${plural(t.total, 'client')}: ${PARENTS(t.counted)} and ${SUBS(t.subs)}.${t.excluded ? ` ${plural(t.excluded, 'umbrella company', 'umbrella companies')} ${t.excluded === 1 ? 'is' : 'are'} on record but not counted.` : ''}${top ? ` Largest sectors: ${top}.` : ''}`;
    const done = () => P.toast('Figures copied, ready to paste');
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done();
  }

  /* ---------- Events ---------- */
  const app = P.$('#app');
  app.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-add]')) { openAdd(); return; }
    const tg = t.closest('[data-toggle]');
    if (tg && !tg.disabled) {
      const id = tg.dataset.toggle; const en = entries().find((x) => x.p.id === id);
      if (en && isOpen(en)) { ui.open.delete(id); ui.closed.add(id); } else { ui.open.add(id); ui.closed.delete(id); }
      render(); const c = P.$(`[data-pg="${id}"] .chev`); if (c) c.focus(); return;
    }
    const rn = t.closest('[data-rename]'); if (rn) { rename(rn, rec(rn.dataset.rename)); return; }
    const sc = t.closest('[data-sector]'); if (sc) { editSector(sc, rec(sc.dataset.sector)); return; }
    const ct = t.closest('[data-count]'); if (ct) { toggleCount(rec(ct.dataset.count)); return; }
    const pm = t.closest('[data-pmenu]'); if (pm) { parentMenu(pm, rec(pm.dataset.pmenu)); return; }
    const sm = t.closest('[data-smenu]'); if (sm) { subMenu(sm, rec(sm.dataset.smenu)); return; }
    const se = t.closest('[data-sec]'); if (se) { ui.sec = ui.sec === se.dataset.sec ? '' : se.dataset.sec; ui.closed.clear(); ui.limit = 100; if (innerWidth <= 900 && ui.sec) ui.mview = 'list'; render(); if (innerWidth <= 900 && ui.sec) { const l = P.$('.plist'); if (l) l.scrollIntoView({ block: 'start' }); } return; }
    if (t.closest('[data-secall]')) { ui.secAll = !ui.secAll; render(); return; }
    if (t.closest('[data-nc]')) { ui.nc = !ui.nc; ui.mview = 'list'; render(); return; }
    const mv = t.closest('[data-mview]'); if (mv) { ui.mview = mv.dataset.mview; render(); return; }
    const ex = t.closest('[data-expand]'); if (ex) { const all = entries(); if (ex.dataset.expand === 'all') { all.forEach((x) => { ui.open.add(x.p.id); ui.closed.delete(x.p.id); }); } else { all.forEach((x) => { ui.open.delete(x.p.id); ui.closed.add(x.p.id); }); } render(); return; }
    const full = t.closest('[data-full]'); if (full) { ui.full.add(full.dataset.full); render(); return; }
    const sl = t.closest('[data-sublim]'); if (sl) { ui.subLimit[sl.dataset.sublim] = (ui.subLimit[sl.dataset.sublim] || 50) + 100; render(); return; }
    const cl = t.closest('[data-clear]'); if (cl) { if (cl.dataset.clear === 'nc') ui.nc = false; else ui[cl.dataset.clear] = ''; ui.closed.clear(); render(); return; }
    const mb = t.closest('[data-menu]'); if (mb) { openMenu(mb.dataset.menu, mb); return; }
    if (t.closest('[data-clearall]')) { ui.q = ''; ui.sec = ''; ui.nc = false; ui.closed.clear(); ui.full.clear(); render(); return; }
    if (t.closest('[data-export]')) { openExport(); return; }
    if (t.closest('[data-copy]')) { copyFigures(); return; }
    if (t.closest('[data-more]')) { ui.limit += 100; render(); return; }
    // A click anywhere else on a parent row shows or hides its subsidiaries.
    const row = t.closest('.prow'); if (row && !t.closest('button, input, a')) { const b = row.querySelector('[data-toggle]:not(:disabled)'); if (b) b.click(); }
  });
  let qTimer;
  app.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.matches('[data-q]')) return;
    ui.q = t.value; ui.limit = 100; ui.closed.clear(); ui.full.clear(); clearTimeout(qTimer);
    const mobile = !!t.closest('.m-search');
    qTimer = setTimeout(() => { if (ui.q) ui.mview = 'list'; render(); const i = P.$(mobile ? '.m-search input' : '.bar .search input'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200);
  });
  app.addEventListener('keydown', (e) => {
    if (e.target.matches('[data-subadd]') && e.key === 'Enter') { e.preventDefault(); quickSub(e.target); }
  });

  P.boot({
    page: 'past', render,
    states: [['', 'Normal'], ['empty', 'Nothing yet (no past clients)'], ['umbrella-only', 'Nothing counted (one umbrella company)'], ['one-parent', 'Only one parent company'], ['loading', 'Loading'], ['saving', 'Adding or moving in progress'], ['save-fail', 'Saving fails (try again works)'], ['offline', 'No connection'], ['offline-empty', 'No connection, nothing loaded'], ['live', 'Live change from a colleague']],
    opens: [['add', 'Add a past client'], ['add-sub', 'Add a subsidiary of…'], ['add-sector', 'Sector typed another way'], ['add-required', 'Name missing'], ['sector', 'Sector editor'], ['rename', 'Rename'], ['move', 'Move a subsidiary'], ['delete-blocked', 'Delete a parent with subsidiaries'], ['delete-sub', 'Delete a subsidiary'], ['delete', 'Delete a company'], ['menu', 'Parent company menu'], ['sort', 'Order menu'], ['export', 'Export'], ['more', 'Phone: More']],
    afterBoot() {
      if (P.state === 'saving' && !P.openParam) openAdd({ name: 'Kencana Clinic Medan', mode: 'sub', parent: 'p8', busy: true });
      if (P.state === 'save-fail' && !P.openParam) openAdd({ name: 'Kencana Clinic Medan', mode: 'sub', parent: 'p8', fail: true });
      if (P.state === 'live') setTimeout(() => {
        const p = rec('p8') || IX.parents[0]; if (!p) return;
        const x = { id: 'pl' + Date.now(), name: 'Kencana Clinic Medan', sector: 'Healthcare', parent: p.id, counted: true };
        P.db.past.push(x); live.add(x.id); ui.open.add(p.id); render();
        const tr = P.$('.track'); if (tr) tr.classList.add('is-new');
      }, 1200);
    },
    onOpen(o) {
      const first = (f) => P.db.past.find(f);
      const sub = rec('p3-2') || first((x) => x.parent);
      if (o === 'add') openAdd();
      if (o === 'add-sub') openAdd({ mode: 'sub', parent: (rec('p1') || IX.parents[0] || {}).id || null });
      if (o === 'add-sector') openAdd({ name: 'Nusa Outlet', sector: ' retail', sugg: true });
      if (o === 'add-required') openAdd({ err: 'name' });
      if (o === 'sector' && sub) { reveal(sub.parent); editSector(anchorOf(sub.id, '[data-sector]', P.$('.bar h1')), sub); }
      if (o === 'rename') { const p = rec('p1') || IX.parents[0]; if (p) rename(anchorOf(p.id, '[data-rename]', P.$('.bar h1')), p); }
      if (o === 'move' && sub) { reveal(sub.parent); openMove(sub); }
      if (o === 'delete-blocked') { const p = rec('p3') || IX.parents.find((x) => subsOf(x.id).length); if (p) remove(p); }
      if (o === 'delete-sub' && sub) { reveal(sub.parent); remove(sub); }
      if (o === 'delete') { const p = rec('p14') || IX.parents.find((x) => !subsOf(x.id).length); if (p) remove(p); }
      if (o === 'menu') { const p = rec('p1') || IX.parents[0]; const b = p && P.$(`[data-pmenu="${p.id}"]`); if (b) parentMenu(b, p); }
      if (o === 'sort') { const b = P.$('[data-menu="sort"]'); if (b) openMenu('sort', b); }
      if (o === 'export') openExport();
    },
  });
})();
