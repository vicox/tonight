/**
 * How a film is named, once, for everything that has to decide whether two
 * mentions are the same film.
 *
 * ## Why this is its own module, and neutral
 *
 * Three parts of Tonight have to agree about film identity and none of them may
 * own the answer. The taste model holds a Movie the user filed. The verdict
 * model holds what they said about a film, and reaches nothing else by design —
 * that isolation is what keeps a verdict from becoming a way to edit a taste
 * model. The memory view joins the two. If any of them defined the rule, one of
 * the others would have to import it and the boundary that matters would go.
 *
 * So the rule lives here, depends on nothing, and all three import it.
 *
 * ## Why the database must store this rather than fold titles itself
 *
 * The taste store used to let Postgres decide, on a unique index over
 * `lower(title)`, and that was a considered choice: comparing in JavaScript had
 * once refused a genre that plainly existed, because `İ` and `i` fold together
 * in Postgres and apart in JavaScript.
 *
 * The choice stops working the moment a second store has to agree with the
 * first. Verdicts are resolved in memory — which verdict stands is the verdict
 * model's rule and cannot be a query — so *something* in JavaScript has to
 * decide which acts are one film's. Two deciders means two answers, and both
 * directions are real:
 *
 * - Postgres folds `İ` and `i` together where JavaScript keeps them apart, so
 *   Taste holds one Movie while the verdict history resolves two current
 *   claims — two governors for one film, with no rule to choose.
 * - JavaScript folds `Ⱟ` and `ⱟ` together where Postgres keeps them apart, so
 *   Taste holds two Movies while the verdict history merges them and supersedes
 *   one thing the user said with another about a different film.
 *
 * Neither is fixable by making JavaScript imitate a collation: a collation is a
 * property of the database's configuration, not of the domain. So the direction
 * is reversed. This module produces the canonical form, the database **stores**
 * it and indexes it, and nothing anywhere folds a title on its own. There is one
 * algorithm and it runs in one place.
 *
 * ## What this is not
 *
 * Not matching, not search, not deduplication of a catalogue. *Amélie* and
 * *Amelie* are two films here, because nothing below removes an accent. The
 * goal is one deterministic technical identity, not linguistic judgement.
 */

/** Two films are the same film when these two are equal. */
export type FilmIdentity = {
  /** The title as this module canonicalises it. Never shown to anyone. */
  canonicalTitle: string;
  year: number;
};

/**
 * The canonical form of a title, in three steps and no others.
 *
 * 1. **Whitespace.** Every run of Unicode whitespace becomes one space, and the
 *    ends are trimmed. `" Black   Bag "` and `"Black Bag"` are one title. The
 *    taste model already normalises this way on write, so this agrees with what
 *    is stored rather than introducing a new opinion.
 *
 * 2. **Case.** `toLowerCase`, which ECMA-262 defines by the Unicode Default
 *    Case Conversion and explicitly *not* by locale — `toLocaleLowerCase` is the
 *    one that varies, and it is not used here. The result is the same in every
 *    runtime and on every machine.
 *
 * 3. **Composition.** NFC, after the fold rather than before: lowercasing can
 *    leave a string decomposed, so normalising last is what makes the output
 *    stable. NFC and not NFKC — compatibility folding would make `ﬁlm` and
 *    `film` one film, and turning a ligature into two letters is a judgement
 *    about spelling that nobody asked for.
 *
 * The order matters and is fixed. Running these in another order produces a
 * different answer for some inputs, which is exactly the kind of drift this
 * module exists to remove.
 */
export function canonicalTitle(title: string): string {
  return title.split(/\s+/u).filter(Boolean).join(" ").toLowerCase().normalize("NFC");
}

/** The identity of a film, from however it was named. */
export function filmIdentity(film: { title: string; year: number }): FilmIdentity {
  return { canonicalTitle: canonicalTitle(film.title), year: film.year };
}

/**
 * One string that is equal exactly when two films are the same film.
 *
 * For grouping and comparison in memory. U+0000 separates the halves because it
 * cannot survive into a canonical title — every whitespace run has become a
 * single space and U+0000 is not whitespace, but neither is it something any
 * title-checking path in this repository admits — so `("ab", 12)` and
 * `("ab1", 2)` cannot produce one key.
 *
 * The year is always part of it. Two films can share a title and be decades
 * apart, and merging them would be an invention.
 */
export function filmKey(film: { title: string; year: number }): string {
  return `${canonicalTitle(film.title)}\u0000${String(film.year)}`;
}
