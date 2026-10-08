// UI: builds the belt from the pipeline definition and replays the engine's event list as an animation.
(function () {
  const SF = window.SF;
  const $ = (s) => document.querySelector(s);
  const DELAYS = [1800, 1100, 650, 320, 110]; // ms per event for speed 1..5

  const DEMOS = [
    { name: 'Empty pipeline', ops: [], terminal: null },
    { name: 'Laziness: no terminal operation', ops: [['filter', 'rating8'], ['map', 'title']], terminal: null },
    { name: 'One element at a time', ops: [['filter', 'rating8'], ['peek'], ['map', 'title'], ['peek']], terminal: 'toList' },
    { name: 'Short-circuit: limit(2)', ops: [['filter', 'scifi'], ['limit', 2], ['map', 'title']], terminal: 'toList' },
    { name: 'findFirst', ops: [['filter', 'year2000'], ['peek']], terminal: 'findFirst' },
    { name: 'Stateful: sorted', ops: [['sorted', 'ratingDesc'], ['map', 'title']], terminal: 'toList' },
    { name: 'sorted, then limit(3)', ops: [['sorted', 'ratingDesc'], ['limit', 3], ['map', 'title']], terminal: 'toList' },
    { name: 'limit(3), then sorted', ops: [['limit', 3], ['sorted', 'ratingDesc'], ['map', 'title']], terminal: 'toList' },
    { name: 'Paging: skip + limit', ops: [['skip', 3], ['limit', 3], ['map', 'title']], terminal: 'toList' },
    { name: 'distinct on movies', ops: [['distinct'], ['map', 'title']], terminal: 'toList' },
    { name: 'distinct on genres', ops: [['map', 'genre'], ['distinct']], terminal: 'toList' },
    { name: 'count() without filter', ops: [['map', 'title'], ['peek']], terminal: 'count', shortcut: true },
  ];

  const state = {
    pipeline: { ops: [], terminal: null },
    predict: false,
    shortcut: false,
    events: null, // null = stream not started yet
    i: 0,
    view: null,
    playing: false,
    gen: 0, // bumped on every reset; async loops compare against it
    seq: 0, // bumped on every animated event; delayed effects compare against it
  };

  // ---------- helpers
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const delay = () => DELAYS[Number($('#speed').value) - 1];
  const analyzed = () => SF.analyze(state.pipeline);
  const nOps = () => state.pipeline.ops.length;
  const finalType = () => SF.finalType(state.pipeline);

  function stageName(stage) {
    if (stage < nOps()) {
      const o = analyzed()[stage];
      return o.kind === 'peek' ? o.label : o.kind;
    }
    return state.pipeline.terminal;
  }

  function emptyView() {
    const counters = [];
    for (let s = 0; s <= nOps(); s++) counters.push({ in: 0, out: 0 });
    return { taken: new Set(), stopped: false, counters, tray: {}, collected: [], count: 0, optional: undefined, result: null, done: false, log: [], out: [], activeStage: -2, stopStage: -1 };
  }

  // ---------- building the belt
  function buildToolbox() {
    const box = $('#toolbox');
    SF.OP_KINDS.forEach((kind) => {
      const b = document.createElement('button');
      b.textContent = '+ ' + kind;
      b.dataset.kind = kind;
      b.addEventListener('click', () => {
        if (nOps() >= SF.MAX_OPS) return;
        state.pipeline.ops.push({ kind });
        edited();
      });
      box.appendChild(b);
    });
  }

  function cardHtml(movie) {
    return `<b>${esc(movie.title)}</b><span>${esc(movie.genre)}</span><span>${movie.year} &#9733; ${movie.rating.toFixed(1)}</span>`;
  }

  function buildSource() {
    $('#cards').innerHTML = SF.MOVIES.map((m, i) =>
      `<div class="card" id="card-${i}" style="--gc:${SF.GENRE_COLORS[m.genre]}" title="#${i + 1}">${cardHtml(m)}</div>`).join('');
  }

  const TAGS = {
    sorted: ['stateful: holds ALL cards', 'stateful'],
    distinct: ['stateful: remembers seen', 'stateful'],
    limit: ['short-circuit', 'short'],
    filter: ['stateless', ''], map: ['stateless', ''], peek: ['stateless, prints', ''], skip: ['counts first n', ''],
  };

  function buildStations() {
    const ops = analyzed();
    $('#belt').innerHTML = ops.map((o, i) => {
      let control = '';
      if (o.preset) {
        const list = SF.PRESETS[o.kind][o.inType];
        control = `<select data-i="${i}" title="${esc(o.preset.java)}">${list.map((p) => `<option value="${p.id}"${p.id === o.preset.id ? ' selected' : ''}>${esc(p.java || 'natural order')}</option>`).join('')}</select>`;
      } else if (o.n !== undefined) {
        control = `<select data-i="${i}">${SF.NUMBER_CHOICES.map((v) => `<option${v === o.n ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
      }
      const [tag, cls] = TAGS[o.kind];
      const name = o.kind === 'peek' ? o.label : o.kind;
      return `<div class="station" id="st-${i}" data-i="${i}">
        <div class="st-head">
          <div class="st-top"><div class="st-title"><code>.${name}()</code></div>
            <div class="st-btns"><button data-act="left" ${i === 0 ? 'disabled' : ''} title="move left">&#9664;</button><button data-act="right" ${i === ops.length - 1 ? 'disabled' : ''} title="move right">&#9654;</button><button data-act="del" title="remove">&#10005;</button></div></div>
          ${control}
          <div class="tag ${cls}">${tag}</div>
        </div>
        <div class="slot" id="slot-${i}"></div>
        <div class="counts" id="counts-${i}"></div>
        ${o.kind === 'sorted' ? `<div class="tray-label">holding tray</div><div class="tray" id="tray-${i}"></div>` : ''}
      </div>`;
    }).join('');
  }

  function buildTerminalSelect() {
    const sel = $('#terminal');
    sel.innerHTML = `<option value="">(none)</option>` + SF.TERMINALS.map((t) => `<option value="${t}">${t}${t === 'forEach' ? '(println)' : '()'}</option>`).join('');
    sel.value = state.pipeline.terminal || '';
    const t = state.pipeline.terminal;
    $('#collector .st-title code').textContent = t ? `.${t}()` : 'terminal op';
    $('#termTag').textContent = { toList: 'collects all', count: 'counts', findFirst: 'short-circuit', forEach: 'prints each' }[t] || 'missing!';
    $('#termTag').className = 'tag ' + (t === 'findFirst' ? 'short' : '');
  }

  // Draw the belt line at slot height, from the source to the collector.
  function layout() {
    const stage = $('#stage').getBoundingClientRect();
    const slot = $('#collectorSlot').getBoundingClientRect();
    const line = $('#beltLine');
    line.style.top = slot.top - stage.top + slot.height / 2 - 4 + 'px';
    const src = $('#source').getBoundingClientRect();
    line.style.left = src.right - stage.left + 'px';
    line.style.width = $('#collector').getBoundingClientRect().left - src.right + 'px';
  }

  function renderCode() {
    const lines = SF.codegen(state.pipeline);
    const active = state.view.activeStage;
    $('#code').innerHTML = lines.map((l) =>
      `<span class="ln${l.comment ? ' cm' : ''}${l.stage === active && !l.comment ? ' active' : ''}">${esc(l.text)}</span>`).join('');
  }

  // ---------- dynamic parts (called after every event)
  function updateDynamic() {
    const v = state.view;
    const hide = state.predict && !v.done;
    const ops = analyzed();

    SF.MOVIES.forEach((_, i) => $('#card-' + i).classList.toggle('out', v.taken.has(i)));
    $('#cards').classList.toggle('stopped', v.stopped);
    $('#source').classList.toggle('consumed', v.done);
    const untouched = SF.MOVIES.length - v.taken.size;
    $('#srcState').textContent = v.done ? (untouched > 0 ? `consumed, ${untouched} untouched` : 'consumed') : state.events ? 'running...' : 'ready';
    document.querySelectorAll('.station').forEach((el) => el.classList.remove('stopping'));
    if (v.stopStage >= 0) stationEl(v.stopStage).classList.add('stopping');

    ops.forEach((o, i) => {
      const c = v.counters[i];
      $('#counts-' + i).innerHTML = hide ? 'in <b>?</b> &middot; out <b>?</b>' : `in <b>${c.in}</b> &middot; out <b>${c.out}</b>`;
      const tray = $('#tray-' + i);
      if (tray) {
        const held = v.tray[i] || [];
        tray.innerHTML = held.map((h) => `<div class="pill${v.stopped ? ' stale' : ''}" title="${esc(h.text)}">${esc(h.text)}</div>`).join('');
      }
    });

    const t = state.pipeline.terminal;
    const body = $('#collectorBody');
    if (!t) {
      body.innerHTML = '<div class="hint bad">No terminal operation: nobody pulls, nothing runs.</div>';
    } else if (hide) {
      body.innerHTML = '<div class="hint">Result hidden. What will end up here?</div>';
    } else if (t === 'toList') {
      body.innerHTML = `<div class="hint">${v.collected.length} element(s)</div><div class="chips">${v.collected.map((x) => `<div class="pill">${esc(x)}</div>`).join('')}</div>`;
    } else if (t === 'count') {
      body.innerHTML = v.result || v.count ? `<div class="big">${v.result ? v.result.value : v.count}</div>` : '<div class="hint">long result = ?</div>';
    } else if (t === 'findFirst') {
      body.innerHTML = v.optional === undefined ? '<div class="hint">Optional = ?</div>' : `<div class="big" style="font-size:18px">${v.optional === null ? 'Optional.empty' : 'Optional[' + esc(v.optional) + ']'}</div>`;
    } else {
      body.innerHTML = `<div class="hint">prints to the console &rarr;</div>`;
    }

    // per-stage counters for the terminal
    $('#log').innerHTML = v.log.map((l) => `<div class="k-${l.k}">${esc(l.text)}</div>`).join('');
    $('#log').scrollTop = 1e9;
    $('#out').innerHTML = v.out.map((t2) => `<div>${esc(t2)}</div>`).join('');
    $('#out').scrollTop = 1e9;
    renderCode();
    updateButtons();
  }

  function updateButtons() {
    const canRun = state.events === null || state.i < state.events.length;
    $('#btnPlay').innerHTML = state.playing ? '&#10074;&#10074; Pause' : '&#9654; Play';
    $('#btnStep').disabled = state.playing;
    $('#btnCard').disabled = state.playing;
    $('#btnFinish').disabled = !state.pipeline.terminal || (state.events !== null && !canRun);
    $('#btnNew').classList.toggle('pulse', !!state.view.done);
  }

  // ---------- applying events to the view model
  function applyEvent(ev) {
    const v = state.view;
    const log = (k, text) => v.log.push({ k, text });
    switch (ev.type) {
      case 'take':
        v.taken.add(ev.id);
        v.activeStage = -1;
        log('take', `#${ev.id + 1} ${ev.text}  (collector pulled)`);
        break;
      case 'visit': {
        const c = v.counters[ev.stage];
        c.in++;
        v.activeStage = ev.stage;
        const name = stageName(ev.stage);
        const tag = `#${ev.id + 1} ${name}: `;
        if (ev.outcome === 'reject') log('reject', tag + `${ev.inText} rejected (${ev.why})`);
        else if (ev.outcome === 'hold') { log('hold', tag + `${ev.inText} held in tray`); (v.tray[ev.stage] = v.tray[ev.stage] || []).push({ id: ev.id, text: ev.inText }); }
        else if (ev.outcome === 'pass') { c.out++; log('k', tag + (ev.outText !== undefined ? `${ev.inText} -> ${ev.outText}` : `${ev.inText} passes`)); }
        else if (ev.outcome === 'collect') { v.collected.push(ev.inText); log('k', tag + `collected ${ev.inText}`); }
        else if (ev.outcome === 'count') { v.count = ev.count; log('k', tag + `count = ${ev.count}`); }
        else if (ev.outcome === 'found') { v.optional = ev.inText; log('k', tag + `found ${ev.inText}`); }
        else if (ev.outcome === 'print') log('k', tag + `${ev.inText}`);
        if (ev.print) v.out.push(ev.print);
        break;
      }
      case 'release': {
        v.tray[ev.stage] = (v.tray[ev.stage] || []).filter((h) => h.id !== ev.id);
        v.counters[ev.stage].out++;
        v.activeStage = ev.stage;
        log('k', `#${ev.id + 1} sorted: releases ${ev.text}`);
        break;
      }
      case 'stop':
        v.stopped = true;
        v.stopStage = ev.stage;
        v.activeStage = ev.stage;
        log('stop', `STOP: ${stageName(ev.stage)} is satisfied, nothing more is pulled`);
        break;
      case 'shortcut':
        v.stopped = true;
        log('stop', `count() knows the size (${ev.size}) without running the pipeline`);
        break;
      case 'end':
        v.done = true;
        v.result = ev.result;
        v.activeStage = nOps();
        if (ev.result.kind === 'optional') v.optional = ev.result.text;
        log('k', `terminal operation finished`);
        break;
    }
  }

  // ---------- token animation
  const token = () => $('#token');

  function centerOf(el) {
    const s = $('#stage').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return [r.left - s.left + r.width / 2, r.top - s.top + r.height / 2];
  }

  function placeToken(el, teleport) {
    const t = token();
    const [x, y] = centerOf(el);
    if (teleport) t.style.transition = 'none';
    t.style.left = x + 'px';
    t.style.top = y + 'px';
    if (teleport) { void t.offsetWidth; t.style.transition = ''; }
  }

  function setToken(text, type, movieIdx) {
    const t = token();
    t.classList.remove('poof');
    if (type === 'Movie') {
      const m = SF.MOVIES[movieIdx];
      t.className = 'token show card';
      t.style.setProperty('--gc', SF.GENRE_COLORS[m.genre]);
      t.innerHTML = cardHtml(m);
    } else {
      t.className = 'token show pill';
      t.style.removeProperty('--gc');
      t.textContent = text;
    }
  }

  const hideToken = () => { token().className = 'token'; };

  function flash(el) {
    if (!el) return;
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 350);
  }

  const stationEl = (stage) => (stage < nOps() ? $('#st-' + stage) : $('#collector'));
  const slotEl = (stage) => (stage < nOps() ? $('#slot-' + stage) : $('#collectorSlot'));

  function animate(ev) {
    const d = delay();
    const mySeq = ++state.seq;
    const later = (frac, fn) => setTimeout(() => { if (state.seq === mySeq) fn(); }, d * frac);
    $('#stage').style.setProperty('--dur', Math.min(d * 0.7, 700) / 1000 + 's');

    if (ev.type === 'take') {
      setToken('', 'Movie', ev.id);
      placeToken($('#card-' + ev.id), true);
    } else if (ev.type === 'visit') {
      placeToken(slotEl(ev.stage), false);
      later(0.75, () => {
        flash(stationEl(ev.stage));
        if (ev.outcome === 'reject') { token().classList.add('poof'); }
        else if (ev.outcome === 'hold') hideToken();
        else if (ev.outText !== undefined) setToken(ev.outText, ev.outType, ev.id);
        else if (ev.stage === nOps()) hideToken();
      });
    } else if (ev.type === 'release') {
      const tray = $('#tray-' + ev.stage);
      const type = analyzed()[ev.stage].inType;
      setToken(ev.text, type, ev.id);
      placeToken(tray || slotEl(ev.stage), true);
      placeToken(slotEl(ev.stage), false);
    } else if (ev.type === 'stop') {
      hideToken();
    } else if (ev.type === 'end' || ev.type === 'shortcut') {
      later(0.5, hideToken);
    }
  }

  // ---------- playback
  function ensureStarted() {
    if (state.events) return true;
    const r = SF.run(state.pipeline, { countShortcut: state.shortcut });
    if (r.lazy) return false;
    state.events = r.events;
    state.i = 0;
    return true;
  }

  function stepEvent(instant) {
    if (!ensureStarted() || state.i >= state.events.length) return false;
    const ev = state.events[state.i++];
    applyEvent(ev);
    if (instant) hideToken(); else animate(ev);
    updateDynamic();
    return true;
  }

  function toast(html, bad) {
    const t = $('#toast');
    t.innerHTML = html;
    t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toast.h);
    toast.h = setTimeout(() => { t.className = 'toast'; }, 4500);
  }

  // Returns false if the run cannot start (and tells the class why).
  function canStart() {
    if (!state.pipeline.terminal) {
      $('#collector').classList.add('flash');
      setTimeout(() => $('#collector').classList.remove('flash'), 900);
      toast('Nothing happens. Without a terminal operation nobody asks for elements. <code>Streams are lazy.</code>');
      state.view.log.push({ k: 'stop', text: 'no terminal operation: nothing was pulled, nothing ran' });
      updateDynamic();
      return false;
    }
    if (state.view.done) {
      toast('<code>IllegalStateException</code>: stream has already been operated upon or closed. Call <code>movies.stream()</code> again (New stream).', true);
      return false;
    }
    return true;
  }

  async function playUntil(stopBefore) {
    if (state.playing || !canStart()) return;
    const gen = state.gen;
    state.playing = true;
    updateButtons();
    let first = true;
    while (state.gen === gen && state.playing) {
      if (!ensureStarted() || state.i >= state.events.length) break;
      if (!first && stopBefore(state.events[state.i])) break;
      first = false;
      stepEvent(false);
      await sleep(delay());
    }
    if (state.gen === gen) { state.playing = false; updateButtons(); }
  }

  function reset() {
    state.gen++;
    state.playing = false;
    state.events = null;
    state.i = 0;
    state.seq++;
    state.view = emptyView();
    hideToken();
    $('#toast').className = 'toast';
    updateDynamic();
  }

  // ---------- editing
  function edited() {
    SF.normalize(state.pipeline);
    buildStations();
    buildTerminalSelect();
    document.querySelectorAll('#toolbox button').forEach((b) => { b.disabled = nOps() >= SF.MAX_OPS; });
    reset();
    layout();
  }

  function loadDemo(demo) {
    state.pipeline = { ops: demo.ops.map(([kind, param]) => ({ kind, param })), terminal: demo.terminal };
    state.shortcut = !!demo.shortcut;
    $('#shortcut').checked = state.shortcut;
    edited();
  }

  function wire() {
    $('#belt').addEventListener('change', (e) => {
      const sel = e.target.closest('select');
      if (!sel) return;
      const op = state.pipeline.ops[Number(sel.dataset.i)];
      op.param = /^\d+$/.test(sel.value) ? Number(sel.value) : sel.value;
      edited();
    });
    $('#belt').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const i = Number(b.closest('.station').dataset.i);
      const ops = state.pipeline.ops;
      if (b.dataset.act === 'del') ops.splice(i, 1);
      else if (b.dataset.act === 'left' && i > 0) [ops[i - 1], ops[i]] = [ops[i], ops[i - 1]];
      else if (b.dataset.act === 'right' && i < ops.length - 1) [ops[i + 1], ops[i]] = [ops[i], ops[i + 1]];
      edited();
    });
    $('#terminal').addEventListener('change', (e) => { state.pipeline.terminal = e.target.value || null; edited(); });
    $('#predict').addEventListener('change', (e) => { state.predict = e.target.checked; updateDynamic(); });
    $('#shortcut').addEventListener('change', (e) => { state.shortcut = e.target.checked; reset(); });
    $('#speed').addEventListener('input', () => { $('#stage').style.setProperty('--dur', Math.min(delay() * 0.7, 700) / 1000 + 's'); });
    $('#demos').addEventListener('change', (e) => { loadDemo(DEMOS[Number(e.target.value)]); });

    $('#btnPlay').addEventListener('click', () => {
      if (state.playing) { state.playing = false; updateButtons(); return; }
      playUntil(() => false);
    });
    $('#btnStep').addEventListener('click', () => { if (canStart()) stepEvent(false); });
    $('#btnCard').addEventListener('click', () => playUntil((ev) => ev.type === 'take'));
    $('#btnFinish').addEventListener('click', () => {
      if (!canStart()) return;
      state.playing = false;
      while (stepEvent(true)) { /* run to the end */ }
    });
    $('#btnNew').addEventListener('click', reset);
    window.addEventListener('resize', layout);
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
      if (e.key === ' ') { e.preventDefault(); $('#btnPlay').click(); }
      if (e.key === 'ArrowRight') $('#btnStep').click();
    });
  }

  // ---------- start
  $('#demos').innerHTML = DEMOS.map((d, i) => `<option value="${i}">${d.name}</option>`).join('');
  buildToolbox();
  buildSource();
  wire();
  $('#demos').value = '1';
  loadDemo(DEMOS[1]);
})();
