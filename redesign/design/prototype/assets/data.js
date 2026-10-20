/* Mock data for the prototype. "Today" is fixed at Tuesday 20 October 2026.
   Dates are written as offsets from today so the data never goes stale. */
(function () {
  const TODAY = new Date(2026, 9, 20);
  const d = (n) => {
    if (n === null || n === undefined) return null;
    const x = new Date(TODAY); x.setDate(x.getDate() + n);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  };

  const TYPES = ['Follow-up', 'Proposal', 'Demo', 'Trial', 'Review', 'Renewal', 'Admin', 'Hiring'];
  const TOUCH = ['Call', 'Email', 'Meeting', 'Message', 'Visit'];

  /* ---------- Normal data ---------- */
  function normal() {
    const people = ['Rina Hartono', 'Kevin Tan', 'Dimas Prasetyo', 'Aditya Wijaya', 'Sarah Lim', 'Maya Chen', 'Joko Susanto'];
    // Companies: only what tasks need here. "done" means the deal is done, so its tasks count as client work.
    const companies = [
      { id: 'hal', name: 'Halcyon Logistics', short: 'HL', stage: 'active', target: d(-1), last: d(-6) },
      { id: 'nor', name: 'Northwind Clinics', short: 'NC', stage: 'active', target: d(0), last: d(-15) },
      { id: 'pel', name: 'Pelita Foods', short: 'PF', stage: 'active', target: d(2), last: d(-3) },
      { id: 'mer', name: 'Meridian Bank', short: 'MB', stage: 'done', target: d(3), last: d(-2) },
      { id: 'arc', name: 'Arcadia Retail Group', short: 'AR', stage: 'active', target: d(10), last: d(-9) },
      { id: 'sol', name: 'Solace Hotels', short: 'SH', stage: 'done', target: d(15), last: d(-21) },
      { id: 'kir', name: 'Kirana Health', short: 'KH', stage: 'active', target: d(7), last: d(-4) },
      { id: 'tir', name: 'Tirta Water', short: 'TW', stage: 'done', target: d(8), last: d(-1) },
      { id: 'bay', name: 'Bayu Motors', short: 'BM', stage: 'active', target: null, last: d(-18) },
      { id: 'lum', name: 'Lumen Education', short: 'LE', stage: 'lead', target: null, last: null },
    ];
    const groups = [
      { id: 'q4', name: 'Q4 planning', short: 'Q4', hue: 0, important: true },
      { id: 'hiring', name: 'Hiring', short: 'H', hue: 1, important: false },
      { id: 'office', name: 'Office move', short: 'O', hue: 2, important: false },
      { id: 'ops', name: 'Ops housekeeping', short: 'OH', hue: 3, important: false },
    ];
    const T = (o) => Object.assign({ co: null, group: null, type: '', touch: '', prio: '', start: null, end: null, last: null, key: '', resp: [], inf: [], done: false, doneAt: null }, o);
    const tasks = [
      T({ id: 't1', desc: 'Send the revised proposal with volume pricing', co: 'hal', type: 'Proposal', touch: 'Email', prio: 'high', start: d(-5), end: d(-1), last: d(-6), resp: ['Rina Hartono'], inf: [{ name: 'Dimas Prasetyo', note: 'backup' }], key: 'They asked for tiered pricing above 2,000 shipments a month. Include the 12-month lock-in option and the onboarding fee waiver we discussed on the call.' }),
      T({ id: 't2', desc: 'Draft the Q4 sales targets', group: 'q4', type: 'Admin', prio: 'high', start: d(-8), end: d(-2), resp: ['Rina Hartono', 'Kevin Tan'], key: 'Split by product line. Use Q3 actuals as the floor.' }),
      T({ id: 't3', desc: 'Book a demo with their finance lead', co: 'nor', type: 'Demo', touch: 'Call', prio: 'high', end: d(0), last: d(-15), resp: ['Kevin Tan'] }),
      T({ id: 't4', desc: 'Update the onboarding checklist for new hires', group: 'hiring', type: 'Hiring', prio: 'medium', start: d(-2), end: d(1), resp: ['Maya Chen'] }),
      T({ id: 't5', desc: 'Confirm the trial accounts are active', co: 'pel', type: 'Trial', touch: 'Email', prio: 'medium', start: d(-3), end: d(2), last: d(-3), resp: ['Sarah Lim'], inf: [{ name: 'Rina Hartono', note: 'recipient' }] }),
      T({ id: 't6', desc: 'Prepare the quarterly review deck', co: 'mer', type: 'Review', touch: 'Meeting', prio: 'medium', start: d(-1), end: d(3), last: d(-2), resp: ['Aditya Wijaya'], key: 'Usage is up 18% since July. Bring the support ticket summary.' }),
      T({ id: 't25', desc: 'Review the trial usage report', co: 'pel', type: 'Trial', touch: 'Meeting', end: d(3), last: d(-3), resp: ['Sarah Lim', 'Rina Hartono'] }),
      T({ id: 't26', desc: 'Finalise the hiring budget', group: 'hiring', type: 'Hiring', prio: 'high', end: d(3), resp: ['Rina Hartono'], inf: [{ name: 'Maya Chen', note: '' }] }),
      T({ id: 't27', desc: 'Submit the October expense claims', group: 'ops', type: 'Admin', end: d(3), resp: ['Dimas Prasetyo'] }),
      T({ id: 't7', desc: 'Collect quotes from three moving companies', group: 'office', type: 'Admin', start: d(-3), end: d(10), resp: ['Dimas Prasetyo'], inf: [{ name: 'Maya Chen', note: 'approves spend' }] }),
      T({ id: 't8', desc: 'Share the retail rollout case study', co: 'arc', type: 'Follow-up', touch: 'Email', prio: 'medium', start: d(-2), end: d(10), last: d(-9), resp: ['Dimas Prasetyo'] }),
      T({ id: 't9', desc: 'Send the renewal reminder', co: 'sol', type: 'Renewal', touch: 'Email', start: d(-1), end: d(15), last: d(-21), resp: ['Kevin Tan'], inf: [{ name: 'Aditya Wijaya', note: 'account owner' }] }),
      T({ id: 't21', desc: 'Update the price list for 2027', group: 'q4', type: 'Admin', prio: 'medium', start: d(-1), end: d(6), resp: ['Aditya Wijaya'] }),
      T({ id: 't10', desc: 'Plan the November team offsite', group: 'q4', type: 'Admin', start: d(6), end: d(16), resp: ['Maya Chen'], inf: [{ name: 'Rina Hartono', note: '' }, { name: 'Kevin Tan', note: '' }] }),
      T({ id: 't11', desc: 'Shortlist candidates for the sales associate role', group: 'hiring', type: 'Hiring', prio: 'high', end: d(5), resp: ['Maya Chen', 'Rina Hartono'] }),
      T({ id: 't12', desc: 'Follow up on the pilot feedback', co: 'kir', type: 'Follow-up', touch: 'Call', prio: 'medium', end: d(7), last: d(-4), resp: ['Aditya Wijaya'] }),
      T({ id: 't13', desc: 'Send the onboarding pack', co: 'tir', type: 'Follow-up', touch: 'Email', end: d(8), last: d(-1), resp: ['Sarah Lim'] }),
      T({ id: 't14', desc: 'Renew the office internet contract', group: 'ops', type: 'Admin', end: d(12), resp: ['Dimas Prasetyo'] }),
      T({ id: 't15', desc: 'Ask for their fleet numbers before the pricing call', co: 'hal', type: 'Follow-up', touch: 'Call', prio: 'high', end: d(4), last: d(-6), resp: ['Rina Hartono'] }),
      T({ id: 't16', desc: 'Introduce the new account manager', co: 'sol', type: 'Review', touch: 'Meeting', end: d(9), last: d(-21), resp: ['Aditya Wijaya'], inf: [{ name: 'Kevin Tan', note: 'handing over' }] }),
      T({ id: 't17', desc: 'Check the label printer warranty', group: 'ops', type: 'Admin', resp: ['Dimas Prasetyo'] }),
      T({ id: 't18', desc: 'Write a one-pager on the loyalty add-on', group: 'q4', prio: 'low', resp: ['Kevin Tan'] }),
      T({ id: 't19', desc: 'Call about the trial extension', co: 'bay', type: 'Trial', touch: 'Call', last: d(-18), resp: ['Kevin Tan'] }),
      T({ id: 't20', desc: 'Order new business cards', type: 'Admin', end: d(13), resp: ['Sarah Lim'] }),
      T({ id: 't22', desc: 'Prepare the contract draft', co: 'pel', type: 'Proposal', prio: 'high', end: d(6), last: d(-3), resp: ['Rina Hartono'], inf: [{ name: 'Sarah Lim', note: 'backup' }] }),
      T({ id: 't23', desc: 'Check in after the go-live', co: 'tir', type: 'Follow-up', touch: 'Call', end: d(11), last: d(-1), resp: ['Sarah Lim'] }),
      T({ id: 't24', desc: 'Set up desks for new joiners', group: 'office', type: 'Admin', end: d(18), resp: ['Dimas Prasetyo'] }),
      T({ id: 't29', desc: 'Research CRM integrations for the sales pipeline', group: 'ops', type: 'Admin', start: d(-4), resp: ['Kevin Tan'], inf: [{ name: 'Rina Hartono', note: 'decides' }] }),
      T({ id: 't30', desc: 'Prepare the trade fair booth materials', group: 'q4', type: 'Admin', prio: 'medium', start: d(1), end: d(7), resp: ['Maya Chen', 'Sarah Lim'], inf: [{ name: 'Kevin Tan', note: 'staffs the booth' }] }),
      T({ id: 't31', desc: 'Send the year-end pricing letter', co: 'mer', type: 'Renewal', touch: 'Email', start: d(14), end: d(21), last: d(-2), resp: ['Aditya Wijaya'] }),
      T({ id: 't28', desc: 'Draft the first outreach email', co: 'lum', type: 'Follow-up', touch: 'Email', prio: 'low', end: d(9), resp: ['Maya Chen'] }),
      // Finished
      T({ id: 'd1', desc: 'Send the welcome email', co: 'tir', type: 'Follow-up', touch: 'Email', end: d(-1), last: d(-1), resp: ['Sarah Lim'], done: true, doneAt: d(-1) }),
      T({ id: 'd2', desc: 'Book the meeting room for the pipeline sync', group: 'ops', end: d(-2), resp: ['Maya Chen'], done: true, doneAt: d(-2) }),
      T({ id: 'd3', desc: 'Send the pricing sheet', co: 'kir', type: 'Proposal', touch: 'Email', end: d(-3), last: d(-4), resp: ['Aditya Wijaya'], done: true, doneAt: d(-4) }),
      T({ id: 'd4', desc: 'Collect signatures for the renewal', co: 'mer', type: 'Renewal', end: d(-1), last: d(-2), resp: ['Aditya Wijaya'], done: true, doneAt: d(-2) }),
      T({ id: 'd5', desc: 'Post the sales associate job ad', group: 'hiring', type: 'Hiring', end: d(-6), resp: ['Maya Chen'], done: true, doneAt: d(-8) }),
      T({ id: 'd6', desc: 'Measure the new office floor plan', group: 'office', end: d(-9), resp: ['Dimas Prasetyo'], done: true, doneAt: d(-12) }),
      T({ id: 'd7', desc: 'Run the Q3 pipeline review', group: 'q4', end: d(-20), resp: ['Rina Hartono', 'Kevin Tan'], done: true, doneAt: d(-19) }),
      T({ id: 'd8', desc: 'Send the trial welcome pack', co: 'pel', type: 'Trial', touch: 'Email', end: d(-12), last: d(-12), resp: ['Sarah Lim'], done: true, doneAt: d(-12) }),
    ];
    const ev = (o) => Object.assign({ allDay: false, url: '#calendar' }, o);
    const events = [
      ev({ date: d(0), title: 'Sarah out of office', allDay: true }),
      ev({ date: d(0), title: 'Weekly pipeline sync', start: '09:30', end: '10:15' }),
      ev({ date: d(0), title: 'Lunch with Pelita Foods', start: '12:30', end: '14:00' }),
      ev({ date: d(0), title: 'Interview, sales associate', start: '16:00', end: '17:00' }),
      ev({ date: d(1), title: 'Supplier call', start: '10:00', end: '10:30' }),
      ev({ date: d(2), title: 'Kirana Health site visit', start: '13:00', end: '15:00' }),
      ev({ date: d(3), title: 'Board update', start: '15:00', end: '16:00' }),
      ev({ date: d(8), title: 'Trade fair setup', allDay: true }),
      ev({ date: d(9), title: 'Trade fair', allDay: true }),
      ev({ date: d(9), title: 'Client dinner', start: '19:00', end: '21:00' }),
      ev({ date: d(5), title: 'Partner webinar', start: '14:00', end: '15:00' }),
      ev({ date: d(6), title: 'Weekly pipeline sync', start: '09:30', end: '10:15' }),
      ev({ date: d(10), title: 'Quarterly review with Meridian Bank', start: '10:00', end: '12:00' }),
      ev({ date: d(13), title: 'Weekly pipeline sync', start: '09:30', end: '10:15' }),
      ev({ date: d(16), title: 'Team offsite', allDay: true }),
      ev({ date: d(17), title: 'Team offsite', allDay: true }),
      ev({ date: d(20), title: 'Weekly pipeline sync', start: '09:30', end: '10:15' }),
      ev({ date: d(23), title: 'Board update', start: '15:00', end: '16:00' }),
    ];
    return { people, companies, groups, tasks, events, types: TYPES.slice(), touch: TOUCH.slice() };
  }

  /* ---------- Stress data ---------- */
  function stress() {
    let seed = 7;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

    const people = [
      'Raden Ajeng Kartini Soerjosoemarno-Wirjodiningrat', 'Zhāng Wěi 张伟', 'Nguyễn Thị Minh Khai', 'محمد عبد الرحمن', 'Siriporn Chaiyaphum ศิริพร',
      'Rina Hartono', 'Kevin Tan', 'Dimas Prasetyo', 'Aditya Wijaya', 'Sarah Lim', 'Maya Chen', 'Bo', 'Li', 'Oluwaseun Adebayo-Okonkwo',
      'Maximilianus Theodorus van der Westhuizen', 'Ayu', 'Putri Ramadhani', 'Hendra Gunawan', 'Yuki Tanaka 田中由紀', 'Priya Raghunathan',
      'Kim Ji-woo 김지우', 'Fatimah Az-Zahra', 'Bambang Susilo', 'Lestari Wulandari', 'Agus', 'Wahyu Nugroho', 'Grace Simanjuntak',
      'Christopher Alexander Montgomery-Fitzgerald', 'Dewi', 'Ilham Maulana',
    ];
    const coNames = [
      ['Internationalebeschaffungsgesellschaftfürindustrieanlagenundmaschinenbau', 'IN'],
      ['PT Sinar Nusantara Agribusiness and Food Processing International Holdings Group Tbk', 'SN'],
      ['北京字节跳动科技有限公司', '北京'], ['شركة الاتصالات السعودية', 'شر'], ['บริษัท ไทยเบฟเวอเรจ จำกัด (มหาชน)', 'บร'],
      ['X', 'X'], ['Ab', 'AB'], ['Halcyon Logistics', 'HL'], ['Northwind Clinics', 'NC'], ['Pelita Foods', 'PF'], ['Meridian Bank', 'MB'],
      ['Arcadia Retail Group', 'AR'], ['Solace Hotels', 'SH'], ['Kirana Health', 'KH'], ['Tirta Water', 'TW'], ['Bayu Motors', 'BM'],
      ['Công ty Cổ phần Sữa Việt Nam', 'CV'], ['Samsung Electronics 삼성전자', 'SE'], ['株式会社ファーストリテイリング', '株式'],
    ];
    for (let i = 0; i < 160; i++) coNames.push(['Company ' + String(i + 1).padStart(3, '0') + ' ' + pick(['Trading', 'Holdings', 'Logistics', 'Foods', 'Clinics', 'Bank', 'Retail', 'Energy', 'Studio']), 'C' + ((i % 9) + 1)]);
    const companies = coNames.map(([name, short], i) => ({ id: 'c' + i, name, short, stage: i % 4 === 3 ? 'done' : (i % 7 === 6 ? 'lead' : 'active'), target: null, last: null }));

    const groups = [
      { id: 'g0', name: 'Pengadaanperlengkapankantorcabangbaruuntukwilayahindonesiatimur', short: 'PP', hue: 0, important: true },
      { id: 'g1', name: 'Q4 planning and budget review for every regional office, including the new branches', short: 'Q4', hue: 1, important: true },
      { id: 'g2', name: '年度計画', short: '年', hue: 2, important: true },
      { id: 'g3', name: 'خطة العمل', short: 'خط', hue: 3, important: false },
      { id: 'g4', name: 'Hiring', short: 'H', hue: 4, important: false },
      { id: 'g5', name: 'Empty group with no tasks', short: 'E', hue: 5, important: false },
    ];
    for (let i = 6; i < 48; i++) groups.push({ id: 'g' + i, name: pick(['Office', 'Ops', 'Finance', 'Training', 'Events', 'IT', 'Legal', 'Partners']) + ' ' + (i + 1), short: 'G' + (i % 10), hue: i % 6, important: i % 11 === 0 });

    const verbs = ['Send', 'Call', 'Prepare', 'Review', 'Confirm', 'Update', 'Draft', 'Follow up on', 'Schedule', 'Check'];
    const objects = ['the proposal', 'the contract', 'the trial results', 'the invoice', 'the onboarding pack', 'the price list', 'the meeting notes', 'the renewal terms', 'the demo account', 'the case study'];
    const T = (o) => Object.assign({ co: null, group: null, type: '', touch: '', prio: '', start: null, end: null, last: null, key: '', resp: [], inf: [], done: false, doneAt: null }, o);

    const longKey = 'Context from the last three calls: they are comparing us with two other vendors and the decision sits with the regional CFO, who joins only the final meeting. Procurement needs the security questionnaire, the data processing agreement, references from two clients in the same sector, and a pricing table that separates one-off setup from the monthly fee. Their fiscal year closes in March, so anything signed after mid-February slips to next year. Keep the tone formal in writing; on calls they prefer first names.';
    const tasks = [
      T({ id: 's1', desc: 'Send the revised proposal including volume pricing, the twelve-month lock-in option, the onboarding fee waiver, the security questionnaire answers and the two client references that procurement asked for in last Thursday\'s call', co: 'c1', type: 'Proposal', touch: 'Email', prio: 'high', start: d(-60), end: d(-45), last: d(-61), resp: people.slice(0, 8), inf: people.slice(8, 22).map((n, i) => ({ name: n, note: i % 3 === 0 ? 'Keeps the regional finance team informed about anything that changes the contract value' : (i % 3 === 1 ? 'backup' : '') })), key: longKey }),
      T({ id: 's2', desc: 'Kirimdokumenpenawaranhargatermasukdiskonvolumedanbiayaimplementasikepadatimpengadaan', co: 'c0', type: 'Follow-up', touch: 'Call', prio: 'high', end: d(-44), last: d(-400), resp: [people[0]] }),
      T({ id: 's3', desc: '准备季度业务回顾演示文稿并发送给客户的财务团队', co: 'c2', type: 'Review', touch: 'Meeting', end: d(-43), last: d(-30), resp: [people[1]] }),
      T({ id: 's4', desc: 'إرسال العرض المعدل مع تسعير الكميات', co: 'c3', type: 'Proposal', end: d(-42), last: d(-2), resp: [people[3]] }),
      T({ id: 's5', desc: 'x', end: d(-41) }),
      T({ id: 's6', desc: 'Task with every optional field empty' }),
      T({ id: 's7', desc: 'ส่งใบเสนอราคาที่แก้ไขแล้ว', co: 'c4', type: 'Proposal', touch: 'Email', end: d(-40), last: d(-16), resp: [people[4]], group: null }),
      T({ id: 's8', desc: 'Organise the procurement of furniture for the eastern Indonesia branch office', group: 'g0', prio: 'high', start: d(-50), end: d(-39), resp: [people[0], people[13], people[14]], key: longKey }),
    ];
    for (let i = 0; i < 2400; i++) {
      const isCo = rnd() < 0.6;
      const co = isCo ? pick(companies).id : null;
      const undated = rnd() < 0.05;
      const end = undated ? null : between(-30, 60);
      const done = rnd() < 0.33;
      const nResp = rnd() < 0.08 ? between(3, 6) : 1;
      const resp = []; for (let r = 0; r < nResp; r++) resp.push(pick(people));
      const inf = rnd() < 0.25 ? [{ name: pick(people), note: pick(['', 'backup', 'recipient', 'approves spend']) }] : [];
      tasks.push(T({
        id: 'r' + i, desc: pick(verbs) + ' ' + pick(objects) + (rnd() < 0.15 ? ' and share a summary with everyone who joined the last review meeting' : ''),
        co, group: !isCo && rnd() < 0.7 ? 'g' + between(0, 47) : null,
        type: rnd() < 0.85 ? pick(TYPES) : '', touch: isCo && rnd() < 0.7 ? pick(TOUCH) : '', prio: pick(['', 'high', 'medium', 'low']),
        start: !undated && rnd() < 0.4 ? end - between(1, 10) : null, end,
        last: isCo && rnd() < 0.9 ? -between(0, 40) : null,
        resp: [...new Set(resp)], inf, done, doneAt: done ? -between(0, 120) : null,
      }));
    }
    for (const t of tasks.slice(8)) { t.start = d(t.start); t.end = d(t.end); t.last = d(t.last); t.doneAt = d(t.doneAt); }
    tasks.forEach((t) => { if (t.group === 'g5') t.group = 'g6'; });

    const events = [{ date: d(0), title: 'All-hands quarterly business review with every regional office, the partner network and the leadership team, including the Q&A session', allDay: true, url: '#calendar' }];
    for (let i = 0; i < 24; i++) events.push({ date: d(0), title: pick(['Supplier call', 'Interview', 'Client visit', 'Pipeline sync', '季度会议', 'اجتماع العملاء', 'Kunjungan ke kantor cabang Surabaya']), start: String(7 + Math.floor(i / 2)).padStart(2, '0') + ':' + (i % 2 ? '30' : '00'), end: String(8 + Math.floor(i / 2)).padStart(2, '0') + ':' + (i % 2 ? '30' : '00'), url: '#calendar' });
    for (let i = 1; i < 14; i++) for (let j = 0; j < between(2, 12); j++) events.push({ date: d(i), title: 'Event', start: '10:00', end: '11:00', url: '#calendar' });

    return { people, companies, groups, tasks, events, types: TYPES.slice(), touch: TOUCH.slice() };
  }

  window.PROTO_DATA = { TODAY, d, normal, stress };
})();
