A classic that works really well with 3rd-years is to turn the classroom into a **human stream pipeline** before anyone writes a line of code. It makes the non-obvious parts of streams (laziness, element-by-element processing, single use) something students physically experience rather than memorize.

**The setup**

Hand out a stack of index cards, each with a data record, e.g. a student with name, class, and grade, or a product with name, category, and price. That's your source collection. Then pick 4–5 students and give each one an operation card:

- **filter**: "Only pass on cards where price > 10"
- **map**: "Write the name in capitals on a sticky note and pass only the note on"
- **sorted**: "Collect everything, sort it, then pass it on"
- **limit(3)**: "Pass on the first 3, then shout STOP"
- **collect**: the student at the end with a box

**The rules that teach the concepts**

1. **Laziness:** Nobody moves until the collector at the end says "next!" If there's no terminal operation, nothing happens at all. Let them stand there awkwardly for a few seconds; they'll remember it.
2. **One element at a time:** A card travels through the entire pipeline before the next one starts. This is the big "aha", because most students assume each step processes the whole list first, like with loops.
3. **Short-circuiting:** When `limit(3)` shouts STOP, the source stops handing out cards. Point out that the rest of the stack was never even looked at.
4. **Stateful operations:** Put `sorted` in the middle and watch the flow break. That student has to hoard every card before passing anything on. This explains why `sorted` is expensive and changes the processing order.
5. **Single use:** Once the cards are in the box, ask the class to run the pipeline again. They can't, because the stream has been consumed. You need a new stream from the source.

Bonus round: split the stack between two parallel lines to introduce parallel streams, and let them discover that `forEach` output order becomes unpredictable.

**Back to code**

Rebuild the exact same pipeline in Java and use `peek()` with `System.out.println` between steps. Students can compare the printed order with what they just acted out. Then swap the order of `filter` and `sorted`, or `limit` and `map`, and have them predict the output before running it.

**Follow-up challenge**

Let groups design a pipeline puzzle for another group: a dataset plus a question ("the three cheapest vegetarian dishes from the cafeteria menu, names only"). The other group has to act it out first, then code it. Using data from their own school life (timetables, cafeteria menus, sports results) keeps it engaging.

If you meant I/O streams (`InputStream`/`Reader`) rather than the Stream API, a water-pipe metaphor with buffers as buckets works nicely too. Happy to sketch that version as well.
