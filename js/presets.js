// Dropdown presets for every parameterised operation, keyed by the element type flowing into the operation.
// Types: Movie, String, Integer, Double. `java` is the exact text used in the generated code.
(function (root) {
  const SF = (root.SF = root.SF || {});

  const cmpNum = (a, b) => a - b;
  const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // same as Java's String.compareTo for our data

  SF.VAR = { Movie: 'm', String: 's', Integer: 'n', Double: 'r' };

  SF.PRESETS = {
    filter: {
      Movie: [
        { id: 'rating8', java: 'm -> m.rating() >= 8.0', fn: (m) => m.rating >= 8.0 },
        { id: 'year2000', java: 'm -> m.year() >= 2000', fn: (m) => m.year >= 2000 },
        { id: 'scifi', java: 'm -> m.genre().equals("Sci-Fi")', fn: (m) => m.genre === 'Sci-Fi' },
        { id: 'startsT', java: 'm -> m.title().startsWith("T")', fn: (m) => m.title.startsWith('T') },
      ],
      String: [
        { id: 'len10', java: 's -> s.length() > 10', fn: (s) => s.length > 10 },
        { id: 'startsT', java: 's -> s.startsWith("T")', fn: (s) => s.startsWith('T') },
      ],
      Integer: [
        { id: 'gt10', java: 'n -> n > 10', fn: (n) => n > 10 },
        { id: 'even', java: 'n -> n % 2 == 0', fn: (n) => n % 2 === 0 },
        { id: 'ge2000', java: 'n -> n >= 2000', fn: (n) => n >= 2000 },
      ],
      Double: [
        { id: 'ge8', java: 'r -> r >= 8.0', fn: (r) => r >= 8.0 },
        { id: 'lt6', java: 'r -> r < 6.0', fn: (r) => r < 6.0 },
      ],
    },
    map: {
      Movie: [
        { id: 'title', java: 'Movie::title', fn: (m) => m.title, out: 'String' },
        { id: 'year', java: 'Movie::year', fn: (m) => m.year, out: 'Integer' },
        { id: 'genre', java: 'Movie::genre', fn: (m) => m.genre, out: 'String' },
        { id: 'rating', java: 'Movie::rating', fn: (m) => m.rating, out: 'Double' },
      ],
      String: [
        { id: 'upper', java: 'String::toUpperCase', fn: (s) => s.toUpperCase(), out: 'String' },
        { id: 'length', java: 'String::length', fn: (s) => s.length, out: 'Integer' },
      ],
      Integer: [
        { id: 'decade', java: 'n -> n / 10 * 10', fn: (n) => Math.trunc(n / 10) * 10, out: 'Integer' },
      ],
      Double: [
        { id: 'double', java: 'r -> r * 2', fn: (r) => r * 2, out: 'Double' },
      ],
    },
    sorted: {
      Movie: [
        { id: 'ratingDesc', java: 'Comparator.comparing(Movie::rating).reversed()', cmp: (a, b) => b.rating - a.rating },
        { id: 'rating', java: 'Comparator.comparing(Movie::rating)', cmp: (a, b) => a.rating - b.rating },
        { id: 'year', java: 'Comparator.comparing(Movie::year)', cmp: (a, b) => a.year - b.year },
        { id: 'title', java: 'Comparator.comparing(Movie::title)', cmp: (a, b) => cmpStr(a.title, b.title) },
      ],
      String: [
        { id: 'natural', java: '', cmp: cmpStr },
        { id: 'reverse', java: 'Comparator.reverseOrder()', cmp: (a, b) => cmpStr(b, a) },
      ],
      Integer: [
        { id: 'natural', java: '', cmp: cmpNum },
        { id: 'reverse', java: 'Comparator.reverseOrder()', cmp: (a, b) => cmpNum(b, a) },
      ],
      Double: [
        { id: 'natural', java: '', cmp: cmpNum },
        { id: 'reverse', java: 'Comparator.reverseOrder()', cmp: (a, b) => cmpNum(b, a) },
      ],
    },
  };

  SF.NUMBER_CHOICES = [1, 2, 3, 5, 8]; // for limit / skip
  SF.TERMINALS = ['toList', 'count', 'findFirst', 'forEach'];
  SF.OP_KINDS = ['filter', 'map', 'sorted', 'distinct', 'skip', 'limit', 'peek'];
  SF.MAX_OPS = 5;

  // Analyse a pipeline definition {ops:[{kind,param}], terminal}:
  // resolves presets and computes the element type in front of / behind every operation.
  SF.analyze = function (pipeline) {
    let type = 'Movie';
    let peeks = 0;
    return pipeline.ops.map((op) => {
      const o = { kind: op.kind, inType: type };
      const list = SF.PRESETS[op.kind] && SF.PRESETS[op.kind][type];
      if (list) o.preset = list.find((p) => p.id === op.param) || list[0];
      if (op.kind === 'limit' || op.kind === 'skip') o.n = SF.NUMBER_CHOICES.includes(op.param) ? op.param : 3;
      if (op.kind === 'peek') o.label = 'peek ' + ++peeks;
      o.outType = op.kind === 'map' ? o.preset.out : type;
      type = o.outType;
      return o;
    });
  };

  SF.finalType = function (pipeline) {
    const a = SF.analyze(pipeline);
    return a.length ? a[a.length - 1].outType : 'Movie';
  };

  // Fix up parameters after an edit: a preset that does not exist for the new element type falls back to the first one.
  SF.normalize = function (pipeline) {
    const a = SF.analyze(pipeline);
    pipeline.ops.forEach((op, i) => {
      if (a[i].preset) op.param = a[i].preset.id;
      else if (a[i].n !== undefined) op.param = a[i].n;
      else delete op.param;
    });
    return pipeline;
  };

  SF.fmt = function (value, type) {
    if (type === 'Movie') return value.title;
    if (type === 'Double') return Number.isInteger(value) ? value.toFixed(1) : String(value);
    return String(value);
  };

  SF.key = (value) => (typeof value === 'object' ? JSON.stringify(value) : String(value));
})(typeof globalThis !== 'undefined' ? globalThis : this);
