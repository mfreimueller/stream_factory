// Stream engine. Mirrors how java.util.stream works internally for a sequential stream:
// a chain of "sinks", the source pushes ONE element at a time through the whole chain,
// and short-circuit operations (limit, findFirst) make the source check `cancelled()` before every element.
// The engine never touches the DOM: it only produces a list of events that the UI replays.
//
// Event types:
//   take     {id, text}                      source hands out card #id
//   visit    {stage, id, outcome, ...}       card arrives at station `stage` (0..n-1 = operations, n = terminal)
//            outcome: pass | reject | hold | collect | count | found | print
//   release  {stage, id, text, type}         sorted() lets a card out of its tray
//   stop     {stage}                         a short-circuit operation is satisfied, nothing more is pulled
//   shortcut {size}                          count() answered without running the pipeline
//   end      {result}                        terminal operation finished
(function (root) {
  const SF = (root.SF = root.SF || {});

  // opts.countShortcut: mimic Java 9+, where count() skips the pipeline if the size is known (SIZED flag).
  SF.run = function (pipeline, opts) {
    opts = opts || {};
    const ops = SF.analyze(pipeline);
    const terminal = pipeline.terminal;
    const n = ops.length;
    const cards = SF.MOVIES.map((value, id) => ({ id, value }));
    if (!terminal) return { events: [], lazy: true }; // laziness: nothing pulls, nothing runs

    const finalType = ops.length ? ops[n - 1].outType : 'Movie';
    const typeIn = (stage) => (stage < n ? ops[stage].inType : finalType);
    const typeOut = (stage) => (stage < n ? ops[stage].outType : finalType);
    const events = [];

    // Java 9+: count() does not traverse a SIZED stream. filter and distinct clear SIZED; map, sorted, peek keep it,
    // skip/limit keep it since Java 17.
    if (opts.countShortcut && terminal === 'count' && !ops.some((o) => o.kind === 'filter' || o.kind === 'distinct')) {
      let size = cards.length;
      for (const o of ops) {
        if (o.kind === 'skip') size = Math.max(0, size - o.n);
        if (o.kind === 'limit') size = Math.min(size, o.n);
      }
      events.push({ type: 'shortcut', size }, { type: 'end', result: { kind: 'count', value: size } });
      return { events, lazy: false };
    }

    const shortCircuit = ops.some((o) => o.kind === 'limit') || terminal === 'findFirst';

    function visit(stage, card, outcome, extra) {
      const ev = Object.assign(
        { type: 'visit', stage, id: card.id, outcome, inText: SF.fmt(card.value, typeIn(stage)), inType: typeIn(stage) },
        extra
      );
      if ('out' in ev) {
        ev.outText = SF.fmt(ev.out, typeOut(stage));
        ev.outType = typeOut(stage);
        delete ev.out;
      }
      events.push(ev);
    }

    // ---- terminal sinks. cancelled() returns the stage that requested the stop, or -1.
    let result;
    let terminalSink;
    if (terminal === 'toList') {
      const list = [];
      terminalSink = {
        accept(c) { list.push(SF.fmt(c.value, finalType)); visit(n, c, 'collect'); },
        end() { result = { kind: 'list', items: list, type: finalType }; },
        cancelled: () => -1,
      };
    } else if (terminal === 'count') {
      let count = 0;
      terminalSink = {
        accept(c) { count++; visit(n, c, 'count', { count }); },
        end() { result = { kind: 'count', value: count }; },
        cancelled: () => -1,
      };
    } else if (terminal === 'findFirst') {
      let found = null;
      terminalSink = {
        accept(c) {
          if (found) return;
          found = c;
          visit(n, c, 'found');
        },
        end() { result = { kind: 'optional', text: found ? SF.fmt(found.value, finalType) : null }; },
        cancelled: () => (found ? n : -1),
      };
    } else if (terminal === 'forEach') {
      terminalSink = {
        accept(c) { visit(n, c, 'print', { print: SF.fmt(c.value, finalType) }); },
        end() { result = { kind: 'void' }; },
        cancelled: () => -1,
      };
    } else {
      throw new Error('unknown terminal operation: ' + terminal);
    }

    // ---- intermediate sinks, built back to front like Java's AbstractPipeline.wrapSink
    function makeSink(op, i, down) {
      const passOn = { end: () => down.end(), cancelled: () => down.cancelled() };
      switch (op.kind) {
        case 'filter':
          return Object.assign({
            accept(c) {
              const ok = op.preset.fn(c.value);
              visit(i, c, ok ? 'pass' : 'reject', ok ? {} : { why: 'filtered out' });
              if (ok) down.accept(c);
            },
          }, passOn);
        case 'map':
          return Object.assign({
            accept(c) {
              const v = op.preset.fn(c.value);
              visit(i, c, 'pass', { out: v });
              down.accept({ id: c.id, value: v });
            },
          }, passOn);
        case 'peek':
          return Object.assign({
            accept(c) {
              visit(i, c, 'pass', { print: op.label + ': ' + SF.fmt(c.value, op.inType) });
              down.accept(c);
            },
          }, passOn);
        case 'distinct': {
          const seen = new Set(); // stateful, but still streams element by element (sequential ordered stream)
          return Object.assign({
            accept(c) {
              const k = SF.key(c.value);
              if (seen.has(k)) return visit(i, c, 'reject', { why: 'duplicate' });
              seen.add(k);
              visit(i, c, 'pass');
              down.accept(c);
            },
          }, passOn);
        }
        case 'skip': {
          let left = op.n;
          return Object.assign({
            accept(c) {
              if (left > 0) { left--; return visit(i, c, 'reject', { why: 'skipped' }); }
              visit(i, c, 'pass');
              down.accept(c);
            },
          }, passOn);
        }
        case 'limit': {
          let m = op.n;
          return {
            accept(c) {
              if (m > 0) { m--; visit(i, c, 'pass'); down.accept(c); }
            },
            end: () => down.end(),
            cancelled: () => (m <= 0 ? i : down.cancelled()),
          };
        }
        case 'sorted': {
          const tray = [];
          return {
            accept(c) { tray.push(c); visit(i, c, 'hold'); },
            end() {
              // like SortedOps: nothing leaves before upstream is exhausted; then release in order,
              // re-checking cancellation before every element if the pipeline can short-circuit
              const sorted = tray.slice().sort((a, b) => op.preset.cmp(a.value, b.value));
              for (const c of sorted) {
                if (shortCircuit) {
                  const s = down.cancelled();
                  if (s >= 0) { events.push({ type: 'stop', stage: s }); break; }
                }
                events.push({ type: 'release', stage: i, id: c.id, text: SF.fmt(c.value, op.inType), valueType: op.inType });
                down.accept(c);
              }
              down.end();
            },
            cancelled: () => -1, // sorted must see everything, so it never asks upstream to stop
          };
        }
        default:
          throw new Error('unknown operation: ' + op.kind);
      }
    }

    let head = terminalSink;
    for (let i = n - 1; i >= 0; i--) head = makeSink(ops[i], i, head);

    // ---- the source loop: copyIntoWithCancel (short-circuit) or forEachRemaining
    for (const card of cards) {
      if (shortCircuit) {
        const s = head.cancelled();
        if (s >= 0) { events.push({ type: 'stop', stage: s }); break; }
      }
      events.push({ type: 'take', id: card.id, text: SF.fmt(card.value, 'Movie') });
      head.accept(card);
    }
    head.end();
    events.push({ type: 'end', result });
    return { events, lazy: false };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
