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
const createMix = (await import("../../app/api/mixes/route.ts")).POST;
const mix = await import("../../app/api/mixes/[name]/route.ts");
const setMovieState = (await import("../../app/api/movies/route.ts")).PATCH;

const { webStore } = await import("./store.ts");
const { SESSION_COOKIE } = await import("./cookies.ts");
const { tasteStore } = await import("../taste/store.ts");

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
  // a mix built from a genre called "123".
  const refusals = [
    ["/api/genres", createGenre, { name: 42, instruction: "Numbers." }, /must be text, not a number/],
    ["/api/genres", createGenre, { name: "Odd", instruction: {} }, /must be text, not an object/],
    ["/api/genres", createGenre, { name: "Odd", instruction: "   " }, /needs an instruction/],
    [
      "/api/mixes",
      createMix,
      { name: "Bad", instruction: "Mixed.", genres: ["Sci-Fi", 123] },
      /entry 2 is a number/,
    ],
    [
      "/api/mixes",
      createMix,
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

  assert.deepEqual(await taste(id), {
    genres: [{ name: "Sci-Fi", instruction: "Ideas." }],
    mixes: [],
    movies: [],
  });
});

test("a conflict and a missing target come back as the domain's own answers", async () => {
  const { cookie } = await signedIn();
  await createGenre(
    request("/api/genres", "POST", { name: "Sci-Fi", instruction: "Ideas." }, { cookie }),
  );
  await createMix(
    request(
      "/api/mixes",
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
    await mix.PATCH(
      request("/api/mixes/Nothing", "PATCH", { instruction: "New." }, { cookie }),
      at("Nothing"),
    ),
  );
  assert.equal(absent.status, 400);
  assert.match(absent.message ?? "", /no mix "Nothing"/);
});

test("a rename answers with the model as it now stands, mixes included", async () => {
  const { cookie } = await signedIn();
  await createGenre(
    request("/api/genres", "POST", { name: "Sci-Fi", instruction: "Ideas." }, { cookie }),
  );
  await createMix(
    request(
      "/api/mixes",
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
  assert.deepEqual(renamed.taste?.mixes[0]?.genres, ["Science fiction"]);
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

  // Nor can he build a mix out of it.
  const borrowed = await answer(
    await createMix(
      request(
        "/api/mixes",
        "POST",
        { name: "Borrowed", genres: ["Alice only"], instruction: "Not mine." },
        { cookie: bob.cookie },
      ),
    ),
  );
  assert.equal(borrowed.status, 400);
  assert.match(borrowed.message ?? "", /"Alice only" is not one of them/);

  assert.deepEqual((await taste(alice.id)).genres, [{ name: "Alice only", instruction: "Hers." }]);
  assert.deepEqual((await taste(bob.id)).mixes, []);
});

// --- a film's two marks ---------------------------------------------------

/** A signed-in user with one film in one mix, which is what a mark sits on. */
async function withFilm(state: { watched?: unknown; liked?: unknown } = {}) {
  const { cookie, id } = await signedIn();
  await createGenre(
    request("/api/genres", "POST", { name: "Sci-Fi", instruction: "Ideas." }, { cookie }),
  );
  await createMix(
    request(
      "/api/mixes",
      "POST",
      { name: "Space Tension", genres: ["Sci-Fi"], instruction: "Tense." },
      { cookie },
    ),
  );
  await (await tasteStore({ id })).createMovie({
    title: "Arrival",
    year: 2016,
    mixes: ["Space Tension"],
    ...state,
  });
  return { cookie, id };
}

/** The film as the store holds it, read outside the route that changed it. */
async function film(id: string) {
  return (await taste(id)).movies[0];
}

const mark = (cookie: string, body: unknown) =>
  setMovieState(request("/api/movies", "PATCH", body, { cookie }));

test("a successful press answers the outcome, and does not read the model back", async () => {
  // The genre and mix routes hand back the whole taste model because the editor
  // reads it as its success signal. Nothing does that here: `MovieState` looks at
  // the status, and at the message only when something went wrong. Returning the
  // model would be nine statements per press thrown away — over a network, per
  // click — so the contract is pinned as *not* carrying one, and the write is
  // confirmed by reading the store rather than by trusting the reply.
  const { cookie, id } = await withFilm();

  const response = await mark(cookie, { title: "Arrival", year: 2016, watched: true });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {}, "the success answer carries a payload");

  assert.equal((await film(id))?.watched, true, "the press did not reach the store");

  // Structural, because the assertion above cannot tell the two failures apart: a
  // route that never reads the model and one that reads it and drops the result
  // both answer `{}`. The second costs nine statements per press over a network,
  // and naming the call is the only thing that keeps it from coming back the next
  // time somebody copies the shape of the genre and mix routes.
  const route = readFileSync(new URL("../../app/api/movies/route.ts", import.meta.url), "utf8");
  assert.equal(
    /store\s*\.\s*taste\s*\(/.test(route),
    false,
    "the movie PATCH reads the whole taste model back, for a caller that discards it",
  );
});

test("a refusal still carries the reason, which is the part a caller can act on", async () => {
  const { cookie } = await withFilm();

  const refused = await answer(await mark(cookie, { title: "Gone", year: 1999, watched: true }));
  assert.equal(refused.status, 400);
  assert.equal(refused.error, "refused");
  assert.match(refused.message ?? "", /no movie "Gone" \(1999\)/);
});

test("pressing a mark on a film nobody has said anything about states a yes", async () => {
  const { cookie, id } = await withFilm();
  assert.equal((await film(id))?.watched, null, "a saved film starts with nothing said");

  const marked = await answer(await mark(cookie, { title: "Arrival", year: 2016, watched: true }));
  assert.equal(marked.status, 200);
  assert.equal((await film(id))?.watched, true);

  // And the other mark is untouched by it: two fields, two statements.
  assert.equal((await film(id))?.liked, null, "marking one field answered the other");

  assert.equal(
    (await answer(await mark(cookie, { title: "Arrival", year: 2016, liked: true }))).status,
    200,
  );
  assert.equal((await film(id))?.liked, true);
  assert.equal((await film(id))?.watched, true);
});

test("pressing a lit mark states a no, and never returns it to nothing said", async () => {
  // What the page draws is two states; what it writes is one of two answers. The
  // unlit mark covers both `false` and `null`, so pressing it has to mean the
  // same thing from either — and pressing a lit one has to leave a `false` the
  // user can be held to, not a `null` that says they never spoke.
  const { cookie, id } = await withFilm({ watched: true, liked: false });

  await mark(cookie, { title: "Arrival", year: 2016, watched: false });
  assert.equal((await film(id))?.watched, false, "a lit mark pressed should read as a no");

  await mark(cookie, { title: "Arrival", year: 2016, liked: true });
  assert.equal((await film(id))?.liked, true, "an unlit false should light from the same press");

  // Three presses, and not one of them left the film back at "never told".
  for (const state of [{ watched: true }, { watched: false }, { liked: false }]) {
    await mark(cookie, { title: "Arrival", year: 2016, ...state });
  }
  const settled = await film(id);
  assert.equal(settled?.watched, false);
  assert.equal(settled?.liked, false);
});

test("a mark changes one field and leaves the rest of the film alone", async () => {
  const { cookie, id } = await withFilm({ liked: true });
  await (await tasteStore({ id })).updateMovie("Arrival", 2016, { imdbId: "tt2543164" });

  await mark(cookie, { title: "Arrival", year: 2016, watched: true });

  assert.deepEqual(await film(id), {
    title: "Arrival",
    year: 2016,
    imdbId: "tt2543164",
    watched: true,
    liked: true,
    mixes: ["Space Tension"],
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
    watched: true,
    new_title: "Something else",
    year_: 1999,
    imdb_id: "tt0000001",
    imdbId: "tt0000001",
    mixes: [],
  });

  assert.deepEqual(await film(id), {
    title: "Arrival",
    year: 2016,
    imdbId: null,
    watched: true,
    liked: null,
    mixes: ["Space Tension"],
  });
});

test("a mark on a film that is not there is the domain's own refusal", async () => {
  const { cookie, id } = await withFilm();

  const missing = await answer(await mark(cookie, { title: "Dune", year: 1984, watched: true }));
  assert.equal(missing.status, 400);
  assert.match(missing.message ?? "", /no movie "Dune" \(1984\)/);

  // A handle the domain cannot read is refused in the same words, and the route
  // coerces nothing on the way — the year is judged, not parsed.
  for (const handle of [{ title: "Arrival" }, { title: "Arrival", year: "2016" }, { year: 2016 }]) {
    const refused = await answer(await mark(cookie, { ...handle, watched: true }));
    assert.equal(refused.status, 400, JSON.stringify(handle));
    assert.equal(refused.error, "refused");
  }

  assert.equal((await film(id))?.watched, null, "a refused press changed something");
});

test("null is refused for either mark, and the film is left exactly as it was", async () => {
  // The store takes three values and always will; this route takes two. A mark
  // is something the user pressed, so `null` — "Tonight was never told" — is not
  // a thing pressing one can mean, and a caller sending it is a caller this page
  // does not have. Refusing it here keeps the page unable to write the third
  // state at all, without narrowing what the model or an assistant can say.
  const { cookie, id } = await withFilm({ watched: true, liked: false });

  for (const field of ["watched", "liked"] as const) {
    const refused = await answer(
      await mark(cookie, { title: "Arrival", year: 2016, [field]: null }),
    );
    assert.equal(refused.status, 400, field);
    assert.equal(refused.error, "refused", field);
    assert.match(refused.message ?? "", new RegExp(`"${field}" must be true or false here`), field);
  }

  // Both refusals wrote nothing — not the field they named, and not the other.
  const after = await film(id);
  assert.equal(after?.watched, true, "a refused null cleared a stated yes");
  assert.equal(after?.liked, false, "a refused null cleared a stated no");

  // And the two mentioned together are refused as a pair rather than half applied.
  const both = await answer(
    await mark(cookie, { title: "Arrival", year: 2016, watched: false, liked: null }),
  );
  assert.equal(both.status, 400);
  assert.equal((await film(id))?.watched, true, "half of a refused write landed");
});

test("a mark that is not a boolean is refused before the store is asked", async () => {
  const { cookie, id } = await withFilm();

  for (const value of ["yes", 1, {}, []]) {
    const refused = await answer(
      await mark(cookie, { title: "Arrival", year: 2016, watched: value }),
    );
    assert.equal(refused.status, 400, JSON.stringify(value));
    assert.match(refused.message ?? "", /"watched" must be true or false here/);
  }

  assert.equal((await film(id))?.watched, null, "a refused value reached the store");
});

test("a mark cannot be pressed on somebody else's film", async () => {
  const { id: mine } = await withFilm();
  const { cookie: theirs } = await signedIn();

  // The store the route opens belongs to whoever the cookie names, so this is
  // not a film they are forbidden to change — it is a film they do not have.
  const refused = await answer(await mark(theirs, { title: "Arrival", year: 2016, watched: true }));
  assert.equal(refused.status, 400);
  assert.match(refused.message ?? "", /no movie "Arrival" \(2016\)/);
  assert.equal((await film(mine))?.watched, null, "their press reached my film");
});

test("a mark with no session, or from another site, writes nothing", async () => {
  const { cookie, id } = await withFilm();

  const out = await answer(await mark("", { title: "Arrival", year: 2016, watched: true }));
  assert.equal(out.status, 401);

  const forged = await answer(
    await setMovieState(
      request(
        "/api/movies",
        "PATCH",
        { title: "Arrival", year: 2016, watched: true },
        { cookie, origin: "https://elsewhere.example" },
      ),
    ),
  );
  assert.equal(forged.status, 403);

  assert.equal((await film(id))?.watched, null, "a refused press reached the store");
});
