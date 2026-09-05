import assert from "node:assert/strict";
import test from "node:test";

import { WORKED_EXAMPLES } from "./worked-examples.ts";

/**
 * The curation, held to the rules it is meant to demonstrate.
 *
 * These six are the first thing a stranger reads, and they are teaching two
 * things at once: that a Mix is a name rather than a label, and that one person
 * has several very different ones. Both are claims the set itself has to keep
 * making — a seventh example that summarised its Genres, or repeated an evening
 * already there, would quietly argue the opposite.
 */

test("there are six, and they are distinct evenings", () => {
  assert.equal(WORKED_EXAMPLES.length, 6);

  for (const field of ["mix", "mark", "prompt"] as const) {
    const values = WORKED_EXAMPLES.map((example) => example[field]);
    assert.equal(new Set(values).size, values.length, `two examples share a ${field}`);
  }

  // The point of six is range. Two evenings built from the same pair of Genres
  // would be one evening shown twice, whatever they were called.
  const pairs = WORKED_EXAMPLES.map((example) => [...example.genres].sort().join(" + "));
  assert.equal(new Set(pairs).size, pairs.length, "two examples are built from the same genres");
});

test("no film appears in two evenings", () => {
  // A film that fits two of these makes them look like neighbours, and the whole
  // argument is that they are not.
  const films = WORKED_EXAMPLES.flatMap((example) => example.films);
  const seen = new Set<string>();

  for (const film of films) {
    assert.equal(seen.has(film), false, `${film} is recommended in two different examples`);
    seen.add(film);
  }
});

test("a Mix name is evocative, not a restatement of its Genres", () => {
  // The principle these examples exist to demonstrate: if knowing the Genres
  // already tells you the name, the name is doing no work. A name containing one
  // of its own ingredients has failed that before anybody reads the instruction.
  for (const { mix, genres } of WORKED_EXAMPLES) {
    for (const genre of genres) {
      assert.equal(
        mix.toLowerCase().includes(genre.toLowerCase()),
        false,
        `"${mix}" contains its own genre "${genre}", so it is a label rather than a name`,
      );
    }
  }
});

test("every evening is complete enough to render", () => {
  for (const example of WORKED_EXAMPLES) {
    assert.equal(example.films.length, 3, `${example.mix}: three films, so the shape is uniform`);
    assert.ok(example.genres.length >= 2, `${example.mix}: a mix of one genre shows nothing`);
    assert.match(example.prompt, /\S/, `${example.mix}: no prompt`);
    assert.ok(example.mark.length > 0, `${example.mix}: no mark`);

    for (const value of [...example.films, ...example.genres]) {
      assert.equal(value, value.trim(), `${example.mix}: "${value}" has stray whitespace`);
    }
  }
});

test("the prompts are asked the way somebody would ask", () => {
  // Not keywords, and not a description of the feature. The example only works if
  // the request reads like something said out loud.
  for (const { mix, prompt } of WORKED_EXAMPLES) {
    assert.ok(prompt.split(" ").length >= 5, `${mix}: the prompt reads as a query, not a request`);
    assert.match(prompt, /[.!?]$/, `${mix}: the prompt is not a finished sentence`);
  }
});
