/* Placeholder for areas designed in later sessions. Not part of the design. */
(function () {
  const area = P.qs.get('area') || 'plan';
  const nav = P.NAV.find((n) => n.id === area) || P.NAV[2];
  P.boot({
    page: nav.id,
    render() {
      P.$('#main').innerHTML = `<div class="bar"><div class="ttl"><h1>${nav.label}</h1></div></div>
        <section class="panel glass" style="margin-top:22px"><div class="empty">
          <div class="art">${P.ic(nav.icon)}</div><h3>Designed in a later session</h3>
          <p>This prototype is built one group of jobs at a time. ${nav.label} comes in a later group; see the map for what is ready.</p>
          <div class="acts"><a class="btn" href="map.html">Open the map</a><a class="btn" href="${P.keep('index.html')}">Back to Today</a></div></div></section>`;
    },
    states: [['', 'Normal']],
  });
})();
