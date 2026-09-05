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
   * So the six change six different things — the humour, the premise, the mood,
   * the setting, the emotional register, whether anything supernatural is allowed
   * — and between them they say the other half of what a Mix is. Not a fixed
   * shelf but an idea you can lean on and then push against: `Quiet Dread`
   * without ghosts is still recognisably `Quiet Dread`, which a genre label could
   * not survive.
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
    followUp: "but with fewer explosions",
  },
  {
    mark: "🕵️",
    prompt: "Give me a clever mystery where nobody tells the truth.",
    films: ["Knives Out", "The Outfit", "Inside Man"],
    genres: ["Mystery", "Clever Thriller"],
    mix: "Everybody's Lying",
    followUp: "without the murder",
  },
  {
    mark: "🚀",
    prompt: "I want smart sci-fi that keeps me on edge.",
    films: ["Arrival", "Ex Machina", "Moon"],
    genres: ["Sci-Fi", "Thriller"],
    mix: "Space Tension",
    followUp: "but more optimistic",
  },
  {
    mark: "🏡",
    prompt: "Give me a mystery where everyone knows everyone.",
    films: ["Blow the Man Down", "Wind River", "Three Billboards Outside Ebbing, Missouri"],
    genres: ["Mystery", "Character Story"],
    mix: "Small Town Secrets",
    followUp: "by the sea",
  },
  {
    mark: "🌧️",
    prompt: "I want something emotional, but not devastating.",
    films: ["Past Lives", "Her", "Lost in Translation"],
    genres: ["Drama", "Romance"],
    mix: "Beautiful Melancholy",
    followUp: "but a little more hopeful",
  },
  {
    mark: "🌲",
    prompt: "I want something creepy that slowly gets under my skin. Nothing gory.",
    films: ["The Witch", "It Follows", "The Others"],
    genres: ["Slow Burn", "Horror"],
    mix: "Quiet Dread",
    followUp: "without ghosts",
  },
];

