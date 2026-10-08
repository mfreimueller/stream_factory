// Pipeline definition -> Java source. Returns lines tagged with the stage they belong to
// (-1 = source, 0..n-1 = operations, n = terminal) so the UI can highlight the active line.
(function (root) {
  const SF = (root.SF = root.SF || {});

  function opCall(o) {
    switch (o.kind) {
      case 'filter': case 'map': return `${o.kind}(${o.preset.java})`;
      case 'sorted': return `sorted(${o.preset.java})`;
      case 'distinct': return 'distinct()';
      case 'skip': case 'limit': return `${o.kind}(${o.n})`;
      case 'peek': {
        const v = SF.VAR[o.inType];
        const shown = o.inType === 'Movie' ? `${v}.title()` : v;
        return `peek(${v} -> System.out.println("${o.label}: " + ${shown}))`;
      }
    }
  }

  SF.codegen = function (pipeline) {
    const ops = SF.analyze(pipeline);
    const n = ops.length;
    const T = SF.finalType(pipeline);
    const t = pipeline.terminal;
    const decl = { toList: `List<${T}> result = `, count: 'long result = ', findFirst: `Optional<${T}> result = ` }[t] || '';
    const lines = [{ text: decl + 'movies.stream()', stage: -1 }];
    ops.forEach((o, i) => lines.push({ text: '        .' + opCall(o), stage: i }));
    if (t) {
      const call = t === 'forEach'
        ? `forEach(${T === 'Movie' ? 'm -> System.out.println(m.title())' : 'System.out::println'})`
        : `${t}()`;
      lines.push({ text: '        .' + call, stage: n });
    }
    lines[lines.length - 1].text += ';';
    if (!t) lines.push({ text: '// no terminal operation: nothing runs!', stage: n, comment: true });
    return lines;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
