/* Qualification notes: nine fixed headings, likelihood, long remarks, saving as you go, notes for prospects
   not tracked yet and linking them later, search across everything written, delete, export (U1 to U8, E1). */
(function () {
  const { ic, esc, num, plural } = P;
  const q = P.qs;
  const HEADS = [
    ['need', 'Client need', 'What are they trying to achieve?'],
    ['situation', 'Current situation', 'How do they do it today, and with what?'],
    ['pain', 'Pain and business impact', 'What does the problem cost them?'],
    ['fit', 'Solution fit', 'Which of our products fit, and how well?'],
    ['urgency', 'Urgency and timing', 'Why now? Any dates that matter?'],
    ['stake', 'Stakeholders and decision process', 'Who decides, who influences, and how do they buy?'],
    ['ready', 'Commercial readiness', 'Budget, procurement, contract terms'],
    ['next', 'Next step and ownership', 'What happens next, and who owns it?'],
    ['block', 'Potential blockers', 'What could stop this?'],
  ];
  const LIKELY = [
    { id: 'vhigh', label: 'Very high', n: 5 }, { id: 'high', label: 'High', n: 4 }, { id: 'med', label: 'Medium', n: 3 },
    { id: 'mlow', label: 'Moderately low', n: 2 }, { id: 'low', label: 'Low', n: 1 },
  ];
  const LK = (id) => LIKELY.find((l) => l.id === id) || null;
  const GROUP_LABEL = { lead: 'To approach', active: 'Active', done: 'Deal done', hold: 'No or not now' };
  const GROUP_ICON = { lead: 'flag', active: 'bolt', done: 'done', hold: 'pause' };

  if (!P.db.notes) P.db.notes = [];
  if (P.state === 'empty') P.db.notes = [];
  const ui = { n: q.get('n') || '', q: q.get('q') || '', lk: q.get('lk') || '', track: q.get('track') || '', sort: q.get('sort') || 'edited', limit: 100, remarksOpen: false, save: P.state === 'saving' ? 'saving' : 'saved' };
  const live = new Set(); const liveHeads = new Set();
  let lastSorted = [];

  /* ---------- Helpers ---------- */
  const note = (id) => P.db.notes.find((n) => n.id === id) || null;
  const noteOf = (coId) => P.db.notes.find((n) => n.co === coId) || null;
  const nameOf = (n) => { const c = n.co && P.company(n.co); return c ? c.name : (n.name || 'Untitled prospect'); };
  const monoOf = (n) => { const c = n.co && P.company(n.co); return c ? `<span class="cmono g-${c.stage}" aria-hidden="true">${esc(c.short || P.initials(c.name))}</span>` : `<span class="cmono g-none" aria-hidden="true">${esc(P.initials(nameOf(n)))}</span>`; };
  const filled = (n) => HEADS.filter(([k]) => (n.h[k] || '').trim()).length;
  const words = (s) => (String(s || '').trim().match(/\S+/g) || []).length;
  const textOf = (n) => [nameOf(n), ...HEADS.map(([k]) => n.h[k] || ''), n.remarks].join('\n').toLowerCase();
  const matchQ = (n) => !ui.q || textOf(n).includes(ui.q.toLowerCase());
  const edited = (n) => { const d = -P.diff(n.edited); return d <= 0 ? 'Edited today' : (d === 1 ? 'Edited yesterday' : `Edited ${P.ago(n.edited)}`); };
  const meter = (l) => `<span class="lkm${l ? ' lk-' + l.id : ''}" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<i class="${l && i <= l.n ? 'on' : ''}"></i>`).join('')}</span>`;
  const lkChip = (n) => { const l = LK(n.likely); return `<span class="lkc${l ? '' : ' none'}" title="Likelihood: ${l ? l.label : 'not rated'}">${meter(l)}<span>${l ? l.label : 'Not rated'}</span></span>`; };

  function snippet(n) {
    // While searching: where the words were found. Otherwise: the next step, the most useful line to skim.
    const at = (label, text) => `<p class="ni-snip"><em>${esc(label)}</em>${text}</p>`;
    if (ui.q) {
      const s = ui.q.toLowerCase();
      const spots = HEADS.map(([k, l]) => [l, n.h[k] || '']).concat([['Remarks', n.remarks || '']]);
      const hit = spots.find(([, t]) => t.toLowerCase().includes(s));
      if (!hit) return '';
      const t = hit[1]; const i = t.toLowerCase().indexOf(s);
      const from = Math.max(0, i - 40);
      const cut = (from ? '…' : '') + t.slice(from, i);
      return at(hit[0], `${esc(cut)}<mark>${esc(t.slice(i, i + s.length))}</mark>${esc(t.slice(i + s.length, i + s.length + 90))}${t.length > i + s.length + 90 ? '…' : ''}`);
    }
    return n.h.next ? at('Next step', esc(n.h.next)) : '';
  }

  /* ---------- Filtering and order (U2, U7) ---------- */
  function apply(list) {
    list = list.filter(matchQ);
    if (ui.lk) list = list.filter((n) => (ui.lk === '-' ? !n.likely : n.likely === ui.lk));
    if (ui.track === 'yes') list = list.filter((n) => n.co);
    if (ui.track === 'no') list = list.filter((n) => !n.co);
    return list;
  }
  const filtersOn = () => !!(ui.q || ui.lk || ui.track);
  function sortList(list) {
    const by = {
      edited: (a, b) => (b.edited || '').localeCompare(a.edited || '') || nameOf(a).localeCompare(nameOf(b)),
      likely: (a, b) => ((LK(b.likely) || { n: 0 }).n - (LK(a.likely) || { n: 0 }).n) || nameOf(a).localeCompare(nameOf(b)),
      name: (a, b) => nameOf(a).localeCompare(nameOf(b)),
    }[ui.sort] || ((a, b) => 0);
    return list.slice().sort(by);
  }
  const SORTS = { edited: 'Last edited, newest first', likely: 'Likelihood, highest first', name: 'Name, A to Z' };
  function syncUrl() {
    const u = new URLSearchParams();
    if (ui.n) u.set('n', ui.n);
    ['q', 'lk', 'track'].forEach((k) => { if (ui[k]) u.set(k, ui[k]); });
    if (ui.sort !== 'edited') u.set('sort', ui.sort);
    if (P.state) u.set('state', P.state);
    const s = u.toString() + (P.stress ? (u.toString() ? '&' : '') + 'stress' : '');
    history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
  }

  /* ---------- List column ---------- */
  function dist(all) {
    const counts = LIKELY.map((l) => [l, all.filter((n) => n.likely === l.id).length]);
    const none = all.filter((n) => !n.likely).length;
    const seg = (cls, n, label) => (n ? `<i class="${cls}" style="flex-grow:${n}" title="${esc(label)}: ${num(n)}"></i>` : '');
    const btn = (id, cls, label, n) => `<button class="lkd-b" data-lk="${id}" aria-pressed="${ui.lk === id}">${cls ? `<i class="${cls}"></i>` : ''}<span>${label}</span><b>${num(n)}</b></button>`;
    return `<section class="lkdist" aria-label="How likely, across ${plural(all.length, 'prospect')}">
      <div class="lkd-h"><h2>How likely</h2><span>${plural(all.length, 'prospect')}</span></div>
      <div class="lkd-bar" aria-hidden="true">${counts.map(([l, n]) => seg('lk-' + l.id, n, l.label)).join('')}${seg('lk-none', none, 'Not rated')}</div>
      <div class="lkd-leg" role="group" aria-label="Show one likelihood">${counts.map(([l, n]) => btn(l.id, 'lk-' + l.id, l.label, n)).join('')}${btn('-', 'lk-none', 'Not rated', none)}</div></section>`;
  }
  function item(n) {
    const c = n.co && P.company(n.co);
    const sub = c ? `<span class="gtag g-${c.stage}">${ic(GROUP_ICON[c.stage])}${GROUP_LABEL[c.stage]}</span>` : '<span class="untr">Not tracked yet</span>';
    return `<a class="nitem${ui.n === n.id ? ' sel' : ''}${live.has(n.id) ? ' is-new' : ''}" href="?n=${n.id}" data-n="${n.id}"${ui.n === n.id ? ' aria-current="true"' : ''}>
      ${monoOf(n)}
      <div class="ni-main"><p class="ni-name">${esc(nameOf(n))}</p><p class="ni-sub">${sub}<span>${edited(n)}</span>${live.has(n.id) ? '<span class="live-tag">Just changed</span>' : ''}</p>${snippet(n)}</div>
      ${lkChip(n)}</a>`;
  }
  function listCol(sorted, all) {
    if (P.loading) return `<div class="ncol">${P.state === 'offline-empty' ? `<section class="panel glass"><div class="empty"><div class="art">${ic('wifi')}</div><h3>No connection</h3><p>Qualification notes will appear once you are back online.</p></div></section>` : `<section class="panel glass"><div class="loading-note"><span class="spin"></span>Loading qualification notes</div>${[1, 2, 3, 4, 5].map(() => '<div class="skel-row" style="grid-template-columns:40px 1fr 70px"><span class="skel c2"></span><div><span class="skel l1"></span><span class="skel l2"></span></div><span class="skel c4"></span></div>').join('')}</section>`}</div>`;
    const tr = { '': 'All prospects', yes: 'Tracked companies', no: 'Not tracked yet' };
    const fl = `<div class="filters n-filters" role="toolbar" aria-label="Filter, sort and export">
      ${ui.track ? `<span class="fbtn on"><button data-menu="track" aria-haspopup="menu">${ic('building')}<span class="v">${tr[ui.track]}</span></button><button class="x" data-clear="track" aria-label="Show all prospects">${ic('x')}</button></span>` : `<button class="fbtn" data-menu="track" aria-haspopup="menu">${ic('building')}All prospects${ic('down')}</button>`}
      <button class="fbtn" data-menu="sort" aria-haspopup="menu">${ic('sort')}<span class="v">${SORTS[ui.sort]}</span>${ic('down')}</button>
      <span class="sp"></span><button class="fbtn" data-export>${ic('download')}Export</button></div>`;
    let body;
    if (!sorted.length) {
      const lkL = ui.lk === '-' ? 'not rated' : (LK(ui.lk) ? LK(ui.lk).label.toLowerCase() : '');
      body = `<div class="empty sm"><div class="art">${ic('search')}</div><h3>${ui.q ? `No notes mention “${esc(ui.q)}”` : 'No notes match'}</h3><p>${ui.q ? 'Search looks at every heading, the remarks and the names.' : ''}${ui.lk ? ` Showing only ${lkL} likelihood.` : ''}${ui.track ? ` Showing only ${tr[ui.track].toLowerCase()}.` : ''}</p><div class="acts"><button class="btn" data-clearall>Clear ${ui.q && !ui.lk && !ui.track ? 'search' : 'filters'}</button></div></div>`;
    } else {
      const total = all.length;
      const line = ui.q
        ? `<b>${num(sorted.length)}</b> of ${plural(total, 'prospect')} mention “${esc(ui.q)}”`
        : (filtersOn() ? `<b>${num(sorted.length)}</b> of ${plural(total, 'prospect')}` : `<b>${plural(total, 'prospect')}</b> with notes`);
      const shown = sorted.slice(0, ui.limit);
      body = `<p class="result-line" role="status">${line}${filtersOn() ? '<button class="link" data-clearall style="margin-left:8px">Clear</button>' : ''}</p>
        <div class="nlist">${shown.map(item).join('')}</div>
        ${sorted.length > shown.length ? `<div class="more-row">Showing ${num(shown.length)} of ${num(sorted.length)}<button class="btn sm" data-more>Show ${num(Math.min(100, sorted.length - shown.length))} more</button></div>` : ''}`;
    }
    return `<div class="ncol">${dist(all)}<section class="panel glass nlist-panel" aria-label="Prospects">${fl}${body}</section></div>`;
  }

  /* ---------- The notes themselves ---------- */
  function saveHTML() {
    if (P.offline || ui.save === 'offline') return `<span class="savestate off" role="status">${ic('wifi')}Kept on this device. Saves when you’re back online.</span>`;
    if (ui.save === 'saving') return `<span class="savestate" role="status"><span class="spin"></span>Saving…</span>`;
    return `<span class="savestate ok" role="status">${ic('done')}Saved</span>`;
  }
  function docCol(n) {
    if (P.loading) return P.state === 'offline-empty' ? '' : `<article class="ndoc glass"><span class="skel" style="height:30px;width:50%"></span><span class="skel" style="height:18px;width:70%;margin-top:18px"></span>${[1, 2, 3, 4].map(() => '<span class="skel" style="height:14px;width:30%;margin-top:30px"></span><span class="skel" style="height:44px;margin-top:10px"></span>').join('')}</article>`;
    if (!n) return `<article class="ndoc glass none"><div class="empty"><div class="art">${ic('note')}</div><h3>Choose a prospect</h3><p>Their notes open here. Every prospect is assessed under the same nine headings.</p></div></article>`;
    const c = n.co && P.company(n.co);
    const l = LK(n.likely);
    const head = c
      ? `<div class="nd-id"><h2 id="nd-h">${esc(c.name)}</h2><p><span class="gtag g-${c.stage}">${ic(GROUP_ICON[c.stage])}${GROUP_LABEL[c.stage]}</span><a class="link" href="${P.keep('companies.html?co=' + c.id)}">Open company${ic('arrow')}</a></p></div>`
      : `<div class="nd-id"><label class="sr" for="nd-name">Prospect name</label><input class="nd-name" id="nd-name" data-name value="${esc(n.name)}" placeholder="Who is this prospect?" autocomplete="off"><p><span class="untr">Not tracked yet</span><button class="link" data-link>${ic('building')}Link to a tracked company</button></p></div>`;
    const lkPick = `<div class="nd-lk"><span class="lbl" id="lk-l">How likely is this opportunity?</span>
      <div class="lkpick" role="radiogroup" aria-labelledby="lk-l">${LIKELY.map((x) => `<button role="radio" aria-checked="${n.likely === x.id}" data-likely="${x.id}" class="lk-${x.id}">${meter(x)}<span>${x.label}</span></button>`).join('')}</div>
      ${l ? '<button class="link nd-clear" data-likely="">Clear</button>' : ''}</div>`;
    const f = filled(n);
    const sections = HEADS.map(([k, label, ph]) => `<section class="nh${(n.h[k] || '').trim() ? '' : ' blank'}"><label for="h-${k}">${label}${liveHeads.has(n.id + ':' + k) ? '<span class="live-tag">Changed just now</span>' : ''}</label>
      <textarea class="nta" id="h-${k}" data-h="${k}" rows="${Math.max(1, Math.min(14, Math.ceil((n.h[k] || '').length / 78) + ((n.h[k] || '').match(/\n/g) || []).length))}" placeholder="${esc(ph)}">${esc(n.h[k] || '')}</textarea></section>`).join('');
    const rw = words(n.remarks); const long = (n.remarks || '').length > 280;
    const remarks = long && !ui.remarksOpen
      ? `<div class="rm-prev"><p>${esc(n.remarks.slice(0, 420))}…</p><button class="btn sm" data-rmk="open">${ic('down')}Show all remarks · ${plural(rw, 'word')}</button></div>`
      : `<label class="sr" for="nd-rmk">Remarks</label><textarea class="nta rmk" id="nd-rmk" data-remarks rows="${Math.max(3, Math.min(30, Math.ceil((n.remarks || '').length / 78) + ((n.remarks || '').match(/\n/g) || []).length))}" placeholder="History, concerns, context. As long as you need.">${esc(n.remarks || '')}</textarea>${long ? `<button class="link" data-rmk="close">${ic('up')}Fold the remarks away</button>` : ''}`;
    return `<article class="ndoc glass" aria-labelledby="nd-h">
      <div class="nd-top"><button class="btn sm quiet nd-back" data-back>${ic('left')}All notes</button><span class="sp"></span>${saveHTML()}<button class="icon-btn" data-nmenu aria-label="More for these notes">${ic('more')}</button></div>
      <header class="nd-head">${monoOf(n).replace('cmono', 'cmono lg')}${head}</header>
      ${P.offline ? `<div class="notice warn">${ic('wifi')}<div><p><b>No connection.</b> Keep writing: what you type stays on this device and saves when you’re back online.</p></div></div>` : ''}
      ${lkPick}
      <div class="nd-prog"><span class="ticks" aria-hidden="true">${HEADS.map(([k]) => `<i class="${(n.h[k] || '').trim() ? 'on' : ''}"></i>`).join('')}</span>${f === 9 ? 'All nine headings written' : `${num(f)} of 9 headings written`}</div>
      <div class="nd-body">${sections}</div>
      <section class="nd-remarks"><h3>Remarks <span>Longer history, concerns and context. Folded away when it gets long, so skimming stays easy.</span></h3>${remarks}</section>
      <p class="nd-foot">${edited(n)}. Saved automatically as you write.</p></article>`;
  }

  function render() {
    const all = P.loading ? [] : P.db.notes;
    const sorted = sortList(apply(all));
    lastSorted = sorted;
    if (ui.n && !note(ui.n)) ui.n = '';
    if (!ui.n && !P.loading && innerWidth > 900 && sorted.length && !P.qs.has('none')) ui.n = sorted[0].id;
    const n = note(ui.n);
    const search = (cls) => `<label class="search glass ${cls}">${ic('search')}<span class="sr">Search all notes</span><input type="search" data-q value="${esc(ui.q)}" placeholder="Search everything written"></label>`;
    const empty = !P.loading && !P.db.notes.length;
    document.body.classList.toggle('note-open', !!n);
    P.$('#main').innerHTML = `<div class="bar"><div class="ttl"><h1>Qualification notes</h1><span class="sub">${P.loading ? '' : plural(P.db.notes.length, 'prospect')}</span></div><span class="sp"></span>${search('')}<button class="cta" data-new>${ic('plus')}New notes</button><button class="icon-btn glass mob-only" data-new aria-label="New notes">${ic('plus')}</button></div>
      ${P.offlineBanner()}${empty ? '' : search('m-search')}
      ${empty ? `<section class="panel glass" style="margin-top:22px"><div class="empty"><div class="art">${ic('note')}</div><h3>No qualification notes yet</h3><p>Notes assess every prospect under the same nine headings, with a likelihood to compare them. Start from a company’s record, or here for someone you haven’t tracked yet.</p><div class="acts"><button class="cta" data-new>${ic('plus')}New notes</button><a class="btn" href="${P.keep('companies.html')}">Go to companies</a></div></div></section>`
        : `<div class="nwrap${n ? ' open' : ''}">${listCol(sorted, all)}${docCol(n)}</div>`}`;
    live.clear();
    syncUrl();
  }

  /* ---------- Saving as you write (U4) ---------- */
  let timer = null; let pending = null;
  function setSave(s) { ui.save = s; const el = P.$('.savestate'); if (el) el.outerHTML = saveHTML(); }
  function flush() {
    if (!pending) return;
    const { id, apply: fn } = pending; pending = null; clearTimeout(timer);
    const n = note(id); if (!n) return;
    fn(n);
    if (P.offline) { setSave('offline'); return; }
    n.edited = P.iso(0); P.save();
    setSave('saved');
    const it = P.$(`.nitem[data-n="${id}"]`); if (it) it.outerHTML = item(n);
    const prog = P.$('.nd-prog'); if (prog) { const f = filled(n); prog.innerHTML = `<span class="ticks" aria-hidden="true">${HEADS.map(([k]) => `<i class="${(n.h[k] || '').trim() ? 'on' : ''}"></i>`).join('')}</span>${f === 9 ? 'All nine headings written' : `${num(f)} of 9 headings written`}`; }
  }
  function queue(id, fn) {
    if (pending && pending.id !== id) flush();
    const prev = pending && pending.apply;
    pending = { id, apply: (n) => { if (prev) prev(n); fn(n); } };
    if (!P.offline) setSave('saving');
    clearTimeout(timer); timer = setTimeout(flush, 800);
  }

  /* ---------- Linking, creating, deleting (U5, U6, U8) ---------- */
  function companyPicker(anchor, onPick, title) {
    const cos = P.db.companies.slice().sort((a, b) => (['active', 'lead', 'hold', 'done'].indexOf(a.stage) - ['active', 'lead', 'hold', 'done'].indexOf(b.stage)) || a.name.localeCompare(b.name));
    const list = (s) => {
      const hits = cos.filter((c) => !s || c.name.toLowerCase().includes(s.toLowerCase()));
      return hits.slice(0, 40).map((c) => { const has = noteOf(c.id); return `<button class="mi" data-v="${c.id}"${has ? ' disabled' : ''}><span class="cmono g-${c.stage}">${esc(c.short || P.initials(c.name))}</span><span class="mi-t">${esc(c.name)}</span><small class="mi-note">${has ? 'Has notes' : GROUP_LABEL[c.stage]}</small></button>`; }).join('')
        + (hits.length > 40 ? `<p class="foot">${num(hits.length - 40)} more. Keep typing to narrow it down.</p>` : '') + (hits.length ? '' : '<p class="foot">No tracked company has that name.</p>');
    };
    const m = P.menu(anchor, `<h4>${title}</h4><div class="qe"><input class="input" placeholder="Search companies" aria-label="Search companies" autocomplete="off"></div><div class="cpick">${list('')}</div><p class="foot">Each company has at most one set of notes.</p>`, (v) => { onPick(v); }, {
      onReady: (menu) => menu.querySelector('input').addEventListener('input', (e) => { menu.querySelector('.cpick').innerHTML = list(e.target.value); }),
    });
    m.classList.add('qe-menu', 'pick-menu');
  }
  function linkTo(n, coId, btn) {
    if (P.offline) { P.toast('No connection. The notes weren’t linked.', { err: true }); return; }
    const c = P.company(coId); if (!c || noteOf(coId)) return;
    const was = n.name; n.co = coId; n.name = ''; n.edited = P.iso(0); P.render();
    P.toast(`Linked to ${c.name}. The notes now open from the company too.`, { action: 'Undo', onAction: () => { n.co = null; n.name = was; P.render(); } });
  }
  function openNew(opts) {
    opts = opts || {};
    const st = { mode: opts.mode || 'co', name: opts.name || '', err: opts.err || null, s: '' };
    const scrim = P.el('<div class="scrim top"></div>');
    const d = P.el('<div class="dialog wide over-sheet" role="dialog" aria-modal="true" aria-labelledby="nn-h"></div>');
    scrim.addEventListener('click', () => P.closeTop());
    P.layer([scrim, d]);
    const cos = P.db.companies.filter((c) => c.stage !== 'done').sort((a, b) => (['active', 'lead', 'hold'].indexOf(a.stage) - ['active', 'lead', 'hold'].indexOf(b.stage)) || a.name.localeCompare(b.name));
    function paint(focus) {
      const hits = cos.filter((c) => !st.s || c.name.toLowerCase().includes(st.s.toLowerCase())).slice(0, 30);
      d.innerHTML = `<h2 id="nn-h">New qualification notes</h2><p>Who are they for?</p>
        <div class="seg full lg" role="group" aria-label="Who the notes are for" style="margin-top:14px"><button aria-pressed="${st.mode === 'co'}" data-mode="co">${ic('building')}A tracked company</button><button aria-pressed="${st.mode === 'new'}" data-mode="new">${ic('people')}Not tracked yet</button></div>
        ${st.mode === 'co'
          ? `<div class="field"><label class="sr" for="nn-s">Search companies</label><input class="input" id="nn-s" value="${esc(st.s)}" placeholder="Search companies" autocomplete="off"></div>
             <div class="nn-list">${hits.map((c) => { const has = noteOf(c.id); return `<button class="nn-co" data-co="${c.id}">${'<span class="cmono g-' + c.stage + '">' + esc(c.short || P.initials(c.name)) + '</span>'}<span class="nm">${esc(c.name)}<small>${GROUP_LABEL[c.stage]}</small></span><span class="go">${has ? 'Open its notes' : 'Start notes'}${ic('right')}</span></button>`; }).join('') || '<p class="help">No company with that name. Choose “Not tracked yet” to write notes now and link them later.</p>'}</div>`
          : `<div class="field${st.err ? ' has-err' : ''}"><label for="nn-name">Prospect name</label><input class="input" id="nn-name" value="${esc(st.name)}" placeholder="Like “Borneo Agro, met at the trade fair”" autocomplete="off"${st.err ? ' aria-invalid="true" aria-describedby="nn-err"' : ''}>${st.err ? `<p class="err-msg" id="nn-err">${ic('alert')}Give the prospect a name so the team can find these notes.</p>` : ''}<p class="help">No need to add the company first. You can link these notes to it later.</p></div>`}
        <div class="acts"><button class="btn" data-x>Cancel</button>${st.mode === 'new' ? '<button class="cta" data-ok>Start notes</button>' : ''}</div>`;
      const f = d.querySelector(focus || (st.mode === 'co' ? '#nn-s' : '#nn-name')); if (f) { f.focus(); if (f.value) f.setSelectionRange(f.value.length, f.value.length); }
    }
    paint();
    d.addEventListener('input', (e) => { if (e.target.id === 'nn-s') { st.s = e.target.value; paint('#nn-s'); } if (e.target.id === 'nn-name') st.name = e.target.value; });
    d.addEventListener('keydown', (e) => { if (e.target.id === 'nn-name' && e.key === 'Enter') { e.preventDefault(); d.querySelector('[data-ok]').click(); } });
    d.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-x]')) { P.closeTop(); return; }
      const m = t.closest('[data-mode]'); if (m) { st.mode = m.dataset.mode; st.err = null; paint(); return; }
      const co = t.closest('[data-co]'); if (co) { P.closeTop(); openFor(co.dataset.co); return; }
      if (t.closest('[data-ok]')) {
        const name = st.name.trim();
        if (!name) { st.err = 'name'; paint('#nn-name'); return; }
        if (P.offline) { P.toast('No connection. The notes weren’t started.', { err: true }); return; }
        P.closeTop(); create({ name });
      }
    });
  }
  function create(o) {
    const n = Object.assign({ id: 'nn' + Date.now(), co: null, name: '', likely: '', remarks: '', edited: P.iso(0), h: {} }, o);
    P.db.notes.unshift(n); ui.n = n.id; ui.q = ''; ui.lk = ''; ui.track = ''; live.add(n.id); P.render();
    const f = P.$('#h-need'); if (f) f.focus();
    return n;
  }
  // U5: from a company, in one action. Opens its notes, or starts them.
  function openFor(coId) {
    const has = noteOf(coId);
    if (has) { ui.n = has.id; ui.lk = ''; ui.track = ''; ui.q = ''; P.render(); return; }
    const c = P.company(coId); if (!c) return;
    if (P.offline) { P.toast(`No connection. Notes for ${c.name} can’t be started yet.`, { err: true }); return; }
    create({ co: coId });
    P.toast(`Notes started for ${c.name}`);
  }
  function deleteNote(n) {
    const c = n.co && P.company(n.co);
    P.confirm({ title: `Delete the notes for ${nameOf(n)}?`, body: `All nine headings and the remarks go, for everyone on the team.${c ? ' The company itself stays.' : ''}`, ok: 'Delete notes', onOk: () => {
      if (P.offline) { P.toast('No connection. The notes weren’t deleted.', { err: true }); return; }
      P.db.notes = P.db.notes.filter((x) => x !== n); ui.n = ''; P.render(); P.toast(`Notes for ${nameOf(n)} deleted`);
    } });
  }

  /* ---------- Export (E1) ---------- */
  function openExport() {
    const n = lastSorted.length;
    const file = `qualification-notes-${P.iso(0)}.csv`;
    const scrim = P.el('<div class="scrim top"></div>');
    const d = P.el('<div class="dialog over-sheet" role="dialog" aria-modal="true" aria-labelledby="ex-h"></div>');
    scrim.addEventListener('click', () => P.closeTop());
    P.layer([scrim, d]);
    d.innerHTML = `<h2 id="ex-h">Export qualification notes</h2>
      <p>${n ? `<b>${plural(n, 'prospect')}</b>${filtersOn() ? ', as shown now' : ''}, one row each, with these columns:` : 'No notes are shown right now, so there’s nothing to export. Clear the search or filters first.'}</p>
      ${n ? `<div class="ex-fields">${['Prospect', 'Tracked company', 'Group', 'Likelihood', ...HEADS.map((h) => h[1]), 'Remarks', 'Last edited'].map((x) => `<span>${esc(x)}</span>`).join('')}</div>
      <div class="ex-file">${ic('download')}<div><b>${file}</b><small>A comma-separated spreadsheet file. It opens in Excel, Numbers and Google Sheets.</small></div></div>` : ''}
      <div class="acts"><button class="btn" data-x>Cancel</button><button class="cta" data-ok${n ? '' : ' disabled'}>${ic('download')}Download</button></div>`;
    d.querySelector(n ? '[data-ok]' : '[data-x]').focus();
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) P.closeTop();
      if (e.target.closest('[data-ok]')) {
        const cell = (s) => { s = String(s == null ? '' : s); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        const rows = [['Prospect', 'Tracked company', 'Group', 'Likelihood', ...HEADS.map((h) => h[1]), 'Remarks', 'Last edited']].concat(lastSorted.map((x) => {
          const c = x.co && P.company(x.co);
          return [nameOf(x), c ? 'Yes' : 'No', c ? GROUP_LABEL[c.stage] : '', LK(x.likely) ? LK(x.likely).label : '', ...HEADS.map(([k]) => x.h[k] || ''), x.remarks || '', x.edited || ''];
        }));
        const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file; document.body.appendChild(a); a.click(); a.remove();
        P.closeTop(); P.toast(`Downloaded ${file}`);
      }
    });
  }

  /* ---------- Menus ---------- */
  function openMenu(key, btn) {
    if (key === 'track') return P.menu(btn, `<h4>Show</h4>${P.mi('', 'All prospects', !ui.track)}${P.mi('yes', 'Tracked companies', ui.track === 'yes')}${P.mi('no', 'Not tracked yet', ui.track === 'no')}`, (v) => { ui.track = v; ui.limit = 100; render(); });
    if (key === 'sort') return P.menu(btn, `<h4>Order</h4>${Object.entries(SORTS).map(([k, l]) => P.mi(k, l, ui.sort === k)).join('')}`, (v) => { ui.sort = v; render(); });
  }
  function noteMenu(btn, n) {
    const c = n.co && P.company(n.co);
    P.menu(btn, `${c ? `<a class="mi" href="${P.keep('companies.html?co=' + c.id)}">${ic('building')}<span>Open ${esc(c.name)}</span></a>` : `<button class="mi" data-v="link">${ic('building')}<span>Link to a tracked company</span></button>`}
      <hr><button class="mi red" data-v="delete">${ic('trash')}<span>Delete these notes</span></button>`, (v) => {
      P.closeTop();
      if (v === 'link') companyPicker(btn, (id) => linkTo(n, id), 'Link to a tracked company');
      if (v === 'delete') deleteNote(n);
      return true;
    }, { alignRight: true });
  }

  /* ---------- Events ---------- */
  const app = P.$('#app');
  app.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-new]')) { flush(); openNew(); return; }
    const it = t.closest('[data-n]'); if (it) { e.preventDefault(); flush(); ui.n = it.dataset.n; ui.remarksOpen = false; render(); const top = P.$('.ndoc'); if (top && innerWidth <= 900) scrollTo(0, 0); return; }
    if (t.closest('[data-back]')) { flush(); ui.n = ''; render(); const sel = P.$('.nitem'); if (sel) sel.focus(); return; }
    const lk = t.closest('[data-lk]'); if (lk) { ui.lk = ui.lk === lk.dataset.lk ? '' : lk.dataset.lk; ui.limit = 100; render(); return; }
    const lv = t.closest('[data-likely]');
    if (lv) {
      const n = note(ui.n); if (!n) return;
      const v = lv.dataset.likely; queue(n.id, (x) => { x.likely = v; }); flush();
      P.$$('.lkpick [role="radio"]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.likely === v)));
      const it2 = P.$(`.nitem[data-n="${n.id}"]`); if (it2) it2.outerHTML = item(n);
      P.$('.lkdist').outerHTML = dist(P.db.notes);
      const clr = P.$('.nd-clear'); if (!v && clr) clr.remove(); else if (v && !clr) P.$('.lkpick').insertAdjacentHTML('afterend', '<button class="link nd-clear" data-likely="">Clear</button>');
      return;
    }
    const rk = t.closest('[data-rmk]'); if (rk) { flush(); ui.remarksOpen = rk.dataset.rmk === 'open'; render(); if (ui.remarksOpen) { const r = P.$('#nd-rmk'); if (r) r.focus(); } return; }
    if (t.closest('[data-link]')) { const n = note(ui.n); companyPicker(t.closest('[data-link]'), (id) => linkTo(n, id), 'Link to a tracked company'); return; }
    if (t.closest('[data-nmenu]')) { noteMenu(t.closest('[data-nmenu]'), note(ui.n)); return; }
    const clr = t.closest('[data-clear]'); if (clr) { ui[clr.dataset.clear] = ''; render(); return; }
    const mb = t.closest('[data-menu]'); if (mb) { openMenu(mb.dataset.menu, mb); return; }
    if (t.closest('[data-clearall]')) { ui.q = ''; ui.lk = ''; ui.track = ''; render(); return; }
    if (t.closest('[data-export]')) { openExport(); return; }
    if (t.closest('[data-more]')) { ui.limit += 100; render(); }
  });
  let qTimer;
  app.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-q]')) {
      ui.q = t.value; ui.limit = 100; clearTimeout(qTimer);
      const mobile = !!t.closest('.m-search');
      qTimer = setTimeout(() => { flush(); render(); const i = P.$(mobile ? '.m-search input' : '.bar .search input'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200);
      return;
    }
    const n = note(ui.n); if (!n) return;
    if (t.dataset.h) { const k = t.dataset.h; const v = t.value; queue(n.id, (x) => { x.h[k] = v; }); t.closest('.nh').classList.toggle('blank', !v.trim()); }
    if (t.matches('[data-remarks]')) { const v = t.value; queue(n.id, (x) => { x.remarks = v; }); }
    if (t.matches('[data-name]')) { const v = t.value; queue(n.id, (x) => { x.name = v; }); }
    if (t.matches('.nta')) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
  });
  // "As soon as I move on" (U4): leaving a field saves straight away.
  app.addEventListener('focusout', (e) => { if (e.target.matches('.nta, [data-name]')) flush(); });
  window.addEventListener('beforeunload', flush);

  P.boot({
    page: 'notes', render,
    states: [['', 'Normal'], ['empty', 'Nothing yet (no notes)'], ['loading', 'Loading'], ['saving', 'Saving'], ['offline', 'No connection (keeps writing)'], ['offline-empty', 'No connection, nothing loaded'], ['live', 'Live change from a colleague']],
    opens: [['new', 'New notes: a tracked company'], ['new-untracked', 'New notes: not tracked yet'], ['new-required', 'New notes: name missing'], ['link', 'Link to a tracked company'], ['remarks', 'Long remarks unfolded'], ['delete', 'Delete notes'], ['export', 'Export'], ['menu', 'Notes menu'], ['more', 'Phone: More']],
    afterBoot() {
      const co = q.get('co');
      if (co && !P.loading) openFor(co);
      if (P.state === 'live') setTimeout(() => {
        const n = note('n3') || P.db.notes[0]; if (!n) return;
        n.h.next = 'Contract draft sent on Monday. Yusuf reviews it with his lawyer this week (Sarah).'; n.edited = P.iso(0);
        live.add(n.id); liveHeads.add(n.id + ':next');
        const open = note(ui.n);
        if (open === n) { const ta = P.$('#h-next'); if (ta && document.activeElement !== ta) { ta.value = n.h.next; const lab = ta.closest('.nh').querySelector('label'); lab.insertAdjacentHTML('beforeend', '<span class="live-tag">Changed just now</span>'); } const it = P.$(`.nitem[data-n="${n.id}"]`); if (it) it.outerHTML = item(n); } else P.render();
      }, 1200);
    },
    onOpen(o) {
      if (o === 'new') openNew();
      if (o === 'new-untracked') openNew({ mode: 'new' });
      if (o === 'new-required') openNew({ mode: 'new', err: 'name' });
      if (o === 'link') { const n = P.db.notes.find((x) => !x.co); if (n) { ui.n = n.id; render(); const b = P.$('[data-link]'); if (b) companyPicker(b, (id) => linkTo(n, id), 'Link to a tracked company'); } }
      if (o === 'remarks') { const n = P.db.notes.find((x) => (x.remarks || '').length > 280); if (n) { ui.n = n.id; ui.remarksOpen = true; render(); } }
      if (o === 'delete') { const n = note(ui.n) || P.db.notes[0]; if (n) deleteNote(n); }
      if (o === 'export') openExport();
      if (o === 'menu') { const b = P.$('[data-nmenu]'); if (b) noteMenu(b, note(ui.n)); }
    },
  });
})();
