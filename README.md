# Stream Factory

Interactive showcase for the Streams intro (POS 3xHIF). Open `index.html` in a browser, no build, no server.

Concept: see `PROJECT.md` (idea) and `original.md` (the classroom role-play it is based on).

## Using it in class
- Pick a **Demo** or build a pipeline with **+ operation** buttons; every station has a dropdown, arrows to reorder, and a remove button. The terminal operation is chosen in the green collector.
- **Play / Pause** (space), **Step** (right arrow, one event), **Next card**, **Finish** (no animation), **Speed**.
- **Predict mode** hides counters and the result until the run is finished.
- **New stream** = `movies.stream()` again. Playing a consumed stream shows the `IllegalStateException`.
- **count() shortcut** mimics Java 9+/17+: `count()` on a stream whose size is known (no `filter`/`distinct`) does not run the pipeline, so `peek` prints nothing.

## Structure
| File | Purpose |
|---|---|
| `js/data.js` | the 12 movie cards (cards #4 and #7 are identical on purpose, for `distinct`) |
| `js/presets.js` | dropdown lambdas per element type, type tracking (`Movie`, `String`, `Integer`, `Double`) |
| `js/engine.js` | sink-chain engine that mirrors `java.util.stream`, produces an event list, no DOM |
| `js/codegen.js` | pipeline to Java source |
| `js/ui.js` | rendering and animation |

## Tests
`node tests/run.js` covers the engine and the code generator (laziness, element-by-element order, short-circuiting, `sorted` + `limit` order, `skip`, `distinct`, `peek`, `count()` shortcut, type fallback).

To add an operation: add presets (if it has parameters), a case in `makeSink` in `engine.js`, a case in `opCall` in `codegen.js`, and an entry in `SF.OP_KINDS` and `TAGS` in `ui.js`.
