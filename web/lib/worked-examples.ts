/**
 * Six evenings, which the landing page lets somebody browse.
 *
 * A single example teaches that Tonight remembers a preference. Six teach the
 * thing that is actually distinctive: a Mix is a reusable name for a *kind of
 * night*, and somebody has several. `Quiet Dread` and `Popcorn Chaos` are not two
 * points on a scale of taste — they are different Fridays, and the same person
 * wants both.
 *
 * So they are chosen to be far apart. Different moods, different decades,
 * different reasons for watching, and no two sharing a Genre pair. Anybody who
 * reloads twice should see two evenings that have nothing to do with each other.
 *
 * Curated by hand and kept as data rather than as markup: adding a seventh should
 * be adding an entry, and every one of them has to survive the same test as a
 * real Mix — see `worked-examples.test.ts`. The order is the order they are
 * browsed in, and it alternates in mood on purpose: nobody moving one step should
 * land somewhere adjacent to where they were.
 */

export type WorkedExample = {
  /**
   * A decorative mark, hidden from screen readers.
   *
   * Six examples in the same typography blur together at a glance; the mark is
   * what makes a reload visibly land somewhere else. It carries no meaning the
   * name does not already carry.
   */
  mark: string;
  /** What the person asked for, in the words they would use. */
  prompt: string;
  /** Three films, named. The recommendation is the point, so it is not summarised. */
  films: readonly string[];
  /** The reusable pieces the evening is made of. Descriptive, on purpose. */
  genres: readonly string[];
  /** The name of the night. Evocative, on purpose. */
  mix: string;
  /**
   * What they say next time, after the comma in "something like <mix>, …".
   *
   * The point of the whole example, and the reason it is written per evening
   * rather than once: a Mix has done its job when the name is the *short* half of
   * the sentence and the interesting half is what comes after it. Six endings
   * that all read "but shorter" would say the opposite — that the name is a
   * template slot.
   *
   * So each one grows out of the three films *that evening actually returned*,
   * not out of the name. That is the harder version and the truer one: anybody
   * can vary a label, and only somebody who watched what came back says "but let
   * them end up together" — the trio there ends apart, every time. Read together
   * they say the other half of what a Mix is. Not a fixed shelf, but an idea you
   * can lean on and then push against, which comes back still recognisably
   * itself.
   *
   * They also vary in shape on purpose. Six sentences that all began "but" would
   * be a template with the slot showing, whatever was in it.
   */
  followUp: string;
};

export const WORKED_EXAMPLES: readonly WorkedExample[] = [
  {
    mark: "🍿",
    prompt: "I want something ridiculously fun tonight.",
    films: ["Bullet Train", "Game Night", "The Fall Guy"],
    genres: ["Action", "Comedy"],
    mix: "Popcorn Chaos",
    // Bullet Train is wall-to-wall assassins and Game Night turns on a real
    // gunshot. Wanting the same evening without the casualties is a joke about
    // the films, which the earlier "nothing that makes me think" was not — that
    // one was a joke about the viewer.
    followUp: "and nobody has to die for it",
  },
  {
    mark: "🕵️",
    prompt: "Give me a clever mystery where nobody tells the truth.",
    films: ["Knives Out", "The Outfit", "Inside Man"],
    genres: ["Mystery", "Clever Thriller"],
    mix: "Everybody's Lying",
    followUp: "where I might actually guess it",
  },
  {
    mark: "🚀",
    prompt: "I want smart sci-fi that keeps me on edge.",
    films: ["Arrival", "Ex Machina", "Moon"],
    genres: ["Sci-Fi", "Thriller"],
    mix: "Space Tension",
    followUp: "but somewhere less lonely",
  },
  {
    mark: "🏡",
    prompt: "Give me a mystery where everyone knows everyone.",
    films: ["Blow the Man Down", "Wind River", "Three Billboards Outside Ebbing, Missouri"],
    genres: ["Mystery", "Character Story"],
    mix: "Small Town Secrets",
    // All three are led by a woman the town is closing ranks against, and all
    // three are about who already knows. Asking for that with the town on her
    // side keeps everyone knowing everyone and flips which way it cuts.
    followUp: "with the town on her side for once",
  },
  {
    mark: "🌧️",
    prompt: "I want something emotional, but not devastating.",
    films: ["Past Lives", "Her", "Lost in Translation"],
    genres: ["Drama", "Romance"],
    mix: "Beautiful Melancholy",
    followUp: "but let them end up together",
  },
  {
    mark: "🌲",
    prompt: "I want something creepy that slowly gets under my skin. Nothing gory.",
    films: ["The Witch", "It Follows", "The Others"],
    genres: ["Slow Burn", "Horror"],
    mix: "Quiet Dread",
    followUp: "but one I can sleep after",
  },
];

