// Run with: node tests/run.js
const assert = require('node:assert/strict');
['data', 'presets', 'engine', 'codegen'].forEach((f) => require('../js/' + f + '.js'));
const SF = globalThis.SF;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.log('FAIL  ' + name + '\n' + e.message); process.exitCode = 1; }
}
const P = (ops, terminal) => SF.normalize({ ops: ops.map(([kind, param]) => ({ kind, param })), terminal });
const run = (p, opts) => SF.run(p, opts);
const ofType = (ev, t) => ev.filter((e) => e.type === t);
const result = (r) => r.events[r.events.length - 1].result;

test('laziness: no terminal operation -> nothing runs', () => {
  const r = run(P([['filter'], ['map']], null));
  assert.equal(r.lazy, true);
  assert.equal(r.events.length, 0);
});

test('element by element: a card finishes its whole journey before the next one is taken', () => {
  const r = run(P([['filter', 'rating8'], ['map', 'title']], 'toList'));
  const seq = r.events.filter((e) => e.type === 'take' || e.type === 'visit').map((e) => `${e.type[0]}${e.id}@${e.stage ?? ''}`);
  assert.deepEqual(seq.slice(0, 7), ['t0@', 'v0@0', 'v0@1', 'v0@2', 't1@', 'v1@0', 't2@']);
  assert.deepEqual(result(r).items, ['Solar Drift', 'The Dark Echo', 'The Dark Echo', 'Orbit Zero']);
});

test('filter rejects are reported and not passed downstream', () => {
  const r = run(P([['filter', 'rating8']], 'count'));
  assert.equal(ofType(r.events, 'visit').filter((e) => e.stage === 0 && e.outcome === 'reject').length, 8);
  assert.equal(result(r).value, 4);
});

test('short-circuit: filter + limit(2) stops the source after card #4', () => {
  const r = run(P([['filter', 'rating8'], ['limit', 2]], 'toList'));
  assert.equal(ofType(r.events, 'take').length, 4);
  assert.deepEqual(ofType(r.events, 'stop'), [{ type: 'stop', stage: 1 }]);
  assert.deepEqual(result(r).items, ['Solar Drift', 'The Dark Echo']);
});

test('findFirst short-circuits after the first hit', () => {
  const r = run(P([['filter', 'year2000']], 'findFirst'));
  assert.equal(ofType(r.events, 'take').length, 1);
  assert.equal(ofType(r.events, 'stop')[0].stage, 1);
  assert.deepEqual(result(r), { kind: 'optional', text: 'Solar Drift' });
});

test('sorted is stateful: holds all 12 cards before anything is released', () => {
  const r = run(P([['sorted', 'title']], 'toList'));
  const firstRelease = r.events.findIndex((e) => e.type === 'release');
  const holdsBefore = r.events.slice(0, firstRelease).filter((e) => e.type === 'visit' && e.outcome === 'hold').length;
  assert.equal(holdsBefore, 12);
  assert.equal(ofType(r.events.slice(0, firstRelease), 'take').length, 12);
  assert.equal(result(r).items[0], 'Glass Summit');
});

test('sorted is stable (equal ratings keep source order)', () => {
  const r = run(P([['sorted', 'ratingDesc'], ['map', 'title']], 'toList'));
  assert.deepEqual(result(r).items.slice(0, 4), ['Orbit Zero', 'Solar Drift', 'The Dark Echo', 'The Dark Echo']);
});

test('sorted().limit(3): upstream sees ALL 12 cards, tray released only until limit is satisfied', () => {
  const r = run(P([['sorted', 'ratingDesc'], ['limit', 3], ['map', 'title']], 'toList'));
  assert.equal(ofType(r.events, 'take').length, 12);
  assert.equal(ofType(r.events, 'release').length, 3);
  assert.deepEqual(ofType(r.events, 'stop'), [{ type: 'stop', stage: 1 }]);
  assert.deepEqual(result(r).items, ['Orbit Zero', 'Solar Drift', 'The Dark Echo']);
});

test('limit(3).sorted(): source stops after 3 cards, then the tray is released', () => {
  const r = run(P([['limit', 3], ['sorted', 'ratingDesc'], ['map', 'title']], 'toList'));
  assert.equal(ofType(r.events, 'take').length, 3);
  assert.equal(ofType(r.events, 'stop')[0].stage, 0);
  assert.deepEqual(result(r).items, ['Solar Drift', 'The Last Harbor', 'Neon Alley']);
});

test('skip(3).limit(3)', () => {
  const r = run(P([['skip', 3], ['limit', 3], ['map', 'title']], 'toList'));
  assert.equal(ofType(r.events, 'take').length, 6);
  assert.deepEqual(result(r).items, ['The Dark Echo', 'Quiet Summer', 'Star Nomads']);
});

test('distinct on genres and on whole movies', () => {
  const g = run(P([['map', 'genre'], ['distinct']], 'toList'));
  assert.deepEqual(result(g).items, ['Sci-Fi', 'Drama', 'Thriller', 'Fantasy', 'Action', 'Comedy']);
  const m = run(P([['distinct']], 'count'));
  assert.equal(result(m).value, 11); // card #7 is a duplicate of card #4
});

test('peek prints interleaved per element', () => {
  const r = run(P([['peek'], ['map', 'title'], ['peek']], 'forEach'));
  const prints = r.events.filter((e) => e.print).map((e) => e.print);
  assert.deepEqual(prints.slice(0, 3), ['peek 1: Solar Drift', 'peek 2: Solar Drift', 'Solar Drift']);
  assert.equal(prints.length, 36);
});

test('count() shortcut (toggle): SIZED stream is not traversed', () => {
  const p = P([['map', 'title'], ['peek']], 'count');
  const off = run(p);
  assert.equal(ofType(off.events, 'take').length, 12);
  const on = run(p, { countShortcut: true });
  assert.deepEqual(on.events.map((e) => e.type), ['shortcut', 'end']);
  assert.equal(result(on).value, 12);
});

test('count() shortcut respects skip/limit, but not filter/distinct', () => {
  assert.equal(result(run(P([['skip', 3], ['limit', 5]], 'count'), { countShortcut: true })).value, 5);
  assert.equal(result(run(P([['skip', 8], ['limit', 5]], 'count'), { countShortcut: true })).value, 4);
  const f = run(P([['filter', 'rating8']], 'count'), { countShortcut: true });
  assert.equal(ofType(f.events, 'take').length, 12);
  assert.equal(result(f).value, 4);
});

test('types: a preset that does not exist for the new element type falls back', () => {
  const p = P([['map', 'title'], ['filter', 'rating8'], ['sorted', 'ratingDesc']], 'toList');
  assert.equal(p.ops[1].param, 'len10');
  assert.equal(p.ops[2].param, 'natural');
  assert.equal(SF.finalType(p), 'String');
});

test('map changes the type: year -> decade', () => {
  const r = run(P([['map', 'year'], ['map', 'decade'], ['distinct'], ['sorted', 'natural']], 'toList'));
  assert.deepEqual(result(r).items, ['1970', '1980', '1990', '2000', '2010', '2020']);
});

test('codegen golden output', () => {
  const lines = SF.codegen(P([['filter', 'scifi'], ['peek'], ['map', 'title'], ['limit', 2]], 'toList')).map((l) => l.text);
  assert.deepEqual(lines, [
    'List<String> result = movies.stream()',
    '        .filter(m -> m.genre().equals("Sci-Fi"))',
    '        .peek(m -> System.out.println("peek 1: " + m.title()))',
    '        .map(Movie::title)',
    '        .limit(2)',
    '        .toList();',
  ]);
  const lazy = SF.codegen(P([['filter', 'rating8']], null)).map((l) => l.text);
  assert.deepEqual(lazy, ['movies.stream()', '        .filter(m -> m.rating() >= 8.0);', '// no terminal operation: nothing runs!']);
  assert.equal(SF.codegen(P([['map', 'rating']], 'findFirst'))[0].text, 'Optional<Double> result = movies.stream()');
  assert.equal(SF.codegen(P([], 'count'))[0].text, 'long result = movies.stream()');
});

console.log(`\n${passed} passed`);
