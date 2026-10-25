import assert from "node:assert/strict";
import test from "node:test";

import type { SqlDriver } from "../db/driver.ts";

/**
 * The website's one write, driven as a browser drives it: a form post from a
 * film's screen, through the origin and session checks, into the same stores the
 * MCP tools use — and back to the film's screen.
 *
 * What it may write is narrow on purpose, and every case here is about that: a
 * verdict, a withdrawal or a viewing for a film this user has saved, by the rules
 * the model already has, and nothing for anybody else's film, a film nobody saved,
 * a press from another site or a press without a session.
 */
process.env.PUBLIC_ORIGIN = "http://localhost:3000";
process.env.OAUTH_SIGNING_SECRET = "test-signing-secret-of-at-least-32-bytes";

const ORIGIN = "http://localhost:3000";

/**
 * The one connection every store here shares (`lib/db.ts` keeps it on
 * `globalThis`), with a seam: `between` runs once, after the route has read the
 * film the way a page reads it (`taste()`, the one read taken at REPEATABLE READ)
 * and before the press is decided and written under the film's lock — where an
 * assistant changing or deleting the film at the same moment would land.
 */
const { embeddedDriver } = await import("../db/pglite.ts");
const real = await embeddedDriver();
let between: { run: () => Promise<void>; read: boolean } | undefined;
async function interject(): Promise<void> {
  const now = between;
  if (!now?.read) return;
  between = undefined;
  await now.run();
}
const shared: SqlDriver = {
  ...real,
  async query(sql, params) {
    await interject();
    return (await real.query(sql, params)) as never;
  },
  async transaction(work) {
    await interject();
    return real.transaction((tx) =>
      work({
        query: (text, params) => tx.query(text, params),
        exec: async (text) => {
          if (between && /REPEATABLE READ/u.test(text)) between.read = true;
          return tx.exec(text);
        },
      }),
    );
  },
};
(globalThis as Record<symbol, unknown>)[Symbol.for("tonight.database")] = Promise.resolve(shared);

const { handleChoice } = await import("./choose.ts");
const { webStore } = await import("./store.ts");
const { SESSION_COOKIE } = await import("./cookies.ts");
const { tasteStore } = await import("../taste/store.ts");
const { verdictStore } = await import("../verdicts/store.ts");
const { withdrawVerdict } = await import("../verdicts/model.ts");

/** A signed-in browser, made directly: the sign-in flow is tested elsewhere. */
let people = 0;
async function signedIn(): Promise<{ cookie: string; id: string }> {
  const id = `google:choose-${++people}`;
  const value = await (await webStore()).createSession({
    user: { id },
    email: `${id.replace(":", "-")}@example.com`,
  });
  return { cookie: `${SESSION_COOKIE}=${value}`, id };
}

/**
 * One person's films: Stalker anchors Quiet Dread, Dune is in it, Heat is in no
 * vibe.
 */
async function seeded(id: string): Promise<void> {
  const taste = await tasteStore({ id });
  await taste.createGenre({ name: "Mystery", instruction: "Questions first." });
  await taste.createVibe({
    name: "Quiet Dread",
    instruction: "Dread that arrives on foot.",
    genres: ["Mystery"],
    core: { title: "Stalker", year: 1979 },
  });
  await taste.createMovie({ title: "Dune", year: 2021, viewing: "want-to-see", vibes: ["Quiet Dread"] });
  await taste.createMovie({ title: "Heat", year: 1995, viewing: "seen-before" });
}

type Options = { cookie?: string; origin?: string | null };

function press(fields: Record<string, string>, options: Options = {}): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (options.origin !== null) headers.origin = options.origin ?? ORIGIN;
  if (options.cookie) headers.cookie = options.cookie;
  return handleChoice(
    new Request(`${ORIGIN}/movie/choose`, {
      method: "POST",
      headers,
      body: new URLSearchParams(fields).toString(),
    }),
  );
}

/** Where a film stands now, and what stands about it, read through the stores. */
async function state(id: string, title: string, year: number) {
  const movie = (await (await tasteStore({ id })).taste()).movies.find(
    (one) => one.title === title && one.year === year,
  );
  const stands = (await (await verdictStore({ id })).standing()).find(
    (one) => one.title === title && one.year === year,
  );
  const history = await (await verdictStore({ id })).history({ title, year });
  return {
    viewing: movie?.viewing,
    updatedAt: movie?.updatedAt,
    judgement: stands?.judgement ?? null,
    because: stands?.because,
    acts: history.length,
    history,
  };
}

/** Where the browser is sent, read as the page will read it. */
function location(response: Response): URL {
  const to = response.headers.get("location");
  assert.ok(to, "no redirect");
  return new URL(to, ORIGIN);
}

test("without a session nothing is written, and the browser is sent home", async () => {
  const { id } = await signedIn();
  await seeded(id);

  const response = await press({ title: "Dune", year: "2021", choice: "love" });
  assert.equal(response.status, 303);
  assert.equal(location(response).pathname, "/");
  assert.equal((await state(id, "Dune", 2021)).acts, 0);
});

test("a press that did not come from a page of ours writes nothing", async () => {
  const { cookie, id } = await signedIn();
  await seeded(id);

  for (const origin of ["https://evil.example", null]) {
    const response = await press({ title: "Dune", year: "2021", choice: "love" }, { cookie, origin });
    assert.equal(response.status, 403, `origin ${origin} was let through`);
  }
  const after = await state(id, "Dune", 2021);
  assert.equal(after.acts, 0);
  assert.equal(after.viewing, "want-to-see");
});

test("Love it says loved, confirmed and with no words, and marks the film seen now with it", async () => {
  const { cookie, id } = await signedIn();
  await seeded(id);

  const response = await press(
    { title: "Dune", year: "2021", choice: "love", from: "Quiet Dread" },
    { cookie },
  );
  assert.equal(response.status, 303);
  const back = location(response);
  assert.equal(back.pathname, "/movie");
  assert.equal(back.searchParams.get("title"), "Dune");
  assert.equal(back.searchParams.get("year"), "2021");
  assert.equal(back.searchParams.get("from"), "Quiet Dread");
  assert.equal(back.searchParams.has("refused"), false);

  const after = await state(id, "Dune", 2021);
  assert.equal(after.judgement, "loved");
  assert.equal(after.because, undefined, "a press wrote words nobody said");
  // An opinion says they watched it: off the list, seen now by default.
  assert.equal(after.viewing, "seen-now", "an opinion left the film on the list");
  const act = after.history[0];
  assert.equal(act?.said, "verdict");
  // An answer to the question the page puts — *What do you think?* — not
  // something said unasked.
  assert.equal(act?.said === "verdict" ? act.told : null, "confirmed");
});

test("pressing the opinion that stands takes it back; another replaces it", async () => {
  const { cookie, id } = await signedIn();
  await seeded(id);

  await press({ title: "Dune", year: "2021", choice: "love" }, { cookie });
  await press({ title: "Dune", year: "2021", choice: "like" }, { cookie });
  assert.equal((await state(id, "Dune", 2021)).judgement, "liked");

  await press({ title: "Dune", year: "2021", choice: "like" }, { cookie });
  const after = await state(id, "Dune", 2021);
  assert.equal(after.judgement, null, "pressing it again did not take it back");
  // Kept as history: said, replaced, taken back — nothing erased.
  assert.deepEqual(after.history.map((one) => one.said), ["verdict", "verdict", "withdrawal"]);
  // Taking the opinion back does not unsay that they watched it.
  assert.equal(after.viewing, "seen-now");
});

test("Love it and Like it are refused for a film in no vibe; Dislike is kept", async () => {
  const { cookie, id } = await signedIn();
  await seeded(id);

  await (await tasteStore({ id })).updateMovie("Heat", 1995, { viewing: "want-to-see" });
  for (const choice of ["love", "like"]) {
    const response = await press({ title: "Heat", year: "1995", choice }, { cookie });
    assert.equal(location(response).searchParams.get("refused"), "vibe-required");
  }
  const refused = await state(id, "Heat", 1995);
  assert.equal(refused.acts, 0, "a refused press wrote a verdict");
  assert.equal(refused.viewing, "want-to-see", "a refused press wrote the viewing");

  const response = await press({ title: "Heat", year: "1995", choice: "dislike" }, { cookie });
  assert.equal(location(response).searchParams.has("refused"), false);
  const after = await state(id, "Heat", 1995);
  assert.equal(after.judgement, "disliked");
  assert.equal(after.viewing, "seen-now");
});

test("an opinion on a film already seen keeps when they saw it", async () => {
  const { cookie, id } = await signedIn();
  await seeded(id);

  // Heat is saved as seen before.
  await press({ title: "Heat", year: "1995", choice: "dislike" }, { cookie });
  const after = await state(id, "Heat", 1995);
  assert.equal(after.judgement, "disliked");
  assert.equal(after.viewing, "seen-before", "an opinion made an old watch recent");
});

test("Want to see and Not interested set the viewing, take back the opinion, and a repeat writes nothing", async () => {
  const { cookie, id } = await signedIn();
  await seeded(id);

  await press({ title: "Dune", year: "2021", choice: "not-interested" }, { cookie });
  const refused = await state(id, "Dune", 2021);
  assert.equal(refused.viewing, "dont-want-to-see");
  assert.equal(refused.acts, 0, "a listing with nothing to take back wrote an act");

  await press({ title: "Dune", year: "2021", choice: "not-interested" }, { cookie });
  assert.equal((await state(id, "Dune", 2021)).updatedAt, refused.updatedAt, "a repeat press wrote the film");

  // An opinion, then Want to see: the film is listed and the opinion taken back.
  await press({ title: "Dune", year: "2021", choice: "love" }, { cookie });
  await press({ title: "Dune", year: "2021", choice: "want" }, { cookie });
  const listed = await state(id, "Dune", 2021);
  assert.equal(listed.viewing, "want-to-see");
  assert.equal(listed.judgement, null, "Want to see left the opinion standing");
  assert.deepEqual(listed.history.map((one) => one.said), ["verdict", "withdrawal"]);

  // Back to an opinion: seen now again, by default.
  await press({ title: "Dune", year: "2021", choice: "like" }, { cookie });
  const again = await state(id, "Dune", 2021);
  assert.deepEqual([again.judgement, again.viewing], ["liked", "seen-now"]);
});

test("Seen now and Seen before set the viewing, and keep the opinion", async () => {
  const { cookie, id } = await signedIn();
  await seeded(id);
  await press({ title: "Dune", year: "2021", choice: "like" }, { cookie });

  for (const [choice, viewing] of [
    ["seen-before", "seen-before"],
    ["seen-now", "seen-now"],
    ["seen-before", "seen-before"],
  ]) {
    const response = await press({ title: "Dune", year: "2021", choice }, { cookie });
    assert.equal(location(response).searchParams.has("refused"), false, `${choice} was refused`);
    const now = await state(id, "Dune", 2021);
    assert.equal(now.viewing, viewing);
    assert.equal(now.judgement, "liked", "when they saw it changed the opinion");
    assert.equal(now.acts, 1, "a viewing wrote a verdict");
  }

  // Pressing the one it has writes nothing.
  const before = await state(id, "Dune", 2021);
  await press({ title: "Dune", year: "2021", choice: "seen-before" }, { cookie });
  assert.equal((await state(id, "Dune", 2021)).updatedAt, before.updatedAt, "a repeat press wrote the film");
});

test("a vibe's core stays seen — and moves between now and before, its opinion kept", async () => {
  const { cookie, id } = await signedIn();
  await seeded(id);
  await press({ title: "Stalker", year: "1979", choice: "love" }, { cookie });

  for (const choice of ["want", "not-interested"]) {
    const response = await press({ title: "Stalker", year: "1979", choice }, { cookie });
    assert.equal(location(response).searchParams.get("refused"), "core");
  }
  // Refused whole: still loved, and still seen as the vibe saved it.
  const kept = await state(id, "Stalker", 1979);
  assert.deepEqual([kept.judgement, kept.viewing], ["loved", "seen-before"]);

  for (const choice of ["seen-now", "seen-before"]) {
    const response = await press({ title: "Stalker", year: "1979", choice }, { cookie });
    assert.equal(location(response).searchParams.has("refused"), false, `${choice} was refused for a core`);
    assert.equal((await state(id, "Stalker", 1979)).viewing, choice);
  }
  assert.equal((await state(id, "Stalker", 1979)).judgement, "loved");
});

test("only a film this user saved can be chosen for, and never somebody else's", async () => {
  const owner = await signedIn();
  await seeded(owner.id);
  const stranger = await signedIn();

  // The stranger has no Dune; the owner's is untouched.
  const response = await press({ title: "Dune", year: "2021", choice: "dislike" }, { cookie: stranger.cookie });
  assert.equal(response.status, 303);
  assert.equal(location(response).pathname, "/movie", "not sent to the film's page, which says it is not here");
  assert.equal((await state(owner.id, "Dune", 2021)).acts, 0);
  assert.equal((await state(stranger.id, "Dune", 2021)).acts, 0);
});

test("a film is found by the identity the store keeps, and written under its own name", async () => {
  const { cookie, id } = await signedIn();
  await seeded(id);

  const response = await press({ title: "  dune ", year: "2021", choice: "dislike" }, { cookie });
  assert.equal(location(response).searchParams.get("title"), "Dune");
  assert.equal((await state(id, "Dune", 2021)).judgement, "disliked");
});

test("a film deleted between the page's read and its write: nothing said about it outlives it", async () => {
  // Every kind of write a press makes, each with the film deleted (as through
  // an assistant) after the route found it saved and before it wrote.
  for (const [choice, title, year, first] of [
    ["love", "Dune", 2021, null],
    ["dislike", "Heat", 1995, null],
    ["dislike", "Heat", 1995, "dislike"], // pressed again: a take-back
    ["not-interested", "Heat", 1995, null],
  ] as const) {
    const { cookie, id } = await signedIn();
    await seeded(id);
    if (first) await press({ title, year: String(year), choice: first }, { cookie });
    await verdictStore({ id });

    between = {
      read: false,
      run: async () => {
        await (await tasteStore({ id })).deleteMovie(title, year);
      },
    };
    const label = first ? `${choice} again` : choice;
    const response = await press({ title, year: String(year), choice }, { cookie });
    assert.equal(between, undefined, `${label}: the deletion never ran between the read and the write`);

    assert.equal(response.status, 303);
    assert.ok(location(response).searchParams.has("refused"), `${label}: answered as if it was kept`);
    const after = await state(id, title, year);
    assert.equal(after.viewing, undefined, `${label}: the film came back`);
    assert.equal(after.acts, 0, `${label}: something said about the deleted film outlived it`);
  }
});

test("a press is decided on the film as it is when written, not as the route read it", async () => {
  // Each change lands after the route read the film and before the press is
  // decided under the film's lock. Decided on the read, each would go wrong.
  const { cookie, id } = await signedIn();
  await seeded(id);
  const taste = await tasteStore({ id });
  const changed = async (run: () => Promise<void>, fields: Record<string, string>) => {
    between = { read: false, run };
    const response = await press(fields, { cookie });
    assert.equal(between, undefined, "the change never ran between the read and the write");
    return location(response);
  };

  // Seen before by then: Like it keeps it, rather than the read's want-to-see → seen-now.
  await changed(() => taste.updateMovie("Dune", 2021, { viewing: "seen-before" }).then(() => undefined), {
    title: "Dune",
    year: "2021",
    choice: "like",
  });
  let after = await state(id, "Dune", 2021);
  assert.deepEqual([after.judgement, after.viewing], ["liked", "seen-before"]);

  // The like taken back by then: pressing Like it says liked again, rather than
  // the read's take-back — and no withdrawal of nothing is written.
  await changed(
    () => taste.choose({ title: "Dune", year: 2021 }, () => ({ withdraw: true })),
    { title: "Dune", year: "2021", choice: "like" },
  );
  after = await state(id, "Dune", 2021);
  assert.equal(after.judgement, "liked");
  assert.deepEqual(after.history.map((one) => one.said), ["verdict", "withdrawal", "verdict"]);

  // Taken back again by then: Want to see lists the film and writes no withdrawal.
  await changed(
    () => taste.choose({ title: "Dune", year: 2021 }, () => ({ withdraw: true })),
    { title: "Dune", year: "2021", choice: "want" },
  );
  after = await state(id, "Dune", 2021);
  assert.deepEqual([after.judgement, after.viewing], [null, "want-to-see"]);
  assert.deepEqual(after.history.map((one) => one.said), ["verdict", "withdrawal", "verdict", "withdrawal"]);
});

test("a press dated before what was already said about the film is refused, and changes nothing", async () => {
  const { cookie, id } = await signedIn();
  await seeded(id);
  await press({ title: "Dune", year: "2021", choice: "like" }, { cookie });
  // Said, as far as the table knows, an hour from now — later than any press.
  await (await verdictStore({ id })).say(
    withdrawVerdict({ title: "Dune", year: 2021 }, new Date(Date.now() + 60 * 60_000).toISOString()),
  );
  const before = await state(id, "Dune", 2021);

  const response = await press({ title: "Dune", year: "2021", choice: "love" }, { cookie });
  assert.equal(location(response).searchParams.get("refused"), "failed");
  const after = await state(id, "Dune", 2021);
  assert.deepEqual([after.judgement, after.viewing, after.acts], [before.judgement, before.viewing, before.acts]);
});

test("a vibe the film is not in is dropped from the way back", async () => {
  const { cookie, id } = await signedIn();
  await seeded(id);

  const response = await press({ title: "Dune", year: "2021", choice: "want", from: "Popcorn Chaos" }, { cookie });
  assert.equal(location(response).searchParams.has("from"), false);
});

test("anything but one of the seven, for a well-formed film, is refused and writes nothing", async () => {
  const { cookie, id } = await signedIn();
  await seeded(id);

  const malformed: Record<string, string>[] = [
    { title: "Dune", year: "2021", choice: "seen" },
    { title: "Dune", year: "2021", choice: "loved" },
    { title: "Dune", year: "2021" },
    { title: "Dune", year: "21", choice: "love" },
    { title: "Dune", year: "abcd", choice: "love" },
    { year: "2021", choice: "love" },
    { title: "", year: "2021", choice: "love" },
  ];
  for (const fields of malformed) {
    const response = await press(fields, { cookie });
    assert.equal(response.status, 400, `${JSON.stringify(fields)} was accepted`);
  }

  const notAForm = await handleChoice(
    new Request(`${ORIGIN}/movie/choose`, {
      method: "POST",
      headers: { origin: ORIGIN, cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "Dune", year: 2021, choice: "love" }),
    }),
  );
  assert.equal(notAForm.status, 400);

  const after = await state(id, "Dune", 2021);
  assert.equal(after.acts, 0);
  assert.equal(after.viewing, "want-to-see");
});
