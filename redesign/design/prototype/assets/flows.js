/* Flows: how recurring work moves between people. Ordered steps with roles, at most one decision whose good and bad
   outcomes can send the work back to an earlier step, several flows, edited in place and saved as you go (M1 to M4). */
(function () {
  const { ic, esc, num, plural } = P;
  const q = P.qs;
  if (!P.db.flows) P.db.flows = [];
  const ui = { f: q.get('f') || '', edit: q.has('edit'), q: '', save: P.state === 'saving' ? 'saving' : 'saved', hl: '' };
  const liveIds = new Set();
  const coll = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  const LABELS = ['Responsible', 'Accountable', 'Consulted', 'Informed', 'Approves', 'Backup'];

  /* ---------- Helpers ---------- */
  const flow = (id) => P.db.flows.find((f) => f.id === id) || null;
  const cur = () => flow(ui.f);
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const owners = (f) => f.steps.concat(f.decision ? f.decision.outcomes : []);
  const ownerOf = (f, id) => owners(f).find((o) => o.id === id) || null;
  const stepNo = (f, id) => f.steps.findIndex((s) => s.id === id) + 1;
  const stepById = (f, id) => f.steps.find((s) => s.id === id) || null;
  function peopleIn(f) { const s = new Set(); owners(f).forEach((o) => o.roles.forEach((r) => r.names.forEach((n) => s.add(n)))); return s; }
  const sorted = () => P.db.flows.slice().sort((a, b) => coll.compare(a.name || '', b.name || ''));
  const summary = (f) => [f.steps.length ? plural(f.steps.length, 'step') : 'No steps yet', f.decision ? 'a decision' : ''].filter(Boolean).join(' · ');
  const edited = (f) => { const d = -P.diff(f.edited); return d <= 0 ? 'Edited today' : (d === 1 ? 'Edited yesterday' : `Edited ${P.ago(f.edited)}`); };
  const textOf = (f) => [f.name, f.desc].concat(owners(f).flatMap((o) => [o.title, o.desc].concat(o.roles.flatMap((r) => [r.label].concat(r.names))))).concat(f.decision ? [f.decision.q] : []).join('\n').toLowerCase();
  function syncUrl() {
    const u = new URLSearchParams();
    if (ui.f) u.set('f', ui.f); if (ui.edit) u.set('edit', ''); if (P.state) u.set('state', P.state);
    const s = u.toString().replace(/=(&|$)/g, '$1') + (P.stress ? (u.toString() ? '&' : '') + 'stress' : '');
    history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
  }

  /* ---------- List of flows (M4) ---------- */
  function item(f) {
    return `<a class="nitem fitem${ui.f === f.id ? ' sel' : ''}" href="?f=${f.id}" data-fl="${f.id}"${ui.f === f.id ? ' aria-current="true"' : ''}>
      <span class="fic" aria-hidden="true">${f.steps.length ? `<b>${num(f.steps.length)}</b>` : ic('flow')}</span>
      <div class="ni-main"><p class="ni-name">${esc(f.name || 'Untitled flow')}</p><p class="ni-sub"><span>${summary(f)}</span><span>${edited(f)}</span>${liveIds.has(f.id) ? '<span class="live-tag">Just changed</span>' : ''}</p></div></a>`;
  }
  function listCol(list) {
    if (P.loading) return `<div class="ncol"><section class="panel glass">${P.state === 'offline-empty' ? `<div class="empty">${'<div class="art">' + ic('wifi') + '</div>'}<h3>No connection</h3><p>Flows will appear once you are back online.</p></div>` : `<div class="loading-note"><span class="spin"></span>Loading flows</div>${[1, 2, 3, 4].map(() => '<div class="skel-row" style="grid-template-columns:40px 1fr"><span class="skel c2"></span><div><span class="skel l1"></span><span class="skel l2"></span></div></div>').join('')}`}</section></div>`;
    const hits = list.filter((f) => !ui.q || textOf(f).includes(ui.q.toLowerCase()));
    return `<div class="ncol"><section class="panel glass nlist-panel" aria-label="Flows">
      <div class="fl-find"><label class="fl-search">${ic('search')}<span class="sr">Find a flow</span><input type="search" data-fq value="${esc(ui.q)}" placeholder="Find a flow, a step or a person"></label></div>
      ${ui.q ? `<p class="result-line" role="status"><b>${num(hits.length)}</b> of ${plural(list.length, 'flow')} mention “${esc(ui.q)}”<button class="link" data-clearq style="margin-left:8px">Clear</button></p>` : `<p class="result-line"><b>${plural(list.length, 'flow')}</b>, A to Z</p>`}
      ${hits.length ? `<div class="nlist">${hits.map(item).join('')}</div>` : `<div class="empty sm"><div class="art">${ic('search')}</div><h3>No flow mentions “${esc(ui.q)}”</h3><p>This looks at names, descriptions, steps, outcomes, roles and people.</p></div>`}</section></div>`;
  }

  /* ---------- Reading a flow (M1, M2, M3) ---------- */
  function rolesRead(roles) {
    if (!roles.length) return '';
    return `<div class="froles">${roles.map((r) => `<div class="frole"><span class="rl">${esc(r.label || 'Role')}</span><span class="rn">${r.names.length ? r.names.map((n) => `<span class="fp">${P.av(n)}<span>${esc(n)}</span></span>`).join('') : '<span class="faint">No names yet</span>'}</span></div>`).join('')}</div>`;
  }
  const liveTag = (id) => (liveIds.has(id) ? '<span class="live-tag">Changed just now</span>' : '');
  function stepRead(f, s, i) {
    const loops = f.decision ? f.decision.outcomes.filter((o) => o.back === s.id) : [];
    return `<li class="fstep${ui.hl === s.id ? ' hl' : ''}${liveIds.has(s.id) ? ' is-new' : ''}" id="st-${s.id}">
      <span class="fnum" aria-hidden="true">${i + 1}</span>
      <div class="fcard"><h3><span class="sr">Step ${i + 1}: </span>${s.title ? esc(s.title) : '<span class="faint">Untitled step</span>'}${liveTag(s.id)}</h3>
        ${s.desc ? `<p class="fdesc">${esc(s.desc)}</p>` : ''}${rolesRead(s.roles)}
        ${loops.map((o) => `<p class="floop-in">${ic('undo')}<span>When the decision is “${esc(o.title || 'Untitled outcome')}”, the work comes back here</span></p>`).join('')}</div></li>`;
  }
  function decisionRead(f) {
    const d = f.decision;
    return `<li class="fstep fdec"><span class="fnum dia" aria-hidden="true">${ic('diamond')}</span>
      <div class="fdcard"><p class="fd-k">Decision</p><h3>${d.q ? esc(d.q) : '<span class="faint">Untitled decision</span>'}</h3>${d.desc ? `<p class="fdesc">${esc(d.desc)}</p>` : ''}
        ${d.outcomes.length ? `<div class="fouts">${d.outcomes.map((o) => { const back = o.back && stepById(f, o.back); return `<section class="fout ${o.good ? 'good' : 'bad'}">
          <p class="fo-k">${ic(o.good ? 'check' : 'x')}${o.good ? 'Good outcome' : 'Bad outcome'}</p>
          <h4>${o.title ? esc(o.title) : '<span class="faint">Untitled outcome</span>'}</h4>${o.desc ? `<p class="fdesc">${esc(o.desc)}</p>` : ''}${rolesRead(o.roles)}
          ${back ? `<button class="floop" data-goto="${back.id}">${ic('undo')}<span>Back to step ${stepNo(f, back.id)}: ${esc(back.title || 'Untitled step')}</span></button>` : `<p class="fend">${ic('flag')}The flow ends here</p>`}</section>`; }).join('')}</div>` : '<p class="faint" style="margin:10px 0 0">No outcomes yet.</p>'}</div></li>`;
  }

  /* ---------- Editing a flow (M1 to M4): every change saves on its own ---------- */
  function rolesEdit(o) {
    return `<div class="eroles">${o.roles.map((r, i) => `<div class="erole" data-role="${r.id}">
        <div class="er-l"><label class="sr" for="rl-${r.id}">Role</label><input class="input sm" id="rl-${r.id}" data-pick="label" value="${esc(r.label)}" placeholder="Role, like “Responsible”" autocomplete="off"></div>
        <div class="people er-n">${r.names.map((n, k) => `<span class="person">${P.av(n)}<span class="nm">${esc(n)}</span><button class="rm" data-a="name-rm" data-n="${k}" aria-label="Remove ${esc(n)}">${ic('x')}</button></span>`).join('')}<input class="add-in" data-pick="name" placeholder="${r.names.length ? 'Add someone' : 'Type a name'}" aria-label="People in ${esc(r.label || 'this role')}" autocomplete="off"></div>
        <div class="er-acts"><button class="icon-btn" data-a="role-up" aria-label="Move this role up"${i ? '' : ' disabled'}>${ic('up')}</button><button class="icon-btn" data-a="role-down" aria-label="Move this role down"${i < o.roles.length - 1 ? '' : ' disabled'}>${ic('down')}</button><button class="icon-btn" data-a="role-del" aria-label="Remove this role">${ic('x')}</button></div></div>`).join('')}
      <button class="btn sm quiet add-role" data-a="role-add">${ic('plus')}Add a role</button></div>`;
  }
  const ta = (attr, val, ph, cls) => `<textarea class="nta${cls ? ' ' + cls : ''}" ${attr} rows="${Math.max(1, Math.min(10, Math.ceil((val || '').length / 70)))}" placeholder="${esc(ph)}">${esc(val || '')}</textarea>`;
  function stepEdit(f, s, i) {
    const n = f.steps.length;
    return `<li class="fstep edit" data-own="${s.id}" id="st-${s.id}"><span class="fnum" aria-hidden="true">${i + 1}</span>
      <div class="fcard"><div class="fe-tools"><span class="fe-k">Step ${i + 1}</span><span class="sp"></span>
        <button class="icon-btn" data-a="step-up" aria-label="Move step ${i + 1} up"${i ? '' : ' disabled'}>${ic('up2')}</button><button class="icon-btn" data-a="step-down" aria-label="Move step ${i + 1} down"${i < n - 1 ? '' : ' disabled'}>${ic('down2')}</button>
        <button class="icon-btn" data-a="step-below" aria-label="Add a step after step ${i + 1}" title="Add a step after this one">${ic('plus')}</button><button class="icon-btn red" data-a="step-del" aria-label="Remove step ${i + 1}">${ic('trash')}</button></div>
        <label class="sr" for="t-${s.id}">Step title</label><input class="fe-title" id="t-${s.id}" data-ofield="title" value="${esc(s.title)}" placeholder="What happens in this step?" autocomplete="off">
        <label class="sr" for="d-${s.id}">Step description</label>${ta(`id="d-${s.id}" data-ofield="desc"`, s.desc, 'Describe it, so anyone can follow')}
        ${rolesEdit(s)}</div></li>`;
  }
  function decisionEdit(f) {
    const d = f.decision;
    if (!d) return f.steps.length ? `<li class="fstep edit"><span class="fnum dia ghost" aria-hidden="true">${ic('diamond')}</span><button class="fadd-dec" data-a="dec-add">${ic('plus')}<span>Add a decision<small>One per flow, after the last step. Its outcomes can send the work back to an earlier step.</small></span></button></li>` : '';
    const opts = (o) => `<option value="">The flow ends here</option>${f.steps.map((s, i) => `<option value="${s.id}"${o.back === s.id ? ' selected' : ''}>Go back to step ${i + 1}: ${esc(s.title || 'Untitled step')}</option>`).join('')}`;
    return `<li class="fstep fdec edit"><span class="fnum dia" aria-hidden="true">${ic('diamond')}</span>
      <div class="fdcard"><div class="fe-tools"><span class="fe-k">Decision</span><span class="sp"></span><button class="btn sm quiet red" data-a="dec-del">${ic('trash')}Remove the decision</button></div>
        <label class="sr" for="dq">The decision</label><input class="fe-title" id="dq" data-dk="q" value="${esc(d.q)}" placeholder="The question, like “Does the client accept?”" autocomplete="off">
        <label class="sr" for="dd">Decision description</label>${ta('id="dd" data-dk="desc"', d.desc, 'How to decide (optional)')}
        <div class="fouts">${d.outcomes.map((o, i) => `<section class="fout edit ${o.good ? 'good' : 'bad'}" data-own="${o.id}">
          <div class="fe-tools"><div class="seg" role="group" aria-label="Outcome ${i + 1} is"><button aria-pressed="${o.good}" data-a="out-good">${ic('check')}Good</button><button aria-pressed="${!o.good}" data-a="out-bad">${ic('x')}Bad</button></div><span class="sp"></span><button class="icon-btn red" data-a="out-del" aria-label="Remove outcome ${i + 1}">${ic('trash')}</button></div>
          <label class="sr" for="t-${o.id}">Outcome title</label><input class="fe-title sm" id="t-${o.id}" data-ofield="title" value="${esc(o.title)}" placeholder="What happens then?" autocomplete="off">
          <label class="sr" for="d-${o.id}">Outcome description</label>${ta(`id="d-${o.id}" data-ofield="desc"`, o.desc, 'Describe it (optional)')}
          ${rolesEdit(o)}
          <div class="field fe-then"><label for="b-${o.id}">Then</label><select class="select" id="b-${o.id}" data-then>${opts(o)}</select></div></section>`).join('')}
          <button class="fadd-out" data-a="out-add">${ic('plus')}Add an outcome</button></div></div></li>`;
  }

  function saveHTML() {
    if (ui.save === 'saving') return '<span class="savestate" role="status"><span class="spin"></span>Saving…</span>';
    return `<span class="savestate ok" role="status">${ic('done')}Saved</span>`;
  }
  function doc(f) {
    if (P.loading) return P.state === 'offline-empty' ? '' : `<article class="ndoc fdoc glass"><span class="skel" style="height:30px;width:50%"></span><span class="skel" style="height:16px;width:70%;margin-top:16px"></span>${[1, 2, 3].map(() => '<span class="skel" style="height:90px;margin-top:22px;border-radius:18px"></span>').join('')}</article>`;
    if (!f) return `<article class="ndoc fdoc glass none"><div class="empty"><div class="art">${ic('flow')}</div><h3>Choose a flow</h3><p>Each flow lists its steps in order, who does what in each, and any decision along the way.</p></div></article>`;
    const ppl = peopleIn(f).size;
    const top = `<div class="nd-top"><button class="btn sm quiet nd-back" data-back>${ic('left')}All flows</button><span class="sp"></span>
      ${ui.edit ? `${saveHTML()}<button class="cta sm" data-a="done">${ic('check')}Done</button>` : (P.offline ? `<span class="savestate off">${ic('wifi')}Editing needs a connection</span>` : `<button class="btn sm" data-a="edit">${ic('edit')}Edit flow</button>`)}
      <button class="icon-btn" data-a="fmenu" aria-label="More for this flow">${ic('more')}</button></div>`;
    const head = ui.edit
      ? `<header class="fhead"><span class="ficon" aria-hidden="true">${ic('flow')}</span><div class="nd-id"><label class="sr" for="fn">Flow name</label><input class="nd-name" id="fn" data-fk="name" value="${esc(f.name)}" placeholder="Name the flow" autocomplete="off">
          <label class="sr" for="fdsc">Flow description</label>${ta('id="fdsc" data-fk="desc"', f.desc, 'What is this flow for, and when does it start?', 'fe-desc')}</div></header>`
      : `<header class="fhead"><span class="ficon" aria-hidden="true">${ic('flow')}</span><div class="nd-id"><h2 id="fd-h">${esc(f.name || 'Untitled flow')}</h2>${f.desc ? `<p class="fh-desc">${esc(f.desc)}</p>` : ''}
          <p class="fmeta">${[summary(f), ppl ? plural(ppl, 'person', 'people') : '', edited(f)].filter(Boolean).map((x) => `<span>${x}</span>`).join('')}</p></div></header>`;
    let body;
    if (ui.edit) body = `<ol class="fsteps edit">${f.steps.map((s, i) => stepEdit(f, s, i)).join('')}
        <li class="fstep edit"><span class="fnum ghost" aria-hidden="true">${ic('plus')}</span><button class="fadd-step" data-a="step-add">${ic('plus')}Add a step</button></li>${decisionEdit(f)}</ol>`;
    else if (!f.steps.length) body = `<div class="empty sm" style="margin-top:20px"><div class="art">${ic('flow')}</div><h3>No steps yet</h3><p>Write the process down step by step, with who does what in each.</p>${P.offline ? '' : `<div class="acts"><button class="cta" data-a="edit">${ic('edit')}Add the first step</button></div>`}</div>`;
    else body = `<ol class="fsteps">${f.steps.map((s, i) => stepRead(f, s, i)).join('')}${f.decision ? decisionRead(f) : ''}</ol>`;
    return `<article class="ndoc fdoc glass${ui.edit ? ' editing' : ''}" aria-labelledby="fd-h">${top}${P.offline ? `<div class="notice warn">${ic('wifi')}<div><p><b>No connection.</b> You can read every flow loaded before. Changes can be made once you’re back online.</p></div></div>` : ''}${head}${body}</article>`;
  }

  function render(focus) {
    const list = P.loading ? [] : sorted();
    if (ui.f && !flow(ui.f)) { ui.f = ''; ui.edit = false; }
    if (!ui.f && !P.loading && innerWidth > 900 && list.length && !P.qs.has('none')) ui.f = list[0].id;
    if (P.offline) ui.edit = false;
    const f = cur();
    const empty = !P.loading && !P.db.flows.length;
    document.body.classList.toggle('note-open', !!f);
    const scroll = scrollY;
    P.$('#main').innerHTML = `<div class="bar"><div class="ttl"><h1>Flows</h1><span class="sub">${P.loading ? '' : plural(P.db.flows.length, 'flow')}</span></div><span class="sp"></span><button class="cta" data-new>${ic('plus')}New flow</button><button class="icon-btn glass mob-only" data-new aria-label="New flow">${ic('plus')}</button></div>
      ${P.offlineBanner()}
      ${empty ? `<section class="panel glass" style="margin-top:22px"><div class="empty"><div class="art">${ic('flow')}</div><h3>No flows yet</h3><p>A flow writes down a process that involves several people: the steps in order, who is responsible, consulted or informed in each, and what happens at a decision.</p><div class="acts"><button class="cta" data-new>${ic('plus')}New flow</button></div></div></section>`
        : `<div class="nwrap fwrap${f ? ' open' : ''}">${listCol(list)}${doc(f)}</div>`}`;
    liveIds.clear();
    if (focus) { const el = P.$(focus); if (el) { scrollTo(0, scroll); el.focus({ preventScroll: true }); if (el.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length); } } else scrollTo(0, scroll);
    syncUrl();
  }

  /* ---------- Saving (changes save instantly; a quiet sign shows it) ---------- */
  let saveT;
  function setSave() { const el = P.$('.savestate'); if (el) el.outerHTML = saveHTML(); }
  function changed() {
    const f = cur(); if (!f) return;
    f.edited = P.iso(0); ui.save = 'saving'; setSave();
    clearTimeout(saveT); saveT = setTimeout(() => { ui.save = 'saved'; setSave(); P.save(); const it = P.$(`.fitem[data-fl="${f.id}"]`); if (it) it.outerHTML = item(f); }, 600);
  }

  /* ---------- Name and label suggestions (as for task people, W4) ---------- */
  let sugg = null;
  const closeSugg = () => { if (sugg) { sugg.remove(); sugg = null; } };
  const roleCtx = (el) => { const f = cur(); const own = ownerOf(f, el.closest('[data-own]').dataset.own); const r = own.roles.find((x) => x.id === el.closest('[data-role]').dataset.role); return { f, own, r }; };
  function labelsInUse() { const s = new Set(LABELS); P.db.flows.forEach((f) => owners(f).forEach((o) => o.roles.forEach((r) => { if (r.label.trim()) s.add(r.label.trim()); }))); return Array.from(s); }
  function namesInUse() { const s = new Set(P.allNames()); P.db.flows.forEach((f) => peopleIn(f).forEach((n) => s.add(n))); return Array.from(s).sort(coll.compare); }
  function showSugg(input) {
    closeSugg();
    const kind = input.dataset.pick; const v = input.value.trim().toLowerCase();
    const { r } = roleCtx(input);
    const pool = kind === 'label' ? labelsInUse() : namesInUse();
    const taken = new Set(kind === 'name' ? r.names : []);
    const hits = pool.filter((x) => !taken.has(x) && (!v || x.toLowerCase().includes(v)) && !(kind === 'label' && x.toLowerCase() === v)).slice(0, 7);
    const exact = pool.some((x) => x.toLowerCase() === v);
    let html = hits.map((x, i) => `<button type="button" data-sg="${esc(x)}" class="${i === 0 && (kind === 'name' || v) ? 'hl' : ''}">${kind === 'name' ? P.av(x) : ''}<span>${esc(x)}</span></button>`).join('');
    if (hits.length) html = `<h4>${kind === 'name' ? 'Names already in use' : 'Roles already in use'}</h4>${html}`;
    if (kind === 'name' && v && !exact) html += `<button type="button" class="new${hits.length ? '' : ' hl'}" data-sg="${esc(input.value.trim())}"><span class="plus">${ic('plus')}</span><span>Add “${esc(input.value.trim())}” as a new name</span></button>`;
    if (!html) return;
    sugg = P.el(`<div class="suggest" role="listbox">${html}</div>`);
    input.parentElement.appendChild(sugg);
    sugg.addEventListener('mousedown', (e) => e.preventDefault());
    sugg.addEventListener('click', (e) => { const b = e.target.closest('[data-sg]'); if (b) pick(input, b.dataset.sg); });
  }
  function pick(input, val) {
    val = val.trim(); if (!val) return;
    const { r } = roleCtx(input);
    closeSugg();
    if (input.dataset.pick === 'label') { r.label = val; input.value = val; changed(); return; }
    if (!r.names.includes(val)) r.names.push(val);
    changed(); render(`[data-role="${r.id}"] [data-pick="name"]`);
  }

  /* ---------- Changing the structure ---------- */
  const blank = () => ({ id: uid('st'), title: '', desc: '', roles: [{ id: uid('r'), label: 'Responsible', names: [] }] });
  function act(a, el) {
    const f = cur(); if (!f) return;
    const ownEl = el.closest('[data-own]'); const own = ownEl ? ownerOf(f, ownEl.dataset.own) : null;
    const roleEl = el.closest('[data-role]'); const role = roleEl && own ? own.roles.find((x) => x.id === roleEl.dataset.role) : null;
    const move = (arr, i, by) => { const [x] = arr.splice(i, 1); arr.splice(i + by, 0, x); };
    const si = own ? f.steps.indexOf(own) : -1;
    switch (a) {
      case 'edit': ui.edit = true; render('#fn'); return;
      case 'done': clearTimeout(saveT); ui.save = 'saved'; P.save(); ui.edit = false; render(); P.toast('Flow saved for everyone'); return;
      case 'step-add': { const s = blank(); f.steps.push(s); changed(); render(`#t-${s.id}`); return; }
      case 'step-below': { const s = blank(); f.steps.splice(si + 1, 0, s); changed(); render(`#t-${s.id}`); return; }
      case 'step-up': move(f.steps, si, -1); changed(); render(`[data-own="${own.id}"] [data-a="step-up"]:not(:disabled), [data-own="${own.id}"] [data-a="step-down"]`); return;
      case 'step-down': move(f.steps, si, 1); changed(); render(`[data-own="${own.id}"] [data-a="step-down"]:not(:disabled), [data-own="${own.id}"] [data-a="step-up"]`); return;
      case 'step-del': {
        const backs = f.decision ? f.decision.outcomes.filter((o) => o.back === own.id) : [];
        f.steps.splice(si, 1); backs.forEach((o) => { o.back = null; }); changed(); render();
        P.toast(`Step ${si + 1} removed${backs.length ? `. ${backs.length === 1 ? 'An outcome that went back to it now ends' : 'Outcomes that went back to it now end'} the flow` : ''}`, { action: 'Undo', onAction: () => { f.steps.splice(si, 0, own); backs.forEach((o) => { o.back = own.id; }); changed(); render(); } });
        return;
      }
      case 'role-add': { const r = { id: uid('r'), label: '', names: [] }; own.roles.push(r); changed(); render(`#rl-${r.id}`); return; }
      case 'role-up': case 'role-down': { const i = own.roles.indexOf(role); move(own.roles, i, a === 'role-up' ? -1 : 1); changed(); render(`[data-role="${role.id}"] [data-a="${a}"]:not(:disabled), [data-role="${role.id}"] .add-in`); return; }
      case 'role-del': { const i = own.roles.indexOf(role); own.roles.splice(i, 1); changed(); render(); P.toast(`Role${role.label ? ` “${role.label}”` : ''} removed`, { action: 'Undo', onAction: () => { own.roles.splice(i, 0, role); changed(); render(); } }); return; }
      case 'name-rm': role.names.splice(+el.dataset.n, 1); changed(); render(`[data-role="${role.id}"] .add-in`); return;
      case 'dec-add': { f.decision = { q: '', desc: '', outcomes: [{ id: uid('o'), good: true, title: '', desc: '', roles: [], back: null }, { id: uid('o'), good: false, title: '', desc: '', roles: [], back: null }] }; changed(); render('#dq'); return; }
      case 'dec-del': { const d = f.decision; f.decision = null; changed(); render(); P.toast('Decision removed', { action: 'Undo', onAction: () => { f.decision = d; changed(); render(); } }); return; }
      case 'out-add': { const o = { id: uid('o'), good: false, title: '', desc: '', roles: [], back: null }; f.decision.outcomes.push(o); changed(); render(`#t-${o.id}`); return; }
      case 'out-del': { const i = f.decision.outcomes.indexOf(own); f.decision.outcomes.splice(i, 1); changed(); render(); P.toast('Outcome removed', { action: 'Undo', onAction: () => { f.decision.outcomes.splice(i, 0, own); changed(); render(); } }); return; }
      case 'out-good': case 'out-bad': own.good = a === 'out-good'; changed(); render(`[data-own="${own.id}"] [data-a="${a}"]`); return;
      case 'fmenu': flowMenu(el, f); return;
      default:
    }
  }

  /* ---------- New flow, delete (M4) ---------- */
  function openNew(opts) {
    opts = opts || {};
    const st = { name: '', err: !!opts.err };
    const scrim = P.el('<div class="scrim top"></div>');
    const d = P.el('<div class="dialog over-sheet" role="dialog" aria-modal="true" aria-labelledby="nf-h"></div>');
    scrim.addEventListener('click', () => P.closeTop());
    P.layer([scrim, d]);
    function paint() {
      d.innerHTML = `<h2 id="nf-h">New flow</h2><p>Name the process, like “New client onboarding”. Then add its steps.</p>
        <div class="field${st.err ? ' has-err' : ''}"><label for="nf-name">Name</label><input class="input" id="nf-name" value="${esc(st.name)}" placeholder="Flow name" autocomplete="off"${st.err ? ' aria-invalid="true" aria-describedby="nf-err"' : ''}>${st.err ? `<p class="err-msg" id="nf-err">${ic('alert')}Give the flow a name, so the team can find it.</p>` : ''}</div>
        <div class="acts"><button class="btn" data-x>Cancel</button><button class="cta" data-ok>Create flow</button></div>`;
      const i = d.querySelector('#nf-name'); i.focus(); i.setSelectionRange(i.value.length, i.value.length);
    }
    paint();
    d.addEventListener('input', (e) => { if (e.target.id === 'nf-name') st.name = e.target.value; });
    d.addEventListener('keydown', (e) => { if (e.target.id === 'nf-name' && e.key === 'Enter') { e.preventDefault(); submit(); } });
    d.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) P.closeTop(); if (e.target.closest('[data-ok]')) submit(); });
    function submit() {
      const name = st.name.trim();
      if (!name) { st.err = true; paint(); return; }
      if (P.offline) { P.toast('No connection. The flow wasn’t created.', { err: true }); return; }
      const f = { id: uid('f'), name, desc: '', edited: P.iso(0), steps: [blank()], decision: null };
      P.db.flows.push(f); P.closeTop(); ui.f = f.id; ui.edit = true; ui.q = ''; liveIds.add(f.id); P.save();
      render(`#t-${f.steps[0].id}`); P.toast(`Flow “${name}” created. Add its steps; everything saves as you go.`);
    }
  }
  function deleteFlow(f) {
    const parts = [f.steps.length ? plural(f.steps.length, 'step') : '', f.decision ? 'the decision' : ''].filter(Boolean).join(' and ');
    P.confirm({ title: `Delete “${f.name || 'Untitled flow'}”?`, body: `${parts ? `Its ${parts} go` : 'It goes'}, for everyone on the team.`, ok: 'Delete flow', onOk: () => {
      if (P.offline) { P.toast('No connection. The flow wasn’t deleted.', { err: true }); return; }
      P.db.flows = P.db.flows.filter((x) => x !== f); ui.f = ''; ui.edit = false; render(); P.toast(`Flow “${f.name || 'Untitled flow'}” deleted`);
    } });
  }
  function flowMenu(btn, f) {
    P.menu(btn, `${ui.edit ? `<button class="mi" data-v="done">${ic('check')}<span>Done editing</span></button>` : `<button class="mi" data-v="edit"${P.offline ? ' disabled' : ''}>${ic('edit')}<span>Edit flow</span></button>`}
      <hr><button class="mi red" data-v="delete"${P.offline ? ' disabled' : ''}>${ic('trash')}<span>Delete flow</span></button>`, (v) => {
      P.closeTop();
      if (v === 'edit' || v === 'done') act(v, btn);
      if (v === 'delete') deleteFlow(f);
      return true;
    }, { alignRight: true });
  }

  /* ---------- Events ---------- */
  const app = P.$('#app');
  app.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-new]')) { openNew(); return; }
    const it = t.closest('[data-fl]'); if (it) { e.preventDefault(); ui.f = it.dataset.fl; ui.edit = false; ui.hl = ''; render(); if (innerWidth <= 900) scrollTo(0, 0); return; }
    if (t.closest('[data-back]')) { ui.edit = false; const id = ui.f; ui.f = ''; render(); const s = P.$(`[data-fl="${id}"]`); if (s) s.focus(); return; }
    if (t.closest('[data-clearq]')) { ui.q = ''; render(); return; }
    const go = t.closest('[data-goto]');
    if (go) { ui.hl = go.dataset.goto; render(); const s = P.$(`#st-${go.dataset.goto}`); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => { ui.hl = ''; const x = P.$('.fstep.hl'); if (x) x.classList.remove('hl'); }, 2400); return; }
    const a = t.closest('[data-a]'); if (a && !a.disabled) act(a.dataset.a, a);
  });
  app.addEventListener('input', (e) => {
    const t = e.target; const f = cur();
    if (t.matches('[data-fq]')) { ui.q = t.value; clearTimeout(app._q); app._q = setTimeout(() => { render(); const i = P.$('[data-fq]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200); return; }
    if (!f || !ui.edit) return;
    if (t.dataset.fk) { f[t.dataset.fk] = t.value; changed(); }
    if (t.dataset.ofield) { ownerOf(f, t.closest('[data-own]').dataset.own)[t.dataset.ofield] = t.value; changed(); }
    if (t.dataset.dk) { f.decision[t.dataset.dk] = t.value; changed(); }
    if (t.dataset.pick === 'label') { roleCtx(t).r.label = t.value; changed(); showSugg(t); }
    if (t.dataset.pick === 'name') showSugg(t);
    if (t.matches('.nta')) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
  });
  app.addEventListener('change', (e) => {
    const t = e.target; const f = cur();
    if (t.matches("[data-then]") && f) { ownerOf(f, t.closest('[data-own]').dataset.own).back = t.value || null; changed(); }
  });
  app.addEventListener('focusin', (e) => { if (e.target.dataset && e.target.dataset.pick) showSugg(e.target); });
  app.addEventListener('focusout', (e) => { if (e.target.dataset && e.target.dataset.pick) setTimeout(() => { if (!document.activeElement || !document.activeElement.dataset || !document.activeElement.dataset.pick) closeSugg(); }, 0); });
  app.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!t.dataset || !t.dataset.pick) return;
    const items = sugg ? Array.from(sugg.querySelectorAll('[data-sg]')) : [];
    const at = items.findIndex((b) => b.classList.contains('hl'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; items.forEach((b) => b.classList.remove('hl')); items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].classList.add('hl'); }
    if (e.key === 'Enter') { e.preventDefault(); const h = items[at]; if (h) pick(t, h.dataset.sg); else if (t.dataset.pick === 'name') pick(t, t.value); else closeSugg(); }
    if (e.key === 'Escape' && sugg) { e.stopPropagation(); closeSugg(); }
    if (e.key === 'Backspace' && t.dataset.pick === 'name' && !t.value) { const { r } = roleCtx(t); if (r.names.length) { r.names.pop(); changed(); render(`[data-role="${r.id}"] .add-in`); } }
  });

  P.boot({
    page: 'flows', render,
    states: [['', 'Normal'], ['empty', 'Nothing yet (no flows)'], ['loading', 'Loading'], ['saving', 'Saving'], ['offline', 'No connection (read only)'], ['offline-empty', 'No connection, nothing loaded'], ['live', 'Live change from a colleague']],
    opens: [['edit', 'Editing a flow'], ['new', 'New flow'], ['new-required', 'New flow: name missing'], ['names', 'Editing: name suggestions'], ['decision-new', 'Editing: adding a decision'], ['no-steps', 'A flow with no steps'], ['menu', 'Flow menu'], ['delete', 'Delete a flow']],
    afterBoot() {
      if (P.state === 'saving' && cur()) { ui.edit = true; render(); }
      if (P.state === 'live') setTimeout(() => {
        const f = flow('f1') || P.db.flows[0]; if (!f || !f.steps[2]) return;
        f.steps[2].desc = 'Agree the go-live date, who the client’s champion is, and how we’ll keep in touch. Send the summary the same day.'; f.edited = P.iso(0);
        liveIds.add(f.steps[2].id); liveIds.add(f.id); render();
      }, 1200);
    },
    onOpen(o) {
      const first = cur() || sorted()[0];
      if (o === 'edit' && first) { ui.f = first.id; ui.edit = true; render(); }
      if (o === 'new') openNew();
      if (o === 'new-required') openNew({ err: true });
      if (o === 'names' && first) { ui.f = (flow('f1') || first).id; ui.edit = true; render(); const i = P.$('.fstep.edit [data-pick="name"]'); if (i) { i.value = 'a'; i.focus(); showSugg(i); } }
      if (o === 'decision-new') { const f = flow('f5') || P.db.flows.find((x) => !x.decision && x.steps.length); if (f) { ui.f = f.id; ui.edit = true; render(); act('dec-add', P.$('#main')); } }
      if (o === 'no-steps') { const f = flow('f6') || P.db.flows.find((x) => !x.steps.length); if (f) { ui.f = f.id; render(); } }
      if (o === 'menu') { const b = P.$('[data-a="fmenu"]'); if (b) flowMenu(b, cur()); }
      if (o === 'delete' && first) deleteFlow(first);
    },
  });
})();
