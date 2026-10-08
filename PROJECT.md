Here's a concept for a small app you could build (or hand to students as a project later). Call it **"Stream Factory"**: an animated assembly line that replaces the human pipeline.

**Layout**

The screen shows a horizontal conveyor belt. On the left sits the **source**, a pile of colored cards, each a data object (e.g. a product with name, category, price). Along the belt are **stations**, one per stream operation, drawn as little machines with a label like `filter(price > 10)` or `map(toUpperCase)`. On the right sits the **collector**, a box where results land. Below the belt, a code panel shows the equivalent Java stream, and it updates live as the pipeline changes.

**Interaction**

You build the pipeline by dragging operations from a toolbox (filter, map, sorted, limit, distinct, peek) onto the belt and editing their parameters in a small popup. The terminal operation (collect, count, findFirst, forEach) goes on the collector. Playback controls let you run it continuously, step one element at a time, or adjust the speed, which is what you'll use most in front of the class.

**What the animation shows**

- **Laziness:** With no terminal operation, the play button is disabled or the belt just doesn't move. Once you add one, the collector "pulls" and the first card starts moving.
- **Element-by-element flow:** One card travels through all stations before the next leaves the source. Rejected cards drop off the belt with a small "poof" at the filter; mapped cards visibly change shape or label at the map station.
- **Short-circuiting:** When `limit` or `findFirst` is satisfied, a stop signal lights up and the remaining cards in the source gray out, never touched.
- **Stateful operations:** The `sorted` station has a holding tray. Cards pile up there until the source is empty, then leave in sorted order. The effect on the flow is obvious.
- **Single use:** After a run, the source shows "consumed", and replaying requires clicking "new stream".
- **Log panel:** A side log prints each event in order ("Card 3 → filter: rejected"), matching what `peek()` would output in real code.

**Classroom use**

The most valuable feature is a **predict mode**: you build a pipeline, hide the result box, and students predict the output and the number of elements each station processed before you hit play. Swapping `limit` and `sorted` and asking "how many cards does the filter see now?" makes for great discussions.

**Tech suggestion**

A single HTML page with JavaScript and some CSS animations is enough and runs on the projector without setup. If you want it closer to the Java world, JavaFX works too, and it could make a nice extension task where students add new operations like `skip` or `flatMap` themselves.

If you'd like, I can build a working prototype of this as an interactive page you can open directly in class.
