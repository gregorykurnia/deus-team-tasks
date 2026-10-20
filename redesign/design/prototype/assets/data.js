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

  /* ---------- Company fields and options (B1 to B4, C1 to C3) ----------
     Each company sits in one of four groups: lead (to approach), active, done (deal done), hold (no or not now).
     Built-in fields belong to the groups the job stories name; own fields are added per group (C1).
     coShown lists, per group, the fields the list shows (C2). Choice values are option ids. */
  const ALL = ['lead', 'active', 'done', 'hold'];
  function coSchema() {
    const fields = [
      { id: 'contact', label: 'Contact person', kind: 'text', groups: ['active', 'done', 'hold'] },
      { id: 'type', label: 'Type', kind: 'choice', groups: ALL.slice() },
      { id: 'status', label: 'Status', kind: 'choice', groups: ['active'] },
      { id: 'answer', label: 'Answer', kind: 'choice', groups: ['hold'] },
      { id: 'prio', label: 'Priority', kind: 'choice', groups: ['lead', 'active'] },
      { id: 'products', label: 'Products', kind: 'text', groups: ['active', 'done', 'hold'] },
      { id: 'reason', label: 'Reason', kind: 'long', groups: ['hold'] },
      { id: 'outreach', label: 'Planned outreach', kind: 'date', groups: ['lead'] },
      { id: 'last', label: 'Last action', kind: 'date', groups: ['active', 'done', 'hold'] },
      { id: 'target', label: 'Target date', kind: 'date', groups: ['active', 'done'] },
      { id: 'next', label: 'Next actions', kind: 'long', groups: ['active', 'done'] },
      { id: 'trial', label: 'Trial', kind: 'text', groups: ['active'] },
      { id: 'industry', label: 'Industry', kind: 'text', groups: ['lead', 'active', 'done'] },
      { id: 'source', label: 'How we found it', kind: 'text', groups: ['lead', 'active', 'done'] },
      { id: 'notes', label: 'Notes', kind: 'long', groups: ['lead'] },
    ];
    const O = (id, label, color, lock) => ({ id, label, color, lock: lock || null });
    const options = {
      status: [O('meet', 'First meeting', 'sky'), O('needs', 'Needs analysis', 'teal'), O('prop', 'Proposal sent', 'violet'), O('trial', 'Trial running', 'pink'), O('nego', 'Negotiation', 'blue'),
        O('fu', 'Follow-up due', 'amber', 'Shows who is waiting on us'), O('won', 'Deal done', 'green', 'Moves the company to Deal done')],
      type: [O('client', 'Client', 'blue'), O('partner', 'Partner', 'violet'), O('indiv', 'Individual partner', 'pink')],
      answer: [O('later', 'Not now', 'amber'), O('no', 'No', 'slate')],
      prio: [O('high', 'High', 'red'), O('medium', 'Medium', 'amber'), O('low', 'Low', 'slate')],
    };
    const shown = {
      lead: ['outreach', 'prio', 'type', 'industry', 'source', 'notes'],
      active: ['status', 'prio', 'last', 'target', 'products', 'next'],
      done: ['last', 'target', 'products', 'next', 'type'],
      hold: ['answer', 'reason', 'products', 'type', 'last'],
    };
    return { fields, options, shown };
  }
  // Products are free text (D-012). Mock data is written with short ids, then spelled out here.
  const PRODUCT = { fleet: 'Fleet tracking', pay: 'Payroll', pos: 'Point of sale', loyal: 'Loyalty add-on', ana: 'Analytics' };
  const productText = (ids) => ids.map((x) => PRODUCT[x] || x).join(', ');

  /* ---------- Normal data ---------- */
  function normal() {
    const people = ['Rina Hartono', 'Kevin Tan', 'Dimas Prasetyo', 'Aditya Wijaya', 'Sarah Lim', 'Maya Chen', 'Joko Susanto'];
    // Companies. "done" means the deal is done, so its tasks count as client work.
    const C = (o) => Object.assign({ contact: '', type: '', status: '', answer: '', prio: '', products: [], reason: '', outreach: null, last: null, target: null, next: '', trial: '', industry: '', source: '', notes: '', region: '', size: null, revisit: null }, o);
    const companies = [
      // Active prospects
      C({ id: 'hal', name: 'Halcyon Logistics', short: 'HL', stage: 'active', contact: 'Budi Santoso', type: 'client', status: 'prop', prio: 'high', products: ['fleet', 'ana'], last: d(-6), target: d(-1), next: 'Send the revised proposal with volume pricing, then book the pricing call.', industry: 'Logistics', source: 'Trade fair', region: 'jkt', size: 850 }),
      C({ id: 'nor', name: 'Northwind Clinics', short: 'NC', stage: 'active', contact: 'dr. Anita Kusuma', type: 'client', status: 'fu', prio: 'high', products: ['pay'], last: d(-15), target: d(0), next: 'Book a demo with their finance lead.', industry: 'Healthcare', source: 'Referral from Kirana Health', region: 'sby', size: 420 }),
      C({ id: 'pel', name: 'Pelita Foods', short: 'PF', stage: 'active', contact: 'Yusuf Rahman', type: 'client', status: 'trial', prio: 'medium', products: ['pos', 'loyal'], last: d(-3), target: d(2), next: 'Review the trial usage, then prepare the contract draft.', trial: 'Two outlets, until 6 Nov', industry: 'Food and beverage', source: 'Website enquiry', region: 'bdg', size: 300 }),
      C({ id: 'arc', name: 'Arcadia Retail Group', short: 'AR', stage: 'active', contact: 'Lina Wijaya', type: 'client', status: 'needs', prio: 'medium', products: ['pos', 'ana'], last: d(-9), target: d(10), next: 'Share the retail rollout case study.', industry: 'Retail', source: 'LinkedIn', region: 'jkt' }),
      C({ id: 'kir', name: 'Kirana Health', short: 'KH', stage: 'active', contact: 'Hendra Gunawan', type: 'client', status: 'trial', prio: 'medium', products: ['pay'], last: d(-4), target: d(7), next: 'Collect pilot feedback from the clinic manager.', trial: 'Pilot at one clinic, until 30 Oct', industry: 'Healthcare', source: 'Conference talk', region: 'sby', size: 180 }),
      C({ id: 'bay', name: 'Bayu Motors', short: 'BM', stage: 'active', contact: 'Agus Salim', type: 'client', status: 'fu', prio: 'low', products: ['fleet'], last: d(-18), trial: 'Extension requested', industry: 'Automotive', source: 'Cold outreach' }),
      C({ id: 'ksp', name: 'Kapuas Shipping', short: 'KS', stage: 'active', contact: 'Michael Tanoto', type: 'partner', status: 'meet', prio: 'high', products: ['fleet'], last: d(-2), target: d(3), next: 'Agree the referral terms.', industry: 'Logistics', source: 'Partner introduction', region: 'jkt' }),
      C({ id: 'gar', name: 'Garuda Fitness', short: 'GF', stage: 'active', contact: 'Rizky Pratama', type: 'client', status: 'nego', prio: 'high', products: ['pay', 'loyal'], last: d(-1), target: d(5), next: 'Send the final price for 12 gyms.', industry: 'Fitness', source: 'Website enquiry', region: 'bdg', size: 260 }),
      C({ id: 'sem', name: 'Semesta Property', short: 'SP', stage: 'active', contact: 'Clara Hadiwijaya', type: 'client', status: 'prop', prio: 'medium', products: ['ana'], last: d(-16), target: d(-3), next: 'Chase the proposal decision.', industry: 'Property', source: 'Referral', region: 'jkt', size: 510 }),
      C({ id: 'wib', name: 'Wibowo Consulting', short: 'WC', stage: 'active', contact: 'Darto Wibowo', type: 'indiv', status: 'needs', prio: 'low', products: ['loyal'], last: d(-21), target: d(14), industry: 'Consulting', source: 'Former colleague' }),
      C({ id: 'cak', name: 'Cakra Telecom', short: 'CT', stage: 'active', contact: 'Siti Nurhaliza', type: 'client', status: 'fu', prio: 'high', products: ['ana', 'pay'], last: d(-8), target: d(1), next: 'Answer their security questions.', industry: 'Telecoms', source: 'Trade fair', region: 'jkt', size: 1200 }),
      C({ id: 'lot', name: 'Lotus Pharmacy Chain', short: 'LP', stage: 'active', contact: 'Ivan Hartanto', type: 'client', status: 'meet', prio: 'medium', products: ['pos'], last: d(-5), target: d(12), industry: 'Healthcare', source: 'Cold outreach', region: 'mdn' }),
      C({ id: 'ner', name: 'Nera Coffee', short: 'NE', stage: 'active', contact: 'Dewi Lestari', type: 'client', status: 'prop', prio: 'low', products: ['pos', 'loyal'], last: d(-11), target: d(6), next: 'Walk them through the loyalty add-on.', industry: 'Food and beverage', source: 'Instagram', region: 'bdg' }),
      C({ id: 'bin', name: 'Bintang Freight', short: 'BF', stage: 'active', contact: 'Andre Siregar', type: 'client', status: 'needs', products: ['fleet'], last: d(-30), industry: 'Logistics', source: 'Trade fair', region: 'mdn' }),
      // Deal done
      C({ id: 'mer', name: 'Meridian Bank', short: 'MB', stage: 'done', contact: 'Robert Lim', type: 'client', status: 'won', products: ['ana', 'pay'], last: d(-2), target: d(3), next: 'Quarterly review: bring the support ticket summary.', industry: 'Banking', source: 'Referral', region: 'jkt' }),
      C({ id: 'sol', name: 'Solace Hotels', short: 'SH', stage: 'done', contact: 'Maria Gunadi', type: 'client', status: 'won', products: ['pos', 'loyal'], last: d(-21), target: d(15), next: 'Send the renewal reminder.', industry: 'Hospitality', source: 'Trade fair', region: 'sby' }),
      C({ id: 'tir', name: 'Tirta Water', short: 'TW', stage: 'done', contact: 'Bayu Aji', type: 'client', status: 'won', products: ['fleet'], last: d(-1), target: d(8), next: 'Check in after the go-live.', industry: 'Utilities', source: 'Cold outreach', region: 'bdg' }),
      C({ id: 'aur', name: 'Aurora Schools', short: 'AS', stage: 'done', contact: 'Fajar Nugroho', type: 'client', status: 'won', products: ['pay'], last: d(-40), industry: 'Education', source: 'Webinar' }),
      C({ id: 'ped', name: 'Pedati Courier', short: 'PC', stage: 'done', contact: 'Yohana Sitompul', type: 'partner', status: 'won', products: ['fleet'], last: d(-12), industry: 'Logistics', source: 'Partner introduction', region: 'mdn' }),
      C({ id: 'sin', name: 'Sinar Optik', short: 'SO', stage: 'done', contact: 'Wulan', type: 'client', status: 'won', products: ['pos'], last: d(-60), industry: 'Retail', source: 'Walk-in' }),
      // To approach
      C({ id: 'lum', name: 'Lumen Education', short: 'LE', stage: 'lead', type: 'client', prio: 'medium', outreach: d(1), industry: 'Education', source: 'Webinar sign-up', notes: 'Runs 14 tutoring centres. Asked about payroll in the webinar chat.', region: 'jkt' }),
      C({ id: 'bal', name: 'Bali Surf Resorts', short: 'BS', stage: 'lead', type: 'client', prio: 'high', outreach: d(-2), industry: 'Hospitality', source: 'Trade fair', notes: 'Three resorts, a fourth opening in March. The general manager took our card.' }),
      C({ id: 'ind', name: 'Indo Cold Chain', short: 'IC', stage: 'lead', type: 'client', prio: 'high', outreach: d(3), industry: 'Logistics', source: 'LinkedIn', notes: '60 refrigerated trucks. Their ops director posted about route delays.', region: 'sby' }),
      C({ id: 'mar', name: 'Marga Construction', short: 'MC', stage: 'lead', type: 'client', prio: 'medium', outreach: d(8), industry: 'Construction', source: 'Referral from Meridian Bank' }),
      C({ id: 'kop', name: 'Koperasi Sejahtera', short: 'KS', stage: 'lead', type: 'client', prio: 'low', industry: 'Finance', source: 'Cold list' }),
      C({ id: 'tok', name: 'Toko Kita', short: 'TK', stage: 'lead', type: 'client', prio: 'low', outreach: d(14), industry: 'Retail', source: 'Instagram' }),
      C({ id: 'ary', name: 'Arya Kusuma', short: 'AK', stage: 'lead', type: 'indiv', prio: 'medium', outreach: d(5), industry: 'Consulting', source: 'Former colleague', notes: 'Independent consultant. Could resell to mid-size clinics.' }),
      C({ id: 'sam', name: 'Samudra Fisheries', short: 'SF', stage: 'lead', type: 'client', industry: 'Food and beverage', source: 'Trade fair' }),
      // No or not now
      C({ id: 'pra', name: 'Prima Steel', short: 'PS', stage: 'hold', contact: 'Thomas Halim', type: 'client', answer: 'no', products: ['fleet'], reason: 'Chose a competitor with an on-premise option. Their IT policy rules out cloud hosting until 2028.', last: d(-45) }),
      C({ id: 'jas', name: 'Jasa Medika', short: 'JM', stage: 'hold', contact: 'Ratna Sari', type: 'client', answer: 'later', products: ['pay'], reason: 'Budget frozen until the new fiscal year in April.', last: d(-20), revisit: d(160) }),
      C({ id: 'ker', name: 'Kereta Kencana Travel', short: 'KK', stage: 'hold', contact: 'Benny Gozali', type: 'client', answer: 'later', products: ['pos'], reason: 'Merging with a sister company. Revisit once the merger closes.', last: d(-33), revisit: d(75) }),
      C({ id: 'ema', name: 'Emas Jewellers', short: 'EJ', stage: 'hold', contact: 'Lisa Tjandra', type: 'client', answer: 'no', products: ['pos'], reason: 'Too small for our minimum contract.', last: d(-70) }),
      C({ id: 'del', name: 'Delta Printing', short: 'DP', stage: 'hold', contact: 'Rudi Hartono', type: 'partner', answer: 'later', products: ['ana'], reason: 'Their partner programme lead left. Waiting for a replacement.', last: d(-9), revisit: d(30) }),
      C({ id: 'hut', name: 'Hutama Energy', short: 'HE', stage: 'hold', type: 'client', answer: 'no', products: ['fleet', 'ana'], last: d(-100) }),
    ];
    // Fields the team added (C1): a choice on three groups, a number on Active, a date on No or not now.
    companies.forEach((c) => { c.products = productText(c.products); });
    companies.find((c) => c.id === 'ner').products = 'point of sale , Loyalty add-on'; // typed differently: the filter still groups it
    const schema = coSchema();
    schema.fields.push(
      { id: 'region', label: 'Region', kind: 'choice', groups: ['lead', 'active', 'done'], own: true },
      { id: 'size', label: 'Deal size (IDR m)', kind: 'number', groups: ['active'], own: true },
      { id: 'revisit', label: 'Revisit after', kind: 'date', groups: ['hold'], own: true },
    );
    schema.options.region = [{ id: 'jkt', label: 'Jakarta', color: 'blue' }, { id: 'sby', label: 'Surabaya', color: 'teal' }, { id: 'bdg', label: 'Bandung', color: 'violet' }, { id: 'mdn', label: 'Medan', color: 'pink' }];
    schema.shown.hold.push('revisit');
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
    // Qualification notes (U1 to U6): at most one set per tracked company, and some for prospects not tracked yet.
    const N = (o) => Object.assign({ co: null, name: '', likely: '', remarks: '', edited: d(0), h: {} }, o);
    const notes = [
      N({ id: 'n1', co: 'hal', likely: 'high', edited: d(-1), h: {
        need: 'Cut empty-truck kilometres and give customers live delivery times.', situation: 'Spreadsheets per depot, updated by phone twice a day. 380 trucks across Java.',
        pain: 'Roughly 12% of trips run part-empty. Two big customers complained about missed delivery windows this quarter.', fit: 'Fleet tracking covers routing and live times. Analytics for the depot managers.',
        urgency: 'Want it live before the year-end peak, so a decision by mid-November.', stake: 'Budi (ops director) champions it. The CFO signs above IDR 500m. IT reviews security.',
        ready: 'Budget set aside in Q4. Procurement needs three quotes.', next: 'Send the revised proposal with volume pricing (Rina, this week).', block: 'Their IT policy asks for data stored in Indonesia.' },
        remarks: 'Met Budi at the Jakarta logistics fair in August. He used a competitor at his last company and didn’t like their support, so local support matters a lot to him.\n\nThey are also talking to one other vendor. Keep the tone practical: he doesn’t like slides.' }),
      N({ id: 'n2', co: 'nor', likely: 'med', edited: d(-15), h: {
        need: 'Pay 600 staff across 9 clinics without the monthly overtime mistakes.', situation: 'An old desktop payroll tool, run by one person in finance.',
        pain: 'Overtime errors cost about 40 hours of fixes a month, and staff complain.', fit: 'Payroll fits well. Shift import from their rota tool needs checking.',
        stake: 'dr. Anita decides, but the finance lead has to agree. Haven’t met the finance lead yet.', next: 'Book a demo with the finance lead (Kevin).', block: 'Budget not confirmed. Their finance lead is new and cautious.' } }),
      N({ id: 'n3', co: 'pel', likely: 'vhigh', edited: d(-3), h: {
        need: 'One point of sale for 22 outlets, with a loyalty scheme.', situation: 'Two outlets on our trial. The rest on paper receipts and a basic cash register.',
        pain: 'No idea which outlets or dishes make money until the month closes.', fit: 'Point of sale plus the loyalty add-on. Trial usage is strong.',
        urgency: 'Trial ends 6 November. They want to roll out before Ramadan.', stake: 'Yusuf (owner) decides alone.', ready: 'Has budget. Asked for the contract draft.',
        next: 'Review trial usage, then send the contract draft (Sarah and Rina).', block: 'None seen so far.' } }),
      N({ id: 'n4', co: 'arc', likely: 'med', edited: d(-9), h: {
        need: 'See stock and sales across 40 stores in one place.', pain: 'Stock-outs on best sellers every weekend.', fit: 'Point of sale and analytics. Their ERP integration is the open question.',
        stake: 'Lina (head of retail ops) and the IT manager. The board approves anything over a year.', next: 'Share the retail rollout case study (Dimas).', block: 'IT policy: they want on-premise hosting for sales data. Budget only after the board meeting.' } }),
      N({ id: 'n5', co: 'kir', likely: 'high', edited: d(-4), h: {
        need: 'Payroll for doctors paid per session.', situation: 'Pilot at one clinic since September.', fit: 'Works for session pay. Needs a custom report for the medical director.',
        urgency: 'Pilot ends 30 October.', next: 'Collect pilot feedback from the clinic manager (Aditya).', block: 'Budget for the other 6 clinics comes from head office.' } }),
      N({ id: 'n6', co: 'cak', likely: 'mlow', edited: d(-8), h: {
        need: 'Analytics for 1,200 field technicians.', stake: 'A procurement committee of five. We only know two of them.', ready: 'Formal tender expected in January.',
        next: 'Answer their security questions (Siti asked for them by Friday).', block: 'Budget split across two departments. A long tender process. Strong incumbent vendor.' } }),
      N({ id: 'n7', co: 'sem', likely: 'low', edited: d(-16), h: { need: 'Dashboards for property sales.', block: 'Gone quiet after the proposal. Budget unclear.' } }),
      N({ id: 'n8', co: 'gar', likely: 'vhigh', edited: d(0), h: {
        need: 'Payroll and member loyalty for 12 gyms.', fit: 'Both products fit.', urgency: 'New year sign-up season.', stake: 'Rizky (founder) and his COO.', ready: 'Negotiating the final price.', next: 'Send the final price for 12 gyms (Rina, by Friday).' } }),
      N({ id: 'n9', name: 'Borneo Agro (met at the trade fair)', likely: 'med', edited: d(-2), h: {
        need: 'Track 90 plantation trucks.', situation: 'No system at all. Drivers report by WhatsApp.', next: 'Get the right contact from their head office (Kevin).', block: 'Remote sites with patchy signal.' },
        remarks: 'Only had ten minutes at the booth. The person we met was their regional manager, not the buyer.' }),
      N({ id: 'n10', name: 'dr. Sari’s clinic group', likely: '', edited: d(-6), h: { need: 'Payroll, maybe scheduling.' } }),
    ];
    // Past clients (R1 to R6): parent companies with subsidiaries under them. Umbrella parents are kept but not counted (R3).
    // Two spellings of a sector on purpose ("retail ", "education"): the breakdown still treats them as one (R6).
    const PC = (id, name, sector, counted, subs) => [{ id, name, sector, parent: null, counted: counted !== false }]
      .concat((subs || []).map(([sn, ss], i) => ({ id: id + '-' + (i + 1), name: sn, sector: ss, parent: id, counted: true })));
    const past = [].concat(
      PC('p1', 'Meridian Bank', 'Banking', true, [['Meridian Syariah', 'Banking'], ['Meridian Finance', 'Financial services'], ['Meridian Insurance', 'Insurance']]),
      PC('p2', 'Solace Hotels Group', 'Hospitality', false, [['Solace Bali', 'Hospitality'], ['Solace Jakarta', 'Hospitality'], ['Solace Lombok', 'Hospitality'], ['Solace Yogyakarta', 'Hospitality'], ['Solace Spa', 'Wellness']]),
      PC('p3', 'Nusantara Retail Holdings', 'Retail', false, [['Toko Nusa', 'Retail'], ['Nusa Mart', 'retail '], ['NusaFresh', 'Food and beverage'], ['Nusa Online', 'Retail'], ['Nusa Pharmacy', 'Healthcare']]),
      PC('p4', 'Tirta Water', 'Utilities'),
      PC('p5', 'Aurora Schools', 'Education', true, [['Aurora Kids', 'Education'], ['Aurora Academy', 'education']]),
      PC('p6', 'Pedati Courier', 'Logistics'),
      PC('p7', 'Sinar Optik', 'Retail'),
      PC('p8', 'Kencana Healthcare Group', 'Healthcare', true, [['Kencana Clinic Bandung', 'Healthcare'], ['Kencana Clinic Surabaya', 'Healthcare'], ['Kencana Lab', 'Healthcare'], ['Kencana Pharma', 'Pharmaceuticals']]),
      PC('p9', 'Bumi Logistik', 'Logistics', true, [['Bumi Cold Storage', 'Logistics'], ['Bumi Express', 'Logistics']]),
      PC('p10', 'Warung Rasa', 'Food and beverage'),
      PC('p11', 'Pratama Motor Group', 'Automotive', false, [['Pratama Dealer Jakarta', 'Automotive'], ['Pratama Parts', 'Automotive'], ['Pratama Rental', 'Automotive']]),
      PC('p12', 'Citra Media', 'Media'),
      PC('p13', 'Delima Property', 'Property', true, [['Delima Residence', 'Property']]),
      PC('p14', 'Garuda Air Services', ''),
      PC('p15', 'Mitra Konstruksi', 'Construction'),
      PC('p16', 'Lestari Farms', 'Agriculture', true, [['Lestari Dairy', 'Food and beverage']]),
      PC('p17', 'Puspa Florist', 'Retail'),
      PC('p18', 'Harmoni Telecom', 'Telecoms', true, [['Harmoni Fibre', 'Telecoms'], ['Harmoni Data Centre', '']]),
      PC('p19', 'Indah Textiles', 'Manufacturing'),
      PC('p20', 'Kopi Senja', 'Food and beverage', true, [['Kopi Senja Roastery', 'Food and beverage']]),
      PC('p21', 'Bintaro Dental', 'Healthcare'),
    );
    // Flows (M1 to M4): ordered steps, each with roles (a label and the names in it), and at most one decision
    // at the end, whose outcomes are good or bad and may send the work back to an earlier step.
    let fid = 0;
    const R = (label, ...names) => ({ id: 'r' + (++fid), label, names });
    const ST = (id, title, desc, roles) => ({ id, title, desc, roles: roles || [] });
    const OUT = (good, title, desc, roles, back) => ({ id: 'o' + (++fid), good, title, desc, roles: roles || [], back: back || null });
    const flows = [
      { id: 'f1', name: 'New client onboarding', desc: 'From a signed deal to a client who uses the product every day. Starts the day the contract is signed.', edited: d(-2), steps: [
        ST('f1s1', 'Hand the deal over', 'The salesperson walks the account team through what was promised: products, prices, dates and any special terms.', [R('Responsible', 'Rina Hartono'), R('Informed', 'Aditya Wijaya', 'Sarah Lim')]),
        ST('f1s2', 'Set up the accounts', 'Create the client’s workspace, users and data import. Use the onboarding checklist.', [R('Responsible', 'Sarah Lim'), R('Consulted', 'Dimas Prasetyo')]),
        ST('f1s3', 'Kick-off meeting', 'Agree the go-live date, who the client’s champion is, and how we’ll keep in touch.', [R('Responsible', 'Aditya Wijaya'), R('Informed', 'Kevin Tan')]),
        ST('f1s4', 'Train the client’s team', 'Two sessions: one for admins, one for everyday users. Record both.', [R('Responsible', 'Sarah Lim'), R('Backup', 'Maya Chen')]),
        ST('f1s5', 'Go-live check', 'Two weeks after go-live, review usage and open questions with the champion.', [R('Responsible', 'Aditya Wijaya'), R('Consulted', 'Sarah Lim')]),
      ], decision: { q: 'Is the client live and happy?', desc: 'Judge from usage and the go-live check.', outcomes: [
        OUT(true, 'Hand over to account management', 'Set the first quarterly review and mark the onboarding done.', [R('Responsible', 'Aditya Wijaya')]),
        OUT(false, 'Fix the open issues', 'List what’s blocking them, fix it, then retrain where needed.', [R('Responsible', 'Sarah Lim'), R('Informed', 'Rina Hartono')], 'f1s2'),
      ] } },
      { id: 'f2', name: 'Proposal approval', desc: 'How a proposal goes out, and what happens when the client answers.', edited: d(-6), steps: [
        ST('f2s1', 'Draft the proposal', 'Start from the latest template. Include the products, the price and the timeline.', [R('Responsible', 'Kevin Tan', 'Aditya Wijaya')]),
        ST('f2s2', 'Check the pricing', 'Any discount above 10% needs approval.', [R('Approves discounts', 'Rina Hartono'), R('Consulted', 'Dimas Prasetyo')]),
        ST('f2s3', 'Send it to the client', 'Send as a PDF, and book a call to walk them through it.', [R('Responsible', 'Kevin Tan'), R('Informed', 'Rina Hartono')]),
      ], decision: { q: 'Does the client accept?', desc: '', outcomes: [
        OUT(true, 'Prepare the contract', 'Use the accepted proposal as the contract’s schedule.', [R('Responsible', 'Rina Hartono')]),
        OUT(false, 'Revise the proposal', 'Note what they asked to change, then draft again.', [R('Responsible', 'Kevin Tan')], 'f2s1'),
        OUT(false, 'Move the company to No or not now', 'Write down the reason so the team can learn from it.', [R('Responsible', 'Kevin Tan')]),
      ] } },
      { id: 'f3', name: 'Expense claims', desc: 'Getting money back for anything paid on the company’s behalf.', edited: d(-20), steps: [
        ST('f3s1', 'Submit the claim', 'Photo of the receipt, the amount, and what it was for. By the 25th of the month.', [R('Responsible', 'Whoever paid')]),
        ST('f3s2', 'Approve', 'Check it against the budget.', [R('Responsible', 'Maya Chen')]),
        ST('f3s3', 'Pay it back', 'Paid with the next salary run.', [R('Responsible', 'Dimas Prasetyo'), R('Informed', 'Whoever paid')]),
      ], decision: null },
      { id: 'f4', name: 'Hiring a new team member', desc: 'From an open role to someone’s first day.', edited: d(-9), steps: [
        ST('f4s1', 'Write the role', 'What they’ll do, who they report to, the salary range.', [R('Responsible', 'Maya Chen'), R('Approves', 'Rina Hartono')]),
        ST('f4s2', 'Post the job ad', '', [R('Responsible', 'Maya Chen')]),
        ST('f4s3', 'Shortlist', 'Pick up to five candidates for interviews.', [R('Responsible', 'Maya Chen', 'Rina Hartono')]),
        ST('f4s4', 'Interviews', 'Two rounds. The second one includes a short case.', [R('Responsible', 'Rina Hartono'), R('Consulted', 'Kevin Tan', 'Sarah Lim')]),
        ST('f4s5', 'Make an offer', '', [R('Responsible', 'Rina Hartono'), R('Informed', 'Dimas Prasetyo')]),
      ], decision: { q: 'Is the offer accepted?', desc: '', outcomes: [
        OUT(true, 'Prepare the first day', 'Laptop, accounts, desk, and a buddy for the first month.', [R('Responsible', 'Dimas Prasetyo'), R('Buddy', 'Sarah Lim')]),
        OUT(false, 'Go back to the shortlist', '', [R('Responsible', 'Maya Chen')], 'f4s3'),
      ] } },
      { id: 'f5', name: 'Trade fair follow-up', desc: '', edited: d(-1), steps: [
        ST('f5s1', 'Add every lead to To approach', 'Same day, while it’s fresh. Note where we met them.', [R('Responsible', 'Everyone at the booth')]),
        ST('f5s2', 'First email within three days', '', []),
        ST('f5s3', 'Book calls with the warm ones', '', [R('Responsible', 'Kevin Tan')]),
      ], decision: null },
      { id: 'f6', name: 'Office move', desc: 'Moving to the new floor in January.', edited: d(0), steps: [], decision: null },
    ];
    return { people, companies, groups, tasks, events, notes, past, flows, types: TYPES.slice(), touch: TOUCH.slice(), coFields: schema.fields, coOptions: schema.options, coShown: schema.shown };
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

    // Company details. A separate random sequence, so the task data above stays exactly as it was.
    let seed2 = 99;
    const r2 = () => { seed2 |= 0; seed2 = seed2 + 0x6D2B79F5 | 0; let t = Math.imul(seed2 ^ seed2 >>> 15, 1 | seed2); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const p2 = (a) => a[Math.floor(r2() * a.length)];
    const b2 = (a, b) => a + Math.floor(r2() * (b - a + 1));
    const schema = coSchema();
    const O = (id, label, color, lock) => ({ id, label, color, lock: lock || null });
    schema.options.status.splice(5, 0, O('s6', 'Waiting for the regional procurement committee’s second-round approval', 'slate'), O('s7', '技术评估', 'teal'), O('s8', 'بانتظار الموافقة', 'violet'),
      ...['Security review', 'Legal review', 'Reference call', 'Pilot planning', 'Budget check', 'Board sign-off', 'Contract sent', 'Onboarding call', 'Price agreed', 'Paused by them', 'Champion left', 'Re-engaged', 'Second demo'].map((l, i) => O('x' + i, l, ['blue', 'teal', 'violet', 'pink', 'sky', 'slate'][i % 6])));
    const prodNames = Object.values(PRODUCT).concat(['Enterprisewideintegratedworkforceschedulingandtimeattendancesuite', '人事管理', 'إدارة الأسطول'], Array.from({ length: 23 }, (_, i) => 'Product ' + String.fromCharCode(65 + i) + (i > 12 ? ' Pro' : '')));
    const own = [
      ['o1', 'Estimated annual contract value in Indonesian rupiah (millions)', 'number'], ['o2', 'Decision maker', 'text'], ['o3', 'Procurement portal reference', 'text'],
      ['o4', 'Contract end date with their current vendor', 'date'], ['o5', 'Competitors in the deal', 'long'], ['o6', 'Region', 'choice'], ['o7', 'Branches', 'number'], ['o8', '担当者メモ', 'long'], ['o9', 'Signed NDA', 'choice'],
    ];
    own.forEach(([id, label, kind]) => schema.fields.push({ id, label, kind, groups: ['active'], own: true }));
    schema.options.o6 = ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Makassar', 'Denpasar', 'Balikpapan', 'Pontianak'].map((l, i) => O('rg' + i, l, ['blue', 'teal', 'violet', 'pink', 'sky', 'slate', 'green', 'amber'][i]));
    schema.options.o9 = [O('y', 'Yes', 'green'), O('n', 'No', 'slate')];
    schema.shown.active = schema.shown.active.concat(['trial', 'type', 'contact', 'industry', 'source'], own.map((o) => o[0]));
    schema.shown.lead.push('contact');
    const contacts = people.concat(['Ir. H. Muhammad Fadhlurrahman Syarifuddin, S.T., M.M.', 'Jo', '王秀英', 'Анна Смирнова']);
    const longText = 'They are comparing us with two other vendors and the decision sits with the regional CFO, who joins only the final meeting. Procurement needs the security questionnaire, the data processing agreement, references from two clients in the same sector, and a pricing table that separates one-off setup from the monthly fee. Their fiscal year closes in March, so anything signed after mid-February slips to next year.';
    const industries = ['Logistics', 'Healthcare', 'Retail', 'Food and beverage', 'Banking', 'Hospitality', 'Education', 'Manufacturing of industrial machinery and spare parts for the mining sector', '製造業', 'Energy'];
    const sources = ['Trade fair', 'Referral', 'LinkedIn', 'Website enquiry', 'Cold outreach', 'Partner introduction', 'A conversation at the Surabaya logistics forum dinner, table 12'];
    const statusIds = schema.options.status.map((o) => o.id).filter((x) => x !== 'won');
    
    const fill = (c, i) => {
      if (c.stage === 'active' && i % 5 === 4) c.stage = 'hold';
      const sparse = r2() < 0.3; // empty optional fields
      Object.assign(c, {
        contact: sparse ? '' : p2(contacts), type: sparse && r2() < 0.5 ? '' : p2(['client', 'client', 'partner', 'indiv']),
        status: c.stage === 'done' ? 'won' : (c.stage === 'active' && !sparse ? p2(statusIds) : ''),
        answer: c.stage === 'hold' ? p2(['later', 'no']) : '', prio: sparse ? '' : p2(['high', 'medium', 'low']),
        products: sparse ? '' : Array.from(new Set(Array.from({ length: r2() < 0.1 ? b2(5, 12) : b2(1, 2) }, () => p2(prodNames)))).join(', '),
        reason: c.stage === 'hold' && !sparse ? (r2() < 0.2 ? longText : 'Budget frozen until next year.') : '',
        outreach: c.stage === 'lead' && !sparse ? d(b2(-20, 40)) : null,
        last: c.stage === 'lead' || (sparse && r2() < 0.5) ? null : d(-b2(0, 400)),
        target: (c.stage === 'active' || c.stage === 'done') && !sparse ? d(b2(-30, 90)) : null,
        next: sparse ? '' : (r2() < 0.15 ? longText : 'Send the updated proposal.'), trial: !sparse && r2() < 0.2 ? 'Three sites, until the end of the month' : '',
        industry: sparse ? '' : p2(industries), source: sparse ? '' : p2(sources), notes: c.stage === 'lead' && !sparse ? longText : '',
        o1: sparse ? null : b2(10, 99999), o2: sparse ? '' : p2(contacts), o3: sparse ? '' : 'PRC-' + b2(100000, 999999) + '-JKT-2026-PROCUREMENT', o4: sparse ? null : d(b2(-30, 700)),
        o5: sparse ? '' : longText, o6: sparse ? '' : 'rg' + b2(0, 7), o7: sparse ? null : b2(1, 4200), o8: sparse ? '' : '来月の会議で予算を確認する予定です。', o9: sparse ? '' : p2(['y', 'n']),
      });
    };
    companies.forEach(fill);
    for (let i = companies.length; i < 3200; i++) {
      const c = { id: 'c' + i, name: p2(['PT ', 'CV ', '', '']) + p2(['Sinar', 'Maju', 'Jaya', 'Abadi', 'Mega', 'Surya', 'Bumi', 'Cahaya', 'Karya', 'Prima']) + ' ' + p2(['Logistik', 'Sentosa', 'Makmur', 'Teknik', 'Pangan', 'Medika', 'Niaga', 'Energi']) + ' ' + (i + 1), short: 'C' + (i % 9), stage: p2(['lead', 'lead', 'active', 'active', 'active', 'done', 'hold']), target: null, last: null };
      fill(c, i); if (c.stage === 'hold' && !c.answer) c.answer = 'later';
      companies.push(c);
    }

    // Notes: 1,500 sets, long text, other scripts, empty headings, one very long set of remarks.
    const HK = ['need', 'situation', 'pain', 'fit', 'urgency', 'stake', 'ready', 'next', 'block'];
    const lines = [longText, 'Budget frozen until April.', '预算要等到明年四月才能确定。', 'الميزانية مجمدة حتى أبريل.', 'IT policy requires data stored in Indonesia.', 'x', 'Waiting for procurement.', 'Champion left the company.'];
    const notes = [];
    const tracked = companies.filter((c) => c.stage !== 'done');
    for (let i = 0; i < 1500; i++) {
      const h = {}; HK.forEach((k) => { if (r2() < 0.7) h[k] = p2(lines); });
      notes.push({ id: 'sn' + i, co: i < 1300 ? tracked[i % tracked.length].id : null, name: i < 1300 ? '' : p2(['Prospect from the Surabaya logistics forum dinner, table 12, the one with the refrigerated fleet', 'Ab', '未登録の見込み客', 'عميل محتمل']) + ' ' + i,
        likely: p2(['vhigh', 'high', 'med', 'mlow', 'low', '']), edited: d(-b2(0, 300)), h, remarks: i === 0 ? Array.from({ length: 60 }, () => longText).join('\n\n') : (r2() < 0.3 ? longText : '') });
    }
    notes[1].h = {}; // a set with every heading empty

    // Past clients: 1,200 parent companies, about 3,800 subsidiaries, one parent with 340 of them, 45 sectors written in
    // several spellings and scripts, and many without a sector. Only two levels exist: parent and subsidiary.
    const sectors = ['Banking', 'Retail', ' retail', 'RETAIL', 'Healthcare', 'Logistics', 'Hospitality', 'Food and beverage', 'Education', 'Utilities', 'Property', 'Telecoms', 'Automotive', 'Insurance', 'Media',
      'Manufacturing of industrial machinery and spare parts for the mining sector', '製造業', 'الخدمات المصرفية', 'การท่องเที่ยว', 'Agriculture', 'Construction', 'Energy', 'Mining', 'Pharmaceuticals', 'Wellness', 'Government', 'Non-profit',
      'Fintech', 'E-commerce', 'Aviation', 'Shipping', 'Textiles', 'Chemicals', 'Beauty', 'Sports', 'Legal services', 'Consulting', 'Security', 'Printing', 'Furniture', 'Fisheries', 'Plantation', 'Cement', 'Steel', 'Water treatment'];
    const pastNames = [['Internationalebeschaffungsgesellschaftfürindustrieanlagenundmaschinenbau', 'Manufacturing of industrial machinery and spare parts for the mining sector'],
      ['PT Sinar Nusantara Agribusiness and Food Processing International Holdings Group Tbk', 'Food and beverage'], ['北京字节跳动科技有限公司', '製造業'], ['شركة الاتصالات السعودية', 'Telecoms'],
      ['บริษัท ไทยเบฟเวอเรจ จำกัด (มหาชน)', 'การท่องเที่ยว'], ['X', ''], ['Ab', 'Retail'], ['Samsung Electronics 삼성전자', 'Manufacturing of industrial machinery and spare parts for the mining sector'], ['株式会社ファーストリテイリング', 'Retail']];
    const past = [];
    for (let i = 0; i < 1200; i++) {
      const id = 'sp' + i;
      const [name, sec] = i < pastNames.length ? pastNames[i] : [p2(['PT ', 'CV ', '', '']) + p2(['Sinar', 'Maju', 'Jaya', 'Abadi', 'Mega', 'Surya', 'Bumi', 'Cahaya', 'Karya', 'Prima']) + ' ' + p2(['Group', 'Holdings', 'Nusantara', 'Sentosa', 'Makmur', 'Teknik']) + ' ' + (i + 1), r2() < 0.2 ? '' : p2(sectors)];
      const umbrella = i === 1 || r2() < 0.05;
      past.push({ id, name, sector: sec, parent: null, counted: !umbrella });
      const nSubs = i === 1 ? 340 : (r2() < 0.45 ? 0 : (r2() < 0.1 ? b2(12, 60) : b2(1, 5)));
      for (let j = 0; j < nSubs; j++) {
        past.push({ id: id + '-' + j, parent: id, counted: true, sector: r2() < 0.18 ? '' : (r2() < 0.6 && sec ? sec : p2(sectors)),
          name: j === 0 && i === 1 ? 'Anakperusahaanpengolahanmakanandanminumanwilayahindonesiatimurdanbaratsertasekitarnya' : (j === 1 && i === 1 ? '新加坡子公司 ' + j : p2(['PT ', '']) + p2(['Sinar', 'Maju', 'Jaya', 'Abadi', 'Mega']) + ' ' + p2(['Cabang', 'Unit', 'Branch', 'Distribusi', 'Retail']) + ' ' + (j + 1)) });
      }
    }
    // Flows: 60 of them, one with 40 steps, a step with 12 roles and 30 names, a decision with 6 outcomes, other scripts.
    let sf = 0;
    const flows = [];
    const longDesc = 'Everything that has to happen before the work can move on, written out in full so nobody has to ask: who prepares the documents, which of them need a signature, where they are filed, and what to do when one of the people involved is away for more than a week.';
    for (let i = 0; i < 60; i++) {
      const nSteps = i === 0 ? 40 : (i === 1 ? 0 : b2(1, 9));
      const steps = Array.from({ length: nSteps }, (_, j) => ({ id: 'sf' + i + 's' + j,
        title: j === 0 && i === 0 ? 'Pengumpulandanverifikasidokumenpendukunguntukpengajuananggaranregional' : p2(['Prepare', 'Review', 'Approve', 'Send', 'Check', '確認する', 'مراجعة']) + ' ' + p2(['the documents', 'the budget', 'the contract', 'the plan', 'everything with the regional office and the partner network']),
        desc: r2() < 0.3 ? '' : (r2() < 0.3 ? longDesc : 'Do it within two working days.'),
        roles: j === 1 && i === 0 ? Array.from({ length: 12 }, (_, k) => ({ id: 'sr' + (++sf), label: k === 0 ? 'Responsible for coordinating every regional office' : p2(['Responsible', 'Consulted', 'Informed', 'Approves', 'Backup', '担当']), names: k === 0 ? people.slice(0, 30) : people.slice(k, k + 2) }))
          : Array.from({ length: r2() < 0.2 ? 0 : b2(1, 3) }, () => ({ id: 'sr' + (++sf), label: p2(['Responsible', 'Consulted', 'Informed']), names: Array.from(new Set(Array.from({ length: b2(1, 3) }, () => p2(people)))) })) }));
      const hasDec = i === 0 || (nSteps > 1 && r2() < 0.5);
      const decision = !hasDec ? null : { q: i === 0 ? 'Has the regional procurement committee approved the budget, including every exception that was raised in the second round of review?' : 'Approved?', desc: i === 0 ? longDesc : '',
        outcomes: Array.from({ length: i === 0 ? 6 : 2 }, (_, k) => ({ id: 'so' + (++sf), good: k === 0, title: k === 0 ? 'Go ahead' : p2(['Send it back', 'Ask for more detail', 'Stop here', 'إعادة', '差し戻し']), desc: k === 0 ? '' : (r2() < 0.5 ? longDesc : ''), roles: [{ id: 'sr' + (++sf), label: 'Responsible', names: [p2(people)] }], back: k > 0 && nSteps && r2() < 0.7 ? 'sf' + i + 's' + b2(0, nSteps - 1) : null })) };
      flows.push({ id: 'sf' + i, name: i === 0 ? 'Prosedurpengadaanbarangdanjasauntukseluruhkantorcabangdiwilayahindonesiatimur' : (i === 2 ? '新しいお客様の受け入れ' : (i === 3 ? 'إجراءات الموافقة' : 'Process ' + (i + 1) + ' ' + p2(['onboarding', 'approvals', 'month-end close', 'partner referral', 'returns and refunds for every outlet']))),
        desc: r2() < 0.4 ? '' : longDesc, edited: d(-b2(0, 200)), steps, decision });
    }
    return { people, companies, groups, tasks, events, notes, past, flows, types: TYPES.slice(), touch: TOUCH.slice(), coFields: schema.fields, coOptions: schema.options, coShown: schema.shown };
  }

  window.PROTO_DATA = { TODAY, d, normal, stress };
})();
