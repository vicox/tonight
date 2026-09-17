import assert from "node:assert/strict";
import test from "node:test";

/**
 * The taste-model tools, driven through the endpoint the way a client drives
 * them: an HTTP request carrying a bearer token, and nothing else.
 *
 * The store's own tests cover the domain rules. What this file is for is the seam
 * — that the user a tool acts for comes from the token and from nowhere else, and
 * that a refusal reaches a client as something it can read and correct. Every
 * assertion here is reachable only by minting a real access token, so "Alice
 * cannot see Bob's genres" is tested against the same path a hostile client would
 * use rather than against a function call with a different argument.
 */
process.env.PUBLIC_ORIGIN = "http://localhost:3000";
process.env.OAUTH_SIGNING_SECRET = "test-signing-secret-of-at-least-32-bytes";

const { handleMcpRequest } = await import("./endpoint.ts");
const { deployment, signingKey } = await import("../oauth/config.ts");
const { mintAccessToken } = await import("../oauth/tokens.ts");

const ENDPOINT = "http://localhost:3000/mcp";
const PROTOCOL_VERSION = "2026-07-28";

async function tokenFor(user: string): Promise<string> {
  const { token } = await mintAccessToken(
    deployment(),
    signingKey(),
    { id: user },
    "client-1",
    "mcp",
    deployment().resource,
  );
  return token;
}

/**
 * A tool's answer, as a client reads it.
 *
 * `structuredContent` is left loosely typed on purpose: eight tools return several
 * shapes, and pinning each one here would restate the schemas rather than test
 * them. The assertions below name the fields they care about.
 */
type ToolResult = {
  structuredContent?: Record<string, unknown>;
  content?: { type: string; text: string }[];
  isError?: boolean;
};

/** Calls one tool and returns its result, whether it succeeded or was refused. */
async function callTool(token: string, name: string, args: Record<string, unknown> = {}) {
  const response = await handleMcpRequest(
    new Request(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": PROTOCOL_VERSION,
        "mcp-method": "tools/call",
        "mcp-name": name,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name,
          arguments: args,
          _meta: {
            "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
            "io.modelcontextprotocol/clientInfo": { name: "test-client", version: "1.0.0" },
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      }),
    }),
  );

  const body = (await response.json()) as { result?: ToolResult; error?: unknown };
  return { status: response.status, result: body.result, error: body.error };
}

/** The tool's answer, insisting it was not a refusal. */
async function ok(token: string, name: string, args: Record<string, unknown> = {}) {
  const { status, result } = await callTool(token, name, args);
  assert.equal(status, 200, name);
  assert.notEqual(result?.isError, true, `${name}: ${result?.content?.[0]?.text}`);
  assert.ok(result?.structuredContent, `${name} returned no structured content`);
  // Read as `any` at the boundary rather than in the type, so each assertion can
  // name the field it means without a cast of its own.
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return result.structuredContent as any;
}

/** The shape Tonight states an instant in: fixed-width UTC, to the microsecond. */
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/**
 * One object out of a read, with the two stamps taken off — and checked on the way.
 *
 * `get_taste` answers with the record: the object, plus when Tonight wrote it. A
 * create or an update answers with the object alone, which is the caller's own
 * words back. Comparing the two therefore means naming the fields the read adds,
 * rather than dropping whatever happens to be extra — so a third field appearing
 * in a read would fail these comparisons instead of being swallowed by them.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function content(one: any) {
  assert.match(one.createdAt, STAMP, "createdAt");
  assert.match(one.updatedAt, STAMP, "updatedAt");
  const rest = { ...one };
  delete rest.createdAt;
  delete rest.updatedAt;
  return rest;
}

/** The reason a tool refused. */
async function refused(token: string, name: string, args: Record<string, unknown> = {}) {
  const { status, result } = await callTool(token, name, args);
  assert.equal(status, 200, "a refused tool still answers");
  assert.equal(result?.isError, true, `${name} was expected to refuse`);
  return result?.content?.[0]?.text ?? "";
}

/** Every tool the endpoint offers, as a client discovering the server sees them. */
async function listTools(token: string) {
  const response = await handleMcpRequest(
    new Request(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": PROTOCOL_VERSION,
        "mcp-method": "tools/list",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
            "io.modelcontextprotocol/clientInfo": { name: "test-client", version: "1.0.0" },
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      }),
    }),
  );

  const body = (await response.json()) as {
    result?: {
      tools?: {
        name: string;
        description: string;
        inputSchema: { required?: string[]; properties?: Record<string, unknown> };
      }[];
    };
  };
  return body.result?.tools ?? [];
}

/**
 * A user nobody else in this file uses.
 *
 * The endpoint shares one database across the whole file, so tests would
 * otherwise see each other's genres. A distinct user per test is also closer to
 * the truth: this is a multi-tenant store, and every test being its own tenant is
 * the arrangement that catches a leak.
 */
let users = 0;
const someone = () => `google:user-${++users}`;

// --- the taste model ------------------------------------------------------

test("a new user has an empty taste model, and gets one rather than an error", async () => {
  const token = await tokenFor(someone());

  assert.deepEqual(await ok(token, "get_taste"), { genres: [], mixes: [], movies: [] });
});

test("a genre can be created and read back", async () => {
  const token = await tokenFor(someone());

  const created = await ok(token, "create_genre", {
    name: "Thriller",
    instruction: "Tension, not brutality.",
  });
  assert.deepEqual(created.genre, { name: "Thriller", instruction: "Tension, not brutality." });

  const taste = await ok(token, "get_taste");
  assert.deepEqual(taste.genres.map(content), [created.genre]);
});

test("a genre without an instruction is refused, even for a familiar name", async () => {
  const token = await tokenFor(someone());

  // No tool supplies wording on a caller's behalf, for `Action` any more than for
  // anything else. The agent writes the instruction from what the user said and
  // sends it like any other field.
  //
  // Omitting the field is refused by the schema, which is what tells a client the
  // field is required; sending an empty one gets the product's own sentence.
  assert.match(await refused(token, "create_genre", { name: "Action" }), /instruction/);
  assert.match(
    await refused(token, "create_genre", { name: "Action", instruction: "  " }),
    /needs an instruction/,
  );
  assert.deepEqual(await ok(token, "get_taste"), { genres: [], mixes: [], movies: [] });
});

test("a mix names the genres it is built from, and comes back with them", async () => {
  const token = await tokenFor(someone());
  await ok(token, "create_genre", { name: "Sci-Fi", instruction: "Ideas over spectacle." });
  await ok(token, "create_genre", { name: "Thriller", instruction: "Tension, not brutality." });

  const created = await ok(token, "create_mix", {
    name: "Space Tension",
    genres: ["Sci-Fi", "Thriller"],
    instruction: "Contained, mysterious science fiction.",
  });
  assert.deepEqual(created.mix.genres, ["Sci-Fi", "Thriller"]);

  const taste = await ok(token, "get_taste");
  assert.deepEqual(taste.mixes.map(content), [created.mix]);
});

test("renaming a genre carries its mixes, in one call", async () => {
  const token = await tokenFor(someone());
  await ok(token, "create_genre", { name: "Sci-Fi", instruction: "Ideas over spectacle." });
  await ok(token, "create_mix", {
    name: "My Sci-Fi",
    genres: ["Sci-Fi"],
    instruction: "Slow and strange.",
  });

  await ok(token, "update_genre", { name: "Sci-Fi", new_name: "Science fiction" });

  const taste = await ok(token, "get_taste");
  assert.deepEqual(taste.genres.map((one: { name: string }) => one.name), ["Science fiction"]);
  assert.deepEqual(taste.mixes[0].genres, ["Science fiction"]);
});

// --- refusals a client can act on -----------------------------------------

test("a refusal is a tool error carrying the reason, not a protocol failure", async () => {
  const token = await tokenFor(someone());
  await ok(token, "create_genre", { name: "Sci-Fi", instruction: "Ideas over spectacle." });

  // The call reached the tool and the tool answered. A client — and the model
  // reading its output — gets something it can correct for.
  assert.match(
    await refused(token, "create_genre", { name: "sci-fi", instruction: "Again." }),
    /already exists/,
  );
});

test("deleting a genre a mix needs is refused, and names the mix", async () => {
  const token = await tokenFor(someone());
  await ok(token, "create_genre", { name: "Sci-Fi", instruction: "Ideas over spectacle." });
  await ok(token, "create_mix", {
    name: "My Sci-Fi",
    genres: ["Sci-Fi"],
    instruction: "Slow and strange.",
  });

  const message = await refused(token, "delete_genre", { name: "Sci-Fi" });
  assert.match(message, /"My Sci-Fi"/);

  await ok(token, "delete_mix", { name: "My Sci-Fi" });
  await ok(token, "delete_genre", { name: "Sci-Fi" });
  assert.deepEqual(await ok(token, "get_taste"), { genres: [], mixes: [], movies: [] });
});

// --- whose taste ----------------------------------------------------------

test("the user a tool acts for comes from the token", async () => {
  const alice = await tokenFor(someone());
  const bob = await tokenFor(someone());

  await ok(alice, "create_genre", { name: "Alice only", instruction: "Hers." });

  assert.deepEqual(await ok(bob, "get_taste"), { genres: [], mixes: [], movies: [] });
  assert.match(await refused(bob, "delete_genre", { name: "Alice only" }), /no genre "Alice only"/);
  assert.deepEqual(
    (await ok(alice, "get_taste")).genres.map((one: { name: string }) => one.name),
    ["Alice only"],
    "and Bob's attempt changed nothing of Alice's",
  );
});

test("two users may hold the same genre name without meaning the same thing", async () => {
  const alice = await tokenFor(someone());
  const bob = await tokenFor(someone());

  await ok(alice, "create_genre", { name: "Action", instruction: "Big, silly set pieces." });
  await ok(bob, "create_genre", { name: "Action", instruction: "Bleak, close-quarters violence." });

  assert.equal((await ok(alice, "get_taste")).genres[0].instruction, "Big, silly set pieces.");
  assert.equal(
    (await ok(bob, "get_taste")).genres[0].instruction,
    "Bleak, close-quarters violence.",
  );
});

// --- movies ---------------------------------------------------------------

test("the endpoint offers fifteen tools, and a movie is addressed by title and year", async () => {
  const tools = await listTools(await tokenFor(someone()));

  // The eleven taste tools, in registration order, then M1's four episode tools.
  // Episodes write what happened; the taste tools write what somebody likes.
  // Neither set reaches the other, which is why the lists are read as two.
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      "get_server_info",
      "get_taste",
      "create_genre",
      "update_genre",
      "delete_genre",
      "create_mix",
      "update_mix",
      "delete_mix",
      "create_movie",
      "update_movie",
      "delete_movie",
      "record_episode",
      "get_episodes",
      "correct_episode",
      "forget_episode",
    ],
  );

  // Three tools rather than one per field, and every one of them addressed by
  // the whole handle. Never by uuid — there is none to pass — and never by title
  // alone, which would name two films.
  for (const name of ["create_movie", "update_movie", "delete_movie"]) {
    assert.deepEqual(
      tools.find((tool) => tool.name === name)?.inputSchema.required,
      ["title", "year"],
      name,
    );
  }
});

test("the write tools say where persistence begins, because a host may read nothing else", async () => {
  // A client can discover these tools and call them without ever loading the
  // Tonight skill, so anything that must be true whenever the tool is called
  // belongs in its description. A film title is the easiest thing in this
  // product for an assistant to write down unasked, which is why this is a test
  // rather than a convention.
  const tools = await listTools(await tokenFor(someone()));

  for (const name of ["create_movie", "update_movie"]) {
    const description = tools.find((tool) => tool.name === name)?.description ?? "";

    assert.match(description, /recommendation is not a saved movie/i, `${name}: recommending`);
    assert.match(description, /absence is never not_seen/i, `${name}: absence`);
    assert.match(description, /covers only the meaning they were shown/i, `${name}: confirmation`);
    assert.match(description, /permission to write/i, `${name}: confirming is not approving`);
  }
});

test("the write tools carry the rules that apply at the moment they are called", async () => {
  /**
   * Step 2 of `docs/work/phase-1-implementation.md`: the rules that are true
   * whenever *this* call is made move to the description of the tool they govern,
   * because a client can discover these tools and call them without ever loading
   * the Tonight skill.
   *
   * Only tool-local rules. Anything that spans two calls — consent, the
   * classification a kept film goes through, when to propose a Mix, whether this
   * conversation should be writing at all — stays in the skill, and has to,
   * because a description cannot be read before the call it describes.
   */
  const tools = await listTools(await tokenFor(someone()));
  const describing = (name: string) => tools.find((tool) => tool.name === name)?.description ?? "";

  /** One field's description on one tool, as a client reads it. */
  const fieldOf = (all: typeof tools, tool: string, field: string) =>
    ((all.find((one) => one.name === tool)?.inputSchema.properties?.[field] ?? {}) as {
      description?: string;
    }).description ?? "";

  // A Genre's and a Mix's instruction is the user's own sentence, so it is
  // written in their voice. True of the field, whichever tool is writing it.
  for (const name of ["create_genre", "update_genre", "create_mix", "update_mix"]) {
    assert.match(
      fieldOf(tools, name, "instruction"),
      /first person/i,
      `${name}: the instruction's voice`,
    );
  }

  // How a sentence becomes this field's value. Without it an agent knows the five
  // states exist and not which sentence means which — the gap this rule was
  // written for.
  //
  // Each reading is checked as a *pair*: the phrase, and the state named next
  // after it. A missing reading fails because the phrase is not there; a reading
  // pointed at the wrong state fails because the wrong state comes next. Written
  // this way rather than as a search for the whole sentence, so that rewrapping
  // or rewording around the mapping does not fail a test about its meaning.
  for (const name of ["create_movie", "update_movie"]) {
    const described = fieldOf(tools, name, "state");
    assert.ok(described.length > 0, `${name} has no description for state`);

    for (const [phrase, state] of [
      [`"haven't seen it"`, "not_seen"],
      [`"want to watch it"`, "not_seen"],
      [`"seen it"`, "seen"],
      [`"it was good"`, "liked"],
      [`"loved it"`, "loved"],
      [`"didn't like it"`, "disliked"],
    ] as [string, string][]) {
      const at = described.indexOf(phrase);
      assert.notEqual(at, -1, `${name}: nothing reads ${phrase} into a state`);

      // Longest first, so `not_seen` is not read as `seen` and `disliked` is not
      // read as `liked`; word boundaries so neither is matched inside the other.
      const next = described
        .slice(at + phrase.length)
        .match(/\b(not_seen|disliked|liked|loved|seen)\b/)?.[1];
      assert.equal(next, state, `${name}: ${phrase} does not read as ${state}`);
    }

    // As one passage rather than six sentences that drifted apart: the readings
    // have to arrive together to be read as a mapping at all. This assertion
    // moved here from `lib/instructions.test.ts` with the rule it guards.
    const from = described.indexOf("Take the state from what they said");
    const to = described.indexOf(`"didn't like it"`);
    assert.ok(from >= 0 && to > from, `${name}: the mapping is not one thought`);
    assert.ok(to - from < 500, `${name}: the mapping has been spread out`);

    // And the two rules about this field that are not a reading.
    assert.match(described, /not the same as not_seen/, `${name}: silence is not a state`);
    assert.match(described, /never a score or star rating/, `${name}: a state is not a rating`);
  }

  // The user's sentence is not the agent's to adjust. What Step 2 relocated is the
  // prohibition itself — field-local, and nothing about how a change is agreed to,
  // which is workflow and stays in the skill.
  assert.match(describing("update_mix"), /never reword their instruction/i, "update_mix: rewording");
  assert.doesNotMatch(
    describing("update_mix"),
    /propose the new wording|let the user agree/i,
    "update_mix has been given the workflow half as well",
  );

  // The preconditions a call is refused for, where a client meets them.
  assert.match(describing("create_genre"), /instruction is required/i, "a genre with no meaning");
  assert.match(describing("create_mix"), /cannot be built from another mix/i, "no chaining");
  assert.match(
    JSON.stringify(tools.find((tool) => tool.name === "create_mix")?.inputSchema ?? {}),
    /at least one/i,
    "a mix built from nothing",
  );

  // And the naming test, which is a judgement made at the moment a name is chosen.
  assert.match(
    JSON.stringify(tools.find((tool) => tool.name === "create_mix")?.inputSchema ?? {}),
    /the name is doing no work/i,
    "the test for a mix's name",
  );
});

test("no cross-tool rule has been copied into a tool description", async () => {
  // The other half of Step 2's review, and the one a reviewer cannot check by
  // reading a diff: orchestration, classification and the recommend-versus-
  // configure boundary must stay in the skill. A description that carried them
  // would be telling an agent what to do before the call it describes.
  const tools = await listTools(await tokenFor(someone()));
  const everything = JSON.stringify(tools);

  for (const [what, leaked] of [
    ["the classification ladder", /do not fit it to what is there/i],
    ["stretching a Mix", /Never stretch a Mix/i],
    ["proposing a Mix", /three to five other films/i],
    ["when to propose one", /propose while saving, not while recommending/i],
    ["the films in a proposal", /illustration only/i],
    ["the recommend-versus-configure boundary", /configuration session/i],
    ["how many films to recommend", /three to six films/i],
    ["what the remainder is called", /Other movies/i],
    ["whether to ask before calling", /never ask for a state/i],
  ] as [string, RegExp][]) {
    assert.equal(leaked.test(everything), false, `${what} has leaked into a tool description`);
  }

  /**
   * One exception, named rather than left as a hole.
   *
   * `update_genre` has said "propose the new wording and let the user agree to it
   * rather than editing on their behalf" since before this relocation began. That
   * is workflow by the rule above, and taking it out would be a removal — Step 2
   * is additive only, and a description losing guidance it already shipped is a
   * behaviour change rather than a relocation. It is a question for a later step;
   * what this pins is that the sentence did not *spread*.
   */
  const agreeing = tools.filter((tool) => /propose the new wording|let the user agree/i.test(tool.description));
  assert.deepEqual(
    agreeing.map((tool) => tool.name),
    ["update_genre"],
    "the workflow half of the rewording rule has spread beyond where it already was",
  );
});

test("a movie is saved with what the user said, and appears once in the model", async () => {
  const token = await tokenFor(someone());
  await ok(token, "create_genre", { name: "Sci-Fi", instruction: "Ideas over spectacle." });
  await ok(token, "create_mix", {
    name: "Space Tension",
    genres: ["Sci-Fi"],
    instruction: "Contained, and nobody is safe.",
  });

  const created = await ok(token, "create_movie", {
    title: "Arrival",
    year: 2016,
    imdb_id: "tt2543164",
    state: "loved",
    mixes: ["Space Tension"],
  });
  assert.deepEqual(created.movie, {
    title: "Arrival",
    year: 2016,
    imdbId: "tt2543164",
    state: "loved",
    mixes: ["Space Tension"],
  });

  const taste = await ok(token, "get_taste");

  // The state lives in one place. The mix carries the handle — both halves of
  // it — so a title that names two films still names one here.
  //
  // The create answered with the object it wrote, which is the caller's own words
  // back. The read answers with the *record*, which is that plus when Tonight
  // wrote it — and the difference between the two is exactly those two fields.
  assert.equal(
    taste.movies[0].createdAt,
    taste.movies[0].updatedAt,
    "nothing has happened to it yet",
  );
  assert.deepEqual(taste.movies.map(content), [created.movie]);
  assert.deepEqual(taste.mixes[0].movies, [{ title: "Arrival", year: 2016 }]);

  // No uuid, anywhere. Asserted as the set of field names rather than by
  // searching the text, which would match the "id" inside an ordinary word.
  assert.deepEqual(Object.keys(taste.movies[0]).sort(), [
    "createdAt",
    "imdbId",
    "mixes",
    "state",
    "title",
    "updatedAt",
    "year",
  ]);
  assert.deepEqual(Object.keys(taste.mixes[0].movies[0]).sort(), ["title", "year"]);
});

test("when a thing was written is Tonight's answer, and not a caller's argument", async () => {
  const token = await tokenFor(someone());
  const tools = await listTools(token);

  // Not one tool takes either, under either spelling. Asserted over every tool
  // rather than the write ones, because the point is that there is nowhere in
  // this interface to say when something happened.
  for (const tool of tools) {
    for (const field of ["created_at", "updated_at", "createdAt", "updatedAt"]) {
      assert.ok(
        !Object.keys(tool.inputSchema.properties ?? {}).includes(field),
        `${tool.name} takes ${field}`,
      );
    }
  }

  // Sent anyway, the way an over-helpful client would. The schema has no field
  // for it, so it goes no further than the boundary — and what comes back is the
  // time this call happened, not the time it was told.
  await ok(token, "create_genre", {
    name: "Sci-Fi",
    instruction: "Ideas over spectacle.",
    created_at: "1999-01-01T00:00:00Z",
    updatedAt: "1999-01-01T00:00:00Z",
  });

  const taste = await ok(token, "get_taste");
  const [genre] = taste.genres;
  assert.match(genre.createdAt, STAMP);
  // A window rather than a comparison against a bracket taken here: the stamp
  // comes from the database's clock and this test reads a different one. What is
  // being asserted is that a supplied 1999 had no effect, and five minutes
  // settles that without either clock having to be right about the other.
  assert.ok(
    Math.abs(Date.parse(genre.createdAt) - Date.now()) < 5 * 60_000,
    `created_at came from the caller: ${genre.createdAt}`,
  );
  assert.equal(genre.createdAt, genre.updatedAt);
});

test("omitted, a state and null are three different answers over the wire", async () => {
  const token = await tokenFor(someone());

  const saved = await ok(token, "create_movie", { title: "Arrival", year: 2016 });
  assert.equal(saved.movie.state, null, "an omitted field became an answer");

  const said = await ok(token, "update_movie", { title: "Arrival", year: 2016, state: "loved" });
  assert.equal(said.movie.state, "loved");

  // Omitting leaves the answer standing; sending null is what withdraws it.
  const kept = await ok(token, "update_movie", {
    title: "Arrival",
    year: 2016,
    imdb_id: "tt2543164",
  });
  assert.equal(kept.movie.state, "loved", "an unrelated change withdrew a stated answer");

  const cleared = await ok(token, "update_movie", { title: "Arrival", year: 2016, state: null });
  assert.equal(cleared.movie.state, null);

  // And null survives serialisation rather than being dropped from the JSON —
  // an absent key would be indistinguishable from one the reader failed to read.
  const { result } = await callTool(token, "get_taste");
  assert.match(result?.content?.[0]?.text ?? "", /"state":\s*null/);
});

test("not_seen is a state the user gave, and never what silence means", async () => {
  const token = await tokenFor(someone());
  await ok(token, "create_movie", { title: "Dune", year: 2021 });

  const quiet = (await ok(token, "get_taste")).movies[0];
  assert.equal(quiet.state, null, "saving a film said they had not seen it");

  const said = await ok(token, "update_movie", { title: "Dune", year: 2021, state: "not_seen" });
  assert.equal(said.movie.state, "not_seen");
  assert.notEqual(said.movie.state, null, "the two would be one answer");
});

test("a handle the schema cannot make sense of never reaches the store", async () => {
  const token = await tokenFor(someone());

  // Refused by the schema, which is how a client is told the field is required
  // and what shape it takes.
  assert.match(await refused(token, "create_movie", { title: "Dune" }), /year/);
  assert.match(await refused(token, "create_movie", { title: "Dune", year: "2021" }), /year/);
  assert.match(await refused(token, "create_movie", { title: "Dune", year: 2021.5 }), /year/);
  assert.match(await refused(token, "delete_movie", { title: "Dune" }), /year/);
  for (const bad of ["yes", "neutral", "Seen", true]) {
    assert.match(
      await refused(token, "create_movie", { title: "Dune", year: 2021, state: bad }),
      /state/,
      JSON.stringify(bad),
    );
  }

  // The bounds the domain enforces are in the schema too, so a client is told
  // the shape rather than having to discover it by being refused.
  for (const year of [1500, 9999]) {
    assert.match(
      await refused(token, "create_movie", { title: "Dune", year }),
      /between 1878 and 2200/,
      String(year),
    );
  }
  for (const bad of ["tt42", "0111161", "tt0111161x", `tt${"1".repeat(19)}`]) {
    assert.match(
      await refused(token, "create_movie", { title: "Dune", year: 2021, imdb_id: bad }),
      /IMDb title id/,
      bad,
    );
  }

  // Blank is not a way to clear an id at this boundary either. Only null is.
  assert.match(
    await refused(token, "create_movie", { title: "Dune", year: 2021, imdb_id: "" }),
    /IMDb title id/,
  );

  // And what the schema allows, the domain still judges — in the product's own
  // words, which is what a model can correct for.
  assert.match(
    await refused(token, "create_movie", { title: "Dune", year: 2021, mixes: ["Nope"] }),
    /"Nope" is not one of them/,
  );

  assert.deepEqual((await ok(token, "get_taste")).movies, [], "a refused write left something");
});

test("a valid IMDb id survives the boundary, spaces and all", async () => {
  const token = await tokenFor(someone());

  // The schema trims before it judges the syntax, which is what the store does
  // too — so the two agree about an argument somebody pasted with a space on it.
  const saved = await ok(token, "create_movie", {
    title: "Shawshank",
    year: 1994,
    imdb_id: " tt0111161 ",
  });
  assert.equal(saved.movie.imdbId, "tt0111161");

  // Null still clears it, and omitting it still leaves it alone.
  assert.equal(
    (await ok(token, "update_movie", { title: "Shawshank", year: 1994, state: "seen" })).movie
      .imdbId,
    "tt0111161",
  );
  assert.equal(
    (await ok(token, "update_movie", { title: "Shawshank", year: 1994, imdb_id: null })).movie
      .imdbId,
    null,
  );
});

test("retitling a movie keeps it the same film, filed where it was", async () => {
  const token = await tokenFor(someone());
  await ok(token, "create_genre", { name: "Sci-Fi", instruction: "Ideas over spectacle." });
  await ok(token, "create_mix", {
    name: "Space Tension",
    genres: ["Sci-Fi"],
    instruction: "Contained, and nobody is safe.",
  });
  await ok(token, "create_movie", {
    title: "Dune",
    year: 1984,
    state: "seen",
    mixes: ["Space Tension"],
  });

  const moved = await ok(token, "update_movie", {
    title: "Dune",
    year: 1984,
    new_title: "Dune (Lynch)",
    new_year: 1985,
  });
  assert.deepEqual(moved.movie, {
    title: "Dune (Lynch)",
    year: 1985,
    imdbId: null,
    state: "seen",
    mixes: ["Space Tension"],
  });

  const taste = await ok(token, "get_taste");
  assert.deepEqual(taste.mixes[0].movies, [{ title: "Dune (Lynch)", year: 1985 }]);

  const gone = await ok(token, "delete_movie", { title: "Dune (Lynch)", year: 1985 });
  assert.deepEqual(gone.deleted.mixes, ["Space Tension"]);
  assert.deepEqual((await ok(token, "get_taste")).mixes[0].movies, [], "the mix kept a dead handle");
});
