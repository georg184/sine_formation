/* SVG animation: one angular state drives the circle, both heights and the trace. */
(function () {
  'use strict';
  const APP_VERSION = '20261024.095852';
  const core = window.SineFormation;
  const bridge = window.MuWeaveModuleBridge || null;
  const byId = id => document.getElementById(id);
  const root = byId('app'), diagram = byId('diagram');
  const namespace = 'http://www.w3.org/2000/svg';
  const cx = 170, cy = 218, radius = 114, graphOrigin = 392, xScale = 70;
  const orange = '#D97706', green = '#16805D', ink = '#4B5563';
  const number = new Intl.NumberFormat('en-US', {useGrouping: false, maximumFractionDigits: 3});
  let state = {schema: 1, x: 0, speed: 30};
  let ready = false, locked = false, initializing = false, running = false;
  let frame = 0, previous = null, lastPublish = 0, lastHeight = 0;
  let arcLabel, remainderLabel, lengthLabel, circleHeightLabel, graphHeightLabel, unitLabel;

  /** Stop on an infrastructure error while preserving the last saved state. */
  function fail(message) {
    locked = true; running = false; cancelAnimationFrame(frame);
    byId('notice').textContent = message;
    root.querySelectorAll('button, input').forEach(control => { control.disabled = true; });
  }

  if (window.GG_APP_VERSION !== APP_VERSION || core?.VERSION !== APP_VERSION || window.GGTypography?.VERSION !== '1.1.0') {
    fail('Die App-Dateien gehören zu verschiedenen Versionen. Bitte die Seite vollständig neu laden.');
    return;
  }

  /** Return the angle and speed; restored sessions deliberately open paused. */
  function snapshot() { return ready ? core.validateState(state) : bridge?.getState() ?? null; }

  /** Publish a complete snapshot through the installed bridge only. */
  function publish() {
    if (!ready || locked || !bridge) return;
    if (!bridge.isEnabled()) { fail('Der Host hat Änderungen gesperrt. Der bisherige Stand bleibt erhalten.'); return; }
    bridge.updateState(snapshot());
  }

  /** Match the iframe to its content without feeding back fractional scrollbars. */
  function reportHeight() {
    const height = Math.ceil(document.body.getBoundingClientRect().height) + 1;
    if (bridge?.isInitialized() && height !== lastHeight) {
      lastHeight = height; bridge.reportPreferredHeight(height);
    }
  }

  /** Create one SVG primitive from known numeric geometry. */
  function element(tag, attributes, parent) {
    const node = document.createElementNS(namespace, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    parent?.append(node);
    return node;
  }

  /** Compile each fixed mathematical label once, outside the animation loop. */
  async function label(tex, x, y, color = ink, fontSize = 24, parent = byId('math-labels')) {
    const rendered = await MathJax.tex2svgPromise(tex, {display: false});
    if (rendered.querySelector('[data-mjx-error], mjx-merror')) throw new Error('Invalid label');
    const svg = rendered.querySelector('svg').cloneNode(true);
    const box = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    const width = box[2] * fontSize / 1000, height = box[3] * fontSize / 1000;
    svg.setAttribute('width', width); svg.setAttribute('height', height);
    svg.setAttribute('x', -width / 2); svg.setAttribute('y', -height / 2);
    const group = element('g', {transform: `translate(${x} ${y})`, color, 'aria-hidden': 'true'}, parent);
    group.append(svg);
    return group;
  }

  /** Build axis ticks, exact π labels and the clipped full curve. */
  async function buildDiagram() {
    const grid = byId('grid');
    for (const value of [-1, 1]) {
      const y = cy - value * radius;
      element('line', {x1: graphOrigin, x2: graphOrigin + xScale * core.END, y1: y, y2: y, stroke: '#e7ebef'}, grid);
      await label(String(value), graphOrigin - 19, y, '#667085', 18);
      await label(String(value), cx - 17, y, '#667085', 18);
    }
    for (let index = 0; index <= 8; index += 1) {
      const x = graphOrigin + xScale * index * Math.PI / 2;
      element('line', {x1: x, x2: x, y1: cy - radius, y2: cy + radius, stroke: '#eff2f5'}, grid);
      element('line', {x1: x, x2: x, y1: cy - 4, y2: cy + 5, stroke: '#667085', 'stroke-width': 1.2}, grid);
      const tex = index === 0 ? '0' : index === 1 ? '\\frac{\\pi}{2}' :
        index % 2 ? `\\frac{${index}\\pi}{2}` : index === 2 ? '\\pi' : `${index / 2}\\pi`;
      await label(tex, x, cy + 29, '#667085', 22);
    }
    unitLabel = await label('1', cx + radius / 2, cy + 20, '#2563EB', 20);
    await label('y', cx + 18, 76, ink);
    await label('y', graphOrigin + 18, 76, ink);
    await label('x', 1303, cy + 20, ink);
    await label('y=\\sin(x)', 830, 68, green, 24);
    const moving = byId('moving-labels');
    arcLabel = await label('x', 0, 0, orange, 23, moving);
    remainderLabel = await label('x-2\\pi', 0, 0, orange, 23, moving);
    lengthLabel = await label('x', 0, 0, orange, 23, moving);
    circleHeightLabel = await label('y', 0, 0, green, 23, moving);
    graphHeightLabel = await label('y', 0, 0, green, 23, moving);
    const points = [];
    for (let index = 0; index <= 720; index += 1) {
      const x = core.END * index / 720;
      points.push(`${index ? 'L' : 'M'}${graphOrigin + xScale * x},${cy - radius * Math.sin(x)}`);
    }
    byId('trace').setAttribute('d', points.join(' '));
  }

  /** Move a cached label and show it only where the corresponding length is visible. */
  function moveLabel(node, x, y, visible = true) {
    node.setAttribute('transform', `translate(${x} ${y})`);
    node.setAttribute('visibility', visible ? 'visible' : 'hidden');
  }

  /** Draw only geometry; formulas and DOM identity remain stable across frames. */
  function draw() {
    const x = state.x, sine = Math.sin(x), cosine = Math.cos(x);
    const circleX = cx + radius * cosine, pointY = cy - radius * sine;
    const graphX = graphOrigin + xScale * x;
    const phase = core.phase(x);
    moveLabel(unitLabel, cx + radius / 2, cy + (sine >= 0 ? 20 : -20));
    const points = [];
    if (phase.angle > 0) {
      const steps = Math.max(2, Math.ceil(phase.angle * 40));
      for (let index = 0; index <= steps; index += 1) {
        const angle = phase.angle * index / steps;
        points.push(`${index ? 'L' : 'M'}${cx + radius * Math.cos(angle)},${cy - radius * Math.sin(angle)}`);
      }
    }
    byId('arc').setAttribute('d', points.join(' '));
    byId('completed-circle').setAttribute('visibility', phase.turns ? 'visible' : 'hidden');
    byId('moving-radius').setAttribute('x2', circleX); byId('moving-radius').setAttribute('y2', pointY);
    for (const [id, px] of [['circle-y', circleX], ['graph-y', graphX]]) {
      const node = byId(id);
      node.setAttribute('x1', px); node.setAttribute('x2', px);
      node.setAttribute('y1', cy); node.setAttribute('y2', pointY);
      node.setAttribute('visibility', Math.abs(sine) > 1e-12 ? 'visible' : 'hidden');
    }
    for (const [id, px] of [['circle-point', circleX], ['graph-point', graphX]]) {
      byId(id).setAttribute('cx', px); byId(id).setAttribute('cy', pointY);
    }
    const guide = byId('height-guide');
    guide.setAttribute('x1', circleX); guide.setAttribute('x2', graphX);
    guide.setAttribute('y1', pointY); guide.setAttribute('y2', pointY);
    byId('graph-x').setAttribute('x2', graphX);
    byId('graph-x').setAttribute('visibility', x > 0.005 ? 'visible' : 'hidden');
    byId('trace-clip').setAttribute('width', xScale * x + (x > 0 ? .01 : 0));
    const labelRadius = radius + (phase.turns ? 33 : 23);
    const ax = Math.max(46, cx + labelRadius * Math.cos(phase.angle / 2)), ay = cy - labelRadius * Math.sin(phase.angle / 2);
    moveLabel(arcLabel, ax, ay, phase.turns === 0 && x > .04);
    moveLabel(remainderLabel, ax, ay, phase.turns > 0);
    moveLabel(lengthLabel, (graphOrigin + graphX) / 2, cy - 19, x > .25);
    moveLabel(circleHeightLabel, circleX + (cosine < 0 ? -17 : 17), (cy + pointY) / 2, Math.abs(sine) > .12);
    moveLabel(graphHeightLabel, graphX + (x > core.END - .3 ? -17 : 17), (cy + pointY) / 2, Math.abs(sine) > .12);
    byId('position').value = x;
    byId('x-value').textContent = number.format(x);
    byId('y-value').textContent = number.format(Math.abs(sine) < 1e-12 ? 0 : sine);
    byId('angle-value').textContent = number.format(x * 180 / Math.PI);
    byId('lap-note').textContent = x === core.END ? 'Zwei volle Umläufe' : phase.turns ? 'Ein voller Umlauf + Restbogen' : 'Erster Umlauf';
    diagram.dataset.x = x; diagram.dataset.y = sine;
  }

  /** Finish the current time interval before changing speed or pausing. */
  function integrate(now) {
    if (running && previous !== null) state.x = core.advance(state.x, state.speed, Math.max(0, now - previous) / 1000);
    previous = now;
  }

  /** Advance from monotonic time, independently of display frame rate. */
  function tick(now) {
    if (!running || locked) return;
    integrate(now); draw();
    if (state.x >= core.END) { pause(false); byId('status').textContent = 'Zwei Umläufe sind vollständig. Mit Start beginnt die Zeichnung erneut.'; return; }
    if (now - lastPublish > 500) { publish(); lastPublish = now; }
    frame = requestAnimationFrame(tick);
  }

  /** Pause without losing the already traced curve or the selected speed. */
  function pause(update = true) {
    if (update) integrate(performance.now());
    running = false; previous = null; cancelAnimationFrame(frame);
    byId('play').textContent = 'Start';
    if (ready) { draw(); publish(); }
  }

  byId('play').addEventListener('click', () => {
    if (!ready || locked) return;
    if (running) { pause(); byId('status').textContent = 'Pausiert. Start setzt die Zeichnung fort.'; return; }
    if (state.x >= core.END) state.x = 0;
    running = true; previous = performance.now();
    byId('play').textContent = 'Pause'; byId('status').textContent = 'Die Bogenlänge wächst; beide grünen Pfeile zeigen dieselbe y-Koordinate.';
    draw(); frame = requestAnimationFrame(tick);
  });
  byId('reset').addEventListener('click', () => {
    if (!ready || locked) return;
    pause(); state.x = 0; draw(); publish();
    byId('status').textContent = 'Zurück am Anfang. Die gewählte Winkelgeschwindigkeit bleibt erhalten.';
  });
  byId('speed').addEventListener('input', () => {
    if (!ready || locked) return;
    integrate(performance.now()); state.speed = Number(byId('speed').value);
    byId('speed-value').textContent = number.format(state.speed);
    byId('speed').setAttribute('aria-valuetext', `${number.format(state.speed)} Grad pro Sekunde`);
    draw(); publish();
  });
  byId('position').addEventListener('input', () => {
    if (!ready || locked) return;
    const selected = Math.max(0, Math.min(core.END, Number(byId('position').value)));
    pause(); state.x = selected; draw(); publish();
    byId('status').textContent = 'Bogenlänge gewählt. Mit Start geht die Zeichnung hier weiter.';
  });
  root.querySelectorAll('[data-angle]').forEach(button => button.addEventListener('click', () => {
    if (!ready || locked) return;
    pause(); state.x = Number(button.dataset.angle) * Math.PI; draw(); publish();
    byId('status').textContent = 'Bogenlänge gewählt. Vergleiche die beiden grünen Pfeile.';
  }));
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) pause(); });
  window.addEventListener('pagehide', () => { if (ready) pause(); });

  /** Restore compatible learner state and prepare all math before enabling controls. */
  async function initialize(restored) {
    if (ready || locked || initializing) return;
    initializing = true;
    try {
      state = restored == null ? state : core.validateState(restored);
      window.GGTypography.apply({'--size-small': -1, '--size-title': 2}, bridge);
      document.documentElement.dataset.presentation = bridge?.getModuleContext()?.presentation || 'full';
      document.documentElement.dataset.embedded = String(Boolean(bridge));
      if (!window.MathJax?.startup?.promise) throw new Error('MathJax unavailable');
      await MathJax.startup.promise;
      await MathJax.typesetPromise([root]);
      await buildDiagram();
      ready = true;
      byId('speed').value = state.speed; byId('speed-value').textContent = number.format(state.speed);
      byId('notice').textContent = '';
      root.querySelectorAll('button, input').forEach(control => { control.disabled = false; });
      draw(); reportHeight(); root.dataset.ready = 'true';
    } catch {
      fail('Das Applet konnte nicht geladen werden. Ein vorhandener gespeicherter Stand wurde nicht überschrieben. Bitte die Seite neu laden.');
    }
  }

  if (bridge) {
    bridge.setSnapshotProvider(snapshot); bridge.subscribeState(initialize);
    if (bridge.isInitialized()) initialize(bridge.getState());
    window.addEventListener('message', () => { if (ready && !bridge.isEnabled()) fail('Der Host hat Änderungen gesperrt. Der bisherige Stand bleibt erhalten.'); });
  } else initialize(null);
  new ResizeObserver(reportHeight).observe(document.body);
})();
