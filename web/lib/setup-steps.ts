/**
 * The four steps of connecting Tonight, as data.
 *
 * Two pages tell the same story at two lengths: `/` lists the steps so somebody
 * can see the whole shape standing up, and `/setup` walks through them with what
 * each one should look like and what going wrong looks like. Both read from here,
 * so the two cannot come to disagree about how many steps there are or what order
 * they go in — but each renders it its own way rather than one component growing
 * a flag for how detailed to be.
 *
 * The walkthrough is written for ChatGPT because that is the host we illustrate.
 * The endpoint itself is not: it is passed in, it is the product's edge, and any
 * MCP host can be pointed at it.
 */

/** Something that goes wrong, and what it actually means. */
export type Trouble = {
  /** What the person sees. */
  symptom: string;
  /** What it means, and what to do about it. */
  meaning: string;
};

export type SetupStep = {
  /** The imperative. Numbered by position, so this does not carry a number. */
  title: string;
  /** What to do, in one line: the whole of it on `/`. */
  summary: string;
  /** The same thing at length, one paragraph per entry. */
  detail: readonly string[];
  /** How you know it worked, so nobody has to guess. */
  confirms: string;
  trouble: readonly Trouble[];
  /**
   * What this step hands the reader, when it hands them something.
   *
   * Named rather than carried: the button is a page's business and the text it
   * copies is long, so the data says which of the two this step is about and the
   * page renders the control. Keeps the endpoint and the instructions out of a
   * module whose job is the order of the steps.
   */
  copyable?: "endpoint" | "instructions";
};

/**
 * What somebody has to have before step 1 is worth attempting.
 *
 * Empty, deliberately. Calling a write tool is gated more tightly than calling a
 * read one, and Tonight is writes — so somebody whose account can read but not
 * write completes all four steps, watches Tonight answer, and never gains a
 * single genre. That failure is silent, which is why the requirement belongs
 * above step 1 rather than in the troubleshooting list.
 *
 * What it says has to come from trying it on real accounts. Naming a plan we have
 * only read about second-hand would put a confident, unverified sentence in the
 * first thing anybody reads, and the first person it misled would be the one
 * finding out. So nothing is claimed until Q2 in
 * `docs/work/chatgpt-companion-redesign.md` has been run and written up; the
 * pages render this list, and render nothing when it is empty.
 *
 * TODO(Q2): fill in from the spike's written record — plan, role, workspace
 * setting, platform.
 */
export const PREREQUISITES: readonly string[] = [];

export function setupSteps(endpoint: string): readonly SetupStep[] {
  return [
    {
      title: "Add the MCP connector",
      summary: `Add ${endpoint} to ChatGPT as a custom connector.`,
      detail: [
        `Tonight's address is ${endpoint}. Add it as a custom MCP connector; ChatGPT will ` +
          `read it to see which tools it offers.`,
        "Signing in to Google happens here, inside ChatGPT's own flow rather than on this " +
          "website. Tonight is a closed beta, so the address you sign in with has to be one " +
          "that was invited — that check happens at this step and nowhere later.",
      ],
      confirms: "The connector is listed, and Tonight's tools appear under it.",
      copyable: "endpoint",
      trouble: [
        {
          symptom: "Signing in to Google works, and Tonight then refuses.",
          meaning:
            "That address is not on the beta list. Signing in with a different Google " +
            "account is the fix; nothing about the connector is wrong.",
        },
        {
          symptom: "The tools cannot be read, or authorization is declined.",
          meaning:
            "Nothing has been connected and nothing was written. Removing the connector and " +
            "adding it again is safe.",
        },
      ],
    },
    {
      title: "Create a ChatGPT project",
      summary: "A project is where the instructions live, so Tonight behaves the same each time.",
      detail: [
        "Create a project and give it any name you like. The project is what holds the " +
          "instructions from the next step, which is what makes Tonight behave the same way " +
          "in every conversation instead of only when you explain it again.",
        "While you are setting the project up you will be asked how its memory should work. " +
          "Worth knowing before you choose: the project's memory and your taste model are two " +
          "separate stores. Tonight cannot see what the project remembers, and this website " +
          "cannot show it. Which setting you pick is yours to decide.",
      ],
      confirms: "An empty project, with somewhere to put its instructions.",
      trouble: [],
    },
    {
      title: "Paste the project instructions",
      summary: "Copy them from this page into the project's instructions.",
      detail: [
        "Copy the instructions from this page and paste them into the project's instructions " +
          "field. They are what tells the assistant how to use Tonight: when to look at your " +
          "taste model, what may be written to it, and what may not.",
        "They carry a version on their last line. If this page ever shows a different one, " +
          "replace what is in your project with the current text — the instructions are where " +
          "the rules about what gets saved live, so an old copy is not merely an old copy.",
      ],
      confirms: "The project's instructions end with the same version line this page shows.",
      copyable: "instructions",
      trouble: [
        {
          symptom: "The text will not all fit, or is cut off when saved.",
          meaning:
            "The version line is the last line, so if it is missing from what saved, the rest " +
            "was truncated too. Tell us — the instructions are ours to shorten, not yours.",
        },
      ],
    },
    {
      title: "Turn Tonight on, then ask",
      summary: "Enable Tonight in the project, then ask it what to watch.",
      detail: [
        // TODO(Q2): name the affordance once the spike has seen it. Until then
        // this says what has to be true rather than which control does it, which
        // is correct everywhere and precise nowhere.
        "A connector that is installed is not a connector that is being used. Tonight has to " +
          "be switched on for this project, or named in your message, before the assistant " +
          "will reach for it. This is the step people skip, because nothing in the first " +
          "three suggests there is one more.",
        "Then ask for a film the way you would ask a person: what you are in the mood for, " +
          "and what you are not.",
        "Afterwards, ask what it knows about your taste. That is the cheapest proof Tonight " +
          "is being read at all, and it costs one sentence.",
      ],
      confirms:
        "It answers from your taste model — and on a brand new account, “nothing yet” " +
        "is the right answer and a passing one.",
      trouble: [
        {
          symptom: "It recommends films happily but knows nothing about a taste model.",
          meaning:
            "It is answering from its own knowledge and never called Tonight. Check that " +
            "Tonight is switched on for this project, or name it in the message.",
        },
        {
          symptom: "It talks about your genres but nothing new is ever saved.",
          meaning:
            "Reading works and writing does not, which is the one failure that looks like " +
            "success. Tell us which kind of ChatGPT account this is.",
        },
      ],
    },
  ];
}
