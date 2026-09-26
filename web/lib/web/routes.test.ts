import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * The website's write boundary, driven as a browser drives it.
 *
 * The point of this file is that the four route families actually *compose*:
 *
 *     Origin/CSRF → session → a store bound to that user → the domain's rules
 *
 * Each of those is tested on its own elsewhere — `signin.test.ts` for sessions,
 * `store.test.ts` for the domain — and none of those caught a route handing the
 * store a coerced value, because no test went through a route. So this exercises
 * the seam and only the seam: one representative case per boundary rather than
 * the store's rules restated over HTTP.
 */
process.env.PUBLIC_ORIGIN = "http://localhost:3000";
process.env.OAUTH_SIGNING_SECRET = "test-signing-secret-of-at-least-32-bytes";

const ORIGIN = "http://localhost:3000";

const createGenre = (await import("../../app/api/genres/route.ts")).POST;
const genre = await import("../../app/api/genres/[name]/route.ts");
const createVibe = (await import("../../app/api/vibes/route.ts")).POST;
const vibe = await import("../../app/api/vibes/[name]/route.ts");
const setViewing = (await import("../../app/api/movies/route.ts")).PATCH;
const setJudgement = (await import("../../app/api/verdicts/route.ts")).PATCH;

const { webStore } = await import("./store.ts");
const { SESSION_COOKIE } = await import("./cookies.ts");
const { tasteStore } = await import("../taste/store.ts");
const { verdictStore } = await import("../verdicts/store.ts");
const { filmKey } = await import("../films/identity.ts");
const { orderGenre, orderMovie } = await import("../taste/model.ts");

type Taste = import("../taste/model.ts").Taste;

/** A signed-in browser, made directly: the sign-in flow is tested elsewhere. */
let people = 0;
async function signedIn(): Promise<{ cookie: string; id: string }> {
  const id = `google:web-${++people}`;
  const value = await (await webStore()).createSession({
    user: { id },
    email: `${id.replace(":", "-")}@example.com`,
  });
  return { cookie: `${SESSION_COOKIE}=${value}`, id };
}

/** What that user's model actually is, read through the store rather than a route. */
async function taste(id: string): Promise<Taste> {
  return (await tasteStore({ id })).taste();
}

type Options = { cookie?: string; origin?: string | null };

function request(path: string, method: string, body: unknown, options: Options = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.origin !== null) headers.origin = options.origin ?? ORIGIN;
  if (options.cookie) headers.cookie = options.cookie;

  return new Request(`${ORIGIN}${path}`, { method, headers, body: JSON.stringify(body) });
}

/** A route's answer, as the page reads it. */
async function answer(response: Response) {
  const body = (await response.json()) as { taste?: Taste; error?: string; message?: string };
  return { status: response.status, ...body };
}

/** The dynamic-segment context Next.js hands a route. */
const at = (name: string) => ({ params: Promise.resolve({ name }) });

// --- the boundary ---------------------------------------------------------

test("a write with no session is refused, and writes nothing", async () => {
  const { id, cookie } = await signedIn();

  const anonymous = await answer(
    await createGenre(request("/api/genres", "POST", { name: "Sci-Fi", instruction: "Ideas." })),
  );
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.error, "unauthorized");

  // The same request with the cookie works, so it was the session that was
  // missing rather than the request being malformed.
  const signed = await answer(
    await createGenre(
      request("/api/genres", "POST", { name: "Sci-Fi", instruction: "Ideas." }, { cookie }),
    ),
  );
  assert.equal(signed.status, 200);
  assert.deepEqual((await taste(id)).genres.map((one) => one.name), ["Sci-Fi"]);
});

test("a write that did not come from a page of ours is refused", async () => {
  const { id, cookie } = await signedIn();

  for (const origin of [null, "https://evil.test", "http://localhost:3001"]) {
    const refused = await answer(
      await createGenre(
        request("/api/genres", "POST", { name: "Sci-Fi", instruction: "Ideas." }, { cookie, origin }),
      ),
    );
    assert.equal(refused.status, 403, JSON.stringify(origin));
    assert.equal(refused.error, "forbidden");
  }
  assert.deepEqual((await taste(id)).genres, [], "and nothing was written");
});

// --- the domain, reached through a route ----------------------------------

test("a malformed body is refused by the domain rather than coerced on the way in", async () => {
  const { id, cookie } = await signedIn();
  await createGenre(
    request("/api/genres", "POST", { name: "Sci-Fi", instruction: "Ideas." }, { cookie }),
  );

  // The bug this exists for: a route that turned each of these into a string
  // would store a genre named "42", an instruction reading "[object Object]", or
  // a vibe built from a genre called "123".
  const refusals = [
    ["/api/genres", createGenre, { name: 42, instruction: "Numbers." }, /must be text, not a number/],
    ["/api/genres", createGenre, { name: "Odd", instruction: {} }, /must be text, not an object/],
    ["/api/genres", createGenre, { name: "Odd", instruction: "   " }, /needs an instruction/],
    [
      "/api/vibes",
      createVibe,
      { name: "Bad", instruction: "Mixed.", genres: ["Sci-Fi", 123] },
      /entry 2 is a number/,
    ],
    [
      "/api/vibes",
      createVibe,
      { name: "Bad", instruction: "Mixed.", genres: "Sci-Fi" },
      /must be a list of genre names/,
    ],
  ] as const;

  for (const [path, route, body, expected] of refusals) {
    const refused = await answer(await route(request(path, "POST", body, { cookie })));
    assert.equal(refused.status, 400, JSON.stringify(body));
    assert.equal(refused.error, "refused");
    assert.match(refused.message ?? "", expected);
  }

  const untouched = await taste(id);
  assert.deepEqual(
    { genres: untouched.genres.map(orderGenre), vibes: untouched.vibes, movies: untouched.movies },
    { genres: [{ name: "Sci-Fi", instruction: "Ideas." }], vibes: [], movies: [] },
  );
});

test("a conflict and a missing target come back as the domain's own answers", async () => {
  const { cookie } = await signedIn();
  await createGenre(
    request("/api/genres", "POST", { name: "Sci-Fi", instruction: "Ideas." }, { cookie }),
  );
  await createVibe(
    request(
      "/api/vibes",
      "POST",
      { name: "My Sci-Fi", genres: ["Sci-Fi"], instruction: "Slow." },
      { cookie },
    ),
  );

  const duplicate = await answer(
    await createGenre(
      request("/api/genres", "POST", { name: "sci-fi", instruction: "Again." }, { cookie }),
    ),
  );
  assert.equal(duplicate.status, 400);
  assert.match(duplicate.message ?? "", /already exists/);

  const inUse = await answer(
    await genre.DELETE(request("/api/genres/Sci-Fi", "DELETE", {}, { cookie }), at("Sci-Fi")),
  );
  assert.equal(inUse.status, 400);
  assert.match(inUse.message ?? "", /"My Sci-Fi"/);

  const absent = await answer(
    await vibe.PATCH(
      request("/api/vibes/Nothing", "PATCH", { instruction: "New." }, { cookie }),
      at("Nothing"),
    ),
  );
  assert.equal(absent.status, 400);
  assert.match(absent.message ?? "", /no vibe "Nothing"/);
});

test("a rename answers with the model as it now stands, vibes included", async () => {
  const { cookie } = await signedIn();
  await createGenre(
    request("/api/genres", "POST", { name: "Sci-Fi", instruction: "Ideas." }, { cookie }),
  );
  await createVibe(
    request(
      "/api/vibes",
      "POST",
      { name: "My Sci-Fi", genres: ["Sci-Fi"], instruction: "Slow." },
      { cookie },
    ),
  );

  const renamed = await answer(
    await genre.PATCH(
      request("/api/genres/Sci-Fi", "PATCH", { new_name: "Science fiction" }, { cookie }),
      at("Sci-Fi"),
    ),
  );

  assert.equal(renamed.status, 200);
  assert.deepEqual(renamed.taste?.genres.map((one) => one.name), ["Science fiction"]);
  assert.deepEqual(renamed.taste?.vibes[0]?.genres, ["Science fiction"]);
});

// --- one tenant per session -----------------------------------------------

test("a session cannot change, delete or borrow another account's genres", async () => {
  const alice = await signedIn();
  const bob = await signedIn();

  await createGenre(
    request("/api/genres", "POST", { name: "Alice only", instruction: "Hers." }, { cookie: alice.cookie }),
  );
  await createGenre(
    request("/api/genres", "POST", { name: "Bob only", instruction: "His." }, { cookie: bob.cookie }),
  );

  // Bob's session addresses Alice's genre by name. The store it reaches is bound
  // to Bob, so the row is not his to find.
  for (const [route, method] of [
    [genre.PATCH, "PATCH"],
    [genre.DELETE, "DELETE"],
  ] as const) {
    const refused = await answer(
      await route(
        request(`/api/genres/Alice%20only`, method, { instruction: "Mine now." }, { cookie: bob.cookie }),
        at("Alice only"),
      ),
    );
    assert.equal(refused.status, 400);
    assert.match(refused.message ?? "", /no genre "Alice only"/);
  }

  // Nor can he build a vibe out of it.
  const borrowed = await answer(
    await createVibe(
      request(
        "/api/vibes",
        "POST",
        { name: "Borrowed", genres: ["Alice only"], instruction: "Not mine." },
        { cookie: bob.cookie },
      ),
    ),
  );
  assert.equal(borrowed.status, 400);
  assert.match(borrowed.message ?? "", /"Alice only" is not one of them/);

  assert.deepEqual((await taste(alice.id)).genres.map(orderGenre), [
    { name: "Alice only", instruction: "Hers." },
  ]);
  assert.deepEqual((await taste(bob.id)).vibes, []);
});

// --- a film's two marks ---------------------------------------------------

/** A signed-in user with one film in one vibe, which is what a mark sits on. */
async function withFilm(said: { viewing?: "seen" | "unseen" } = {}) {
  const { cookie, id } = await signedIn();
  await createGenre(
    request("/api/genres", "POST", { name: "Sci-Fi", instruction: "Ideas." }, { cookie }),
  );
  await createVibe(
    request(
      "/api/vibes",
      "POST",
      { name: "Space Tension", genres: ["Sci-Fi"], instruction: "Tense." },
      { cookie },
    ),
  );
  await (await tasteStore({ id })).createMovie({
    title: "Arrival",
    year: 2016,
    vibes: ["Space Tension"],
    ...said,
  });
  return { cookie, id };
}

/** The film as the store holds it, read outside the route that changed it. */
async function film(id: string) {
  const [one] = (await taste(id)).movies;
  // Without the two stamps: these tests are about what a press writes, and a
  // wall-clock value cannot be named in a comparison. Stripped with the domain's
  // own field-order function, so a new field on `Movie` shows up here rather than
  // being quietly dropped. When the stamps were written is asserted in the store's
  // own suite.
  return one && orderMovie(one);
}

const mark = (cookie: string, body: unknown) =>
  setViewing(request("/api/movies", "PATCH", body, { cookie }));

test("a successful press answers the outcome, and does not read the model back", async () => {
  // The genre and vibe routes hand back the whole taste model because the editor
  // reads it as its success signal. Nothing does that here: `Viewing` looks at
  // the status, and at the message only when something went wrong. Returning the
  // model would be nine statements per press thrown away — over a network, per
  // click — so the contract is pinned as *not* carrying one, and the write is
  // confirmed by reading the store rather than by trusting the reply.
  const { cookie, id } = await withFilm();

  const response = await mark(cookie, { title: "Arrival", year: 2016, viewing: "seen" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {}, "the success answer carries a payload");

  assert.equal((await film(id))?.viewing, "seen", "the press did not reach the store");

  // Structural, because the assertion above cannot tell the two failures apart: a
  // route that never reads the model and one that reads it and drops the result
  // both answer `{}`. The second costs nine statements per press over a network,
  // and naming the call is the only thing that keeps it from coming back the next
  // time somebody copies the shape of the genre and vibe routes.
  const route = readFileSync(new URL("../../app/api/movies/route.ts", import.meta.url), "utf8");
  assert.equal(
    /store\s*\.\s*taste\s*\(/.test(route),
    false,
    "the movie PATCH reads the whole taste model back, for a caller that discards it",
  );
});

test("a refusal still carries the reason, which is the part a caller can act on", async () => {
  const { cookie } = await withFilm();

  const refused = await answer(await mark(cookie, { title: "Gone", year: 1999, viewing: "seen" }));
  assert.equal(refused.status, 400);
  assert.equal(refused.error, "refused");
  assert.match(refused.message ?? "", /no movie "Gone" \(1999\)/);
});

test("pressing a choice on a film nobody has said anything about records it", async () => {
  const { cookie, id } = await withFilm();
  assert.equal((await film(id))?.viewing, null, "a saved film starts with nothing said");

  const marked = await answer(await mark(cookie, { title: "Arrival", year: 2016, viewing: "seen" }));
  assert.equal(marked.status, 200);
  assert.equal((await film(id))?.viewing, "seen");

  // And each answer replaces the last: one answer, not a set of flags.
  for (const viewing of ["unseen", "seen"] as const) {
    await mark(cookie, { title: "Arrival", year: 2016, viewing });
    assert.equal((await film(id))?.viewing, viewing);
  }
});

test("a press never returns a film to having been said nothing about", async () => {
  // The page draws two choices; the store keeps a third. `null` is silence and
  // `unseen` is something they said, and pressing anything is a statement — so
  // this route cannot write the silence back, and refuses rather than guess.
  const { cookie, id } = await withFilm({ viewing: "seen" });

  const refused = await answer(await mark(cookie, { title: "Arrival", year: 2016, viewing: null }));
  assert.equal(refused.status, 400);
  assert.equal(refused.error, "refused");
  assert.match(refused.message ?? "", /"viewing" must be one of seen, unseen/);

  assert.equal((await film(id))?.viewing, "seen", "a refused null cleared a stated answer");
});

test("a press changes the viewing and leaves the rest of the film alone", async () => {
  const { cookie, id } = await withFilm({ viewing: "seen" });
  await (await tasteStore({ id })).updateMovie("Arrival", 2016, { imdbId: "tt2543164" });

  await mark(cookie, { title: "Arrival", year: 2016, viewing: "seen" });

  assert.deepEqual(await film(id), {
    title: "Arrival",
    year: 2016,
    imdbId: "tt2543164",
    viewing: "seen",
    vibes: ["Space Tension"],
  });
});

test("the route takes the two marks and nothing else", async () => {
  // Everything a film has other than these two is changed through an assistant.
  // A field this route quietly accepted would be a second way to write it, with
  // no control on the page asking for it and no test watching it.
  const { cookie, id } = await withFilm();

  await mark(cookie, {
    title: "Arrival",
    year: 2016,
    viewing: "seen",
    new_title: "Something else",
    year_: 1999,
    imdb_id: "tt0000001",
    imdbId: "tt0000001",
    vibes: [],
  });

  assert.deepEqual(await film(id), {
    title: "Arrival",
    year: 2016,
    imdbId: null,
    viewing: "seen",
    vibes: ["Space Tension"],
  });
});

test("a mark on a film that is not there is the domain's own refusal", async () => {
  const { cookie, id } = await withFilm();

  const missing = await answer(await mark(cookie, { title: "Dune", year: 1984, viewing: "seen" }));
  assert.equal(missing.status, 400);
  assert.match(missing.message ?? "", /no movie "Dune" \(1984\)/);

  // A handle the domain cannot read is refused in the same words, and the route
  // coerces nothing on the way — the year is judged, not parsed.
  for (const handle of [{ title: "Arrival" }, { title: "Arrival", year: "2016" }, { year: 2016 }]) {
    const refused = await answer(await mark(cookie, { ...handle, viewing: "seen" }));
    assert.equal(refused.status, 400, JSON.stringify(handle));
    assert.equal(refused.error, "refused");
  }

  assert.equal((await film(id))?.viewing, null, "a refused press changed something");
});

test("a value that is not one of the two is refused before the store is asked", async () => {
  const { cookie, id } = await withFilm();

  // The three that used to be states here are refused like anything else: an
  // opinion is a verdict and this route does not take one.
  for (const value of ["yes", "Seen", "liked", "loved", "disliked", true, 1, {}]) {
    const refused = await answer(
      await mark(cookie, { title: "Arrival", year: 2016, viewing: value }),
    );
    assert.equal(refused.status, 400, JSON.stringify(value));
    assert.match(refused.message ?? "", /"viewing" must be one of/);
  }

  assert.equal((await film(id))?.viewing, null, "a refused value reached the store");
});

test("a mark cannot be pressed on somebody else's film", async () => {
  const { id: mine } = await withFilm();
  const { cookie: theirs } = await signedIn();

  // The store the route opens belongs to whoever the cookie names, so this is
  // not a film they are forbidden to change — it is a film they do not have.
  const refused = await answer(await mark(theirs, { title: "Arrival", year: 2016, viewing: "seen" }));
  assert.equal(refused.status, 400);
  assert.match(refused.message ?? "", /no movie "Arrival" \(2016\)/);
  assert.equal((await film(mine))?.viewing, null, "their press reached my film");
});

test("a mark with no session, or from another site, writes nothing", async () => {
  const { cookie, id } = await withFilm();

  const out = await answer(await mark("", { title: "Arrival", year: 2016, viewing: "seen" }));
  assert.equal(out.status, 401);

  const forged = await answer(
    await setViewing(
      request(
        "/api/movies",
        "PATCH",
        { title: "Arrival", year: 2016, viewing: "seen" },
        { cookie, origin: "https://elsewhere.example" },
      ),
    ),
  );
  assert.equal(forged.status, 403);

  assert.equal((await film(id))?.viewing, null, "a refused press reached the store");
});

// --- what they thought of it ------------------------------------------------

/**
 * The other half of the split that took opinions off the Movie.
 *
 * `/api/movies` says whether a film was watched; this says what they made of
 * it, and they are separate routes because they are separate facts. Two things
 * are worth driving through the boundary rather than reading off the source: a
 * repeat press writing nothing, and a judgement leaving the film alone. Both
 * are behaviours of the route rather than of either store, and both are easy to
 * lose in a refactor that looks correct.
 */

const judge = (cookie: string, body: unknown) =>
  setJudgement(request("/api/verdicts", "PATCH", body, { cookie }));

/**
 * What currently stands globally about one film, read through the store.
 *
 * Matched by `filmKey`, because a verdict carries the title as the user spelled
 * it — so a helper comparing raw spellings would fail to find a film the domain
 * considers the same one, which is the very thing some of these tests are about.
 */
async function standing(id: string, film: { title: string; year: number } = { title: "Arrival", year: 2016 }) {
  const all = await (await verdictStore({ id })).standing();
  return all.find((one) => one.occasion === undefined && filmKey(one) === filmKey(film));
}

/** Every act ever written about that user's films, oldest first. */
async function history(id: string, film = { title: "Arrival", year: 2016 }) {
  return (await verdictStore({ id })).history(film);
}

test("pressing a judgement records it as something they volunteered", async () => {
  const { cookie, id } = await withFilm();
  assert.equal(await standing(id), undefined, "a saved film starts with nothing said about it");

  const out = await answer(await judge(cookie, { title: "Arrival", year: 2016, judgement: "loved" }));
  assert.equal(out.status, 200);
  assert.deepEqual(out, { status: 200 }, "the route read the model back");

  const held = await standing(id);
  assert.equal(held?.judgement, "loved");
  // A press is the user saying so unprompted. Tonight asked nothing, and
  // recording it as the weaker provenance would understate what happened.
  assert.equal(held?.told, "volunteered");
  // And no words were invented for why: a press has none in it.
  assert.equal("because" in (held ?? {}), false, "a reason appeared that nobody gave");
  // Global, because a page showing a collection is not an evening.
  assert.equal(held?.occasion, undefined);
});

test("each judgement replaces the last, and the one it replaced is kept", async () => {
  const { cookie, id } = await withFilm();

  for (const judgement of ["liked", "loved", "disliked"] as const) {
    await judge(cookie, { title: "Arrival", year: 2016, judgement });
    assert.equal((await standing(id))?.judgement, judgement);
  }
  assert.equal((await history(id)).length, 3, "changing their mind lost what they used to say");
});

test("pressing the judgement that already stands writes nothing at all", async () => {
  // A "set the current value" control: pressing *Loved* on a film that already
  // stands as loved is the user confirming what they see, not saying something
  // new. An act for it would fill their history with clicks, and `get_memory`
  // would read them back as things they told Tonight.
  const { cookie, id } = await withFilm();
  await judge(cookie, { title: "Arrival", year: 2016, judgement: "loved" });
  const before = await history(id);

  const again = await answer(await judge(cookie, { title: "Arrival", year: 2016, judgement: "loved" }));
  assert.equal(again.status, 200, "a repeat is answered as success, not refused");

  assert.deepEqual(await history(id), before, "a repeated press wrote a second act");
});

test("clearing takes the judgement back, and leaves them having said nothing", async () => {
  const { cookie, id } = await withFilm();
  await judge(cookie, { title: "Arrival", year: 2016, judgement: "loved" });

  const out = await answer(await judge(cookie, { title: "Arrival", year: 2016, judgement: null }));
  assert.equal(out.status, 200);

  // Silence, not a weaker opinion: there is no second evaluative root for one
  // to be left in.
  assert.equal(await standing(id), undefined, "taking it back left something standing");
  const acts = await history(id);
  assert.deepEqual(acts.map((one) => one.said), ["verdict", "withdrawal"], "the taking-back was not recorded");
});

test("clearing when nothing stands writes nothing", async () => {
  // Withdrawing where there is nothing to withdraw would record the user
  // retracting something they never said.
  const { cookie, id } = await withFilm();

  const out = await answer(await judge(cookie, { title: "Arrival", year: 2016, judgement: null }));
  assert.equal(out.status, 200);
  assert.deepEqual(await history(id), [], "a withdrawal was recorded against silence");

  // And the same once a judgement has been taken back already.
  await judge(cookie, { title: "Arrival", year: 2016, judgement: "liked" });
  await judge(cookie, { title: "Arrival", year: 2016, judgement: null });
  const settled = await history(id);
  await judge(cookie, { title: "Arrival", year: 2016, judgement: null });
  assert.deepEqual(await history(id), settled, "a second clearing wrote a second withdrawal");
});

test("a judgement reaches the film however the title is spelled", async () => {
  // A verdict names a film as the user spelled it; matching by raw spelling
  // would make two spellings two positions, and pressing twice would look like
  // two different films rather than one repeat.
  const { cookie, id } = await withFilm();
  await judge(cookie, { title: "Arrival", year: 2016, judgement: "loved" });

  const again = await judge(cookie, { title: "  ARRIVAL  ", year: 2016, judgement: "loved" });
  assert.equal((await answer(again)).status, 200);
  assert.equal((await history(id)).length, 1, "a spelling variant was read as a second film");

  // And a different spelling does change it when the judgement differs.
  await judge(cookie, { title: "arrival", year: 2016, judgement: "disliked" });
  assert.equal((await standing(id))?.judgement, "disliked");
  assert.equal((await history(id)).length, 2);

  // A different year is a different film, and gets its own history.
  await judge(cookie, { title: "Arrival", year: 1996, judgement: "liked" });
  assert.equal((await history(id, { title: "Arrival", year: 1996 })).length, 1);
  assert.equal((await history(id)).length, 2, "another year reached this film's history");
});

test("a judgement never touches the film, and a viewing never touches the verdict", async () => {
  // The whole point of the split. A judgement already means they watched it —
  // that is derived — so writing `viewing` here as well would store a second
  // copy of a fact that could outlive what it came from.
  const { cookie, id } = await withFilm({ viewing: "unseen" });
  const before = await film(id);

  await judge(cookie, { title: "Arrival", year: 2016, judgement: "loved" });
  assert.deepEqual(await film(id), before, "recording a judgement changed the film");

  await judge(cookie, { title: "Arrival", year: 2016, judgement: null });
  assert.deepEqual(await film(id), before, "taking a judgement back changed the film");

  // And the other direction: pressing the viewing mark says nothing about what
  // they thought.
  await judge(cookie, { title: "Arrival", year: 2016, judgement: "loved" });
  await mark(cookie, { title: "Arrival", year: 2016, viewing: "seen" });
  assert.equal((await standing(id))?.judgement, "loved", "a viewing press moved the verdict");
  assert.equal((await film(id))?.viewing, "seen");
});

test("a judgement can be given about a film that was never saved", async () => {
  // A verdict does not need a Movie row: the two stores know nothing about each
  // other, and an opinion about a film nobody filed is an ordinary thing.
  const { cookie, id } = await signedIn();

  const out = await answer(await judge(cookie, { title: "Solaris", year: 1972, judgement: "loved" }));
  assert.equal(out.status, 200);
  assert.equal((await standing(id, { title: "Solaris", year: 1972 }))?.judgement, "loved");
  assert.deepEqual((await taste(id)).movies, [], "judging a film saved it");
});

test("the route takes the three judgements and taking one back, and nothing else", async () => {
  const { cookie, id } = await withFilm();

  for (const wrong of ["yes", "Loved", "seen", "unseen", "not-tonight", "not-ever", true, 1, {}, []]) {
    const refused = await answer(await judge(cookie, { title: "Arrival", year: 2016, judgement: wrong }));
    assert.equal(refused.status, 400, JSON.stringify(wrong));
    assert.equal(refused.error, "refused");
    assert.match(refused.message ?? "", /"judgement" must be one of liked, loved, disliked/);
  }
  // A refusal reaching turning a film down for one evening is worth its own
  // sentence: it is a real operation, and it is not one this page can do.
  assert.match(
    (await answer(await judge(cookie, { title: "Arrival", year: 2016, judgement: "not-tonight" }))).message ?? "",
    /one evening is a rejection rather than a judgement/,
  );

  assert.deepEqual(await history(id), [], "a refused value reached the store");
});

test("a malformed handle is refused in the domain's own words", async () => {
  const { cookie, id } = await withFilm();

  for (const body of [
    { year: 2016, judgement: "loved" },
    { title: "Arrival", judgement: "loved" },
    { title: "   ", year: 2016, judgement: "loved" },
    { title: "Arrival", year: 2016.5, judgement: "loved" },
  ]) {
    const refused = await answer(await judge(cookie, body));
    assert.equal(refused.status, 400, JSON.stringify(body));
  }
  assert.deepEqual(await history(id), []);
});

test("a judgement cannot be pressed without a session, or from another site", async () => {
  const { cookie, id } = await withFilm();

  const out = await answer(await judge("", { title: "Arrival", year: 2016, judgement: "loved" }));
  assert.equal(out.status, 401);

  const forged = await answer(
    await setJudgement(
      request(
        "/api/verdicts",
        "PATCH",
        { title: "Arrival", year: 2016, judgement: "loved" },
        { cookie, origin: "https://elsewhere.example" },
      ),
    ),
  );
  assert.equal(forged.status, 403);

  assert.deepEqual(await history(id), [], "a refused press reached the store");
});

test("one person's judgement is invisible and untouchable to another", async () => {
  const mine = await withFilm();
  const theirs = await signedIn();

  await judge(mine.cookie, { title: "Arrival", year: 2016, judgement: "loved" });

  // The store the route opens belongs to whoever the cookie names, so the other
  // person writing about the same film writes their own act, not over mine.
  await judge(theirs.cookie, { title: "Arrival", year: 2016, judgement: "disliked" });

  assert.equal((await standing(mine.id))?.judgement, "loved", "somebody else's press moved my verdict");
  assert.equal((await standing(theirs.id))?.judgement, "disliked");
  assert.equal((await history(mine.id)).length, 1, "somebody else's act joined my history");
  assert.equal((await history(theirs.id)).length, 1);

  // And clearing theirs leaves mine standing.
  await judge(theirs.cookie, { title: "Arrival", year: 2016, judgement: null });
  assert.equal((await standing(mine.id))?.judgement, "loved");
  assert.equal(await standing(theirs.id), undefined);
});
