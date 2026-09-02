import assert from "node:assert/strict";
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
