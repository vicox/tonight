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
    result?: { tools?: { name: string; description: string; inputSchema: { required?: string[] } }[] };
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
  assert.deepEqual(taste.genres, [created.genre]);
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
  assert.deepEqual(taste.mixes, [created.mix]);
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

test("the endpoint offers eleven tools, and a movie is addressed by title and year", async () => {
  const tools = await listTools(await tokenFor(someone()));

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
    assert.match(description, /absence is never false/i, `${name}: absence`);
    assert.match(description, /covers only the meaning they were shown/i, `${name}: confirmation`);
    assert.match(description, /permission to write/i, `${name}: confirming is not approving`);
  }
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
    watched: true,
    mixes: ["Space Tension"],
  });
  assert.deepEqual(created.movie, {
    title: "Arrival",
    year: 2016,
    imdbId: "tt2543164",
    watched: true,
    liked: null,
    mixes: ["Space Tension"],
  });

  const taste = await ok(token, "get_taste");

  // The state lives in one place. The mix carries the handle — both halves of
  // it — so a title that names two films still names one here.
  assert.deepEqual(taste.movies, [created.movie]);
  assert.deepEqual(taste.mixes[0].movies, [{ title: "Arrival", year: 2016 }]);

  // No uuid, anywhere. Asserted as the set of field names rather than by
  // searching the text, which would match the "id" inside an ordinary word.
  assert.deepEqual(Object.keys(taste.movies[0]).sort(), [
    "imdbId",
    "liked",
    "mixes",
    "title",
    "watched",
    "year",
  ]);
  assert.deepEqual(Object.keys(taste.mixes[0].movies[0]).sort(), ["title", "year"]);
});

test("omitted, null and false are three different answers over the wire", async () => {
  const token = await tokenFor(someone());

  const saved = await ok(token, "create_movie", { title: "Arrival", year: 2016 });
  assert.equal(saved.movie.watched, null, "an omitted field became an answer");
  assert.equal(saved.movie.liked, null);

  const said = await ok(token, "update_movie", {
    title: "Arrival",
    year: 2016,
    watched: true,
    liked: false,
  });
  assert.equal(said.movie.watched, true);
  assert.equal(said.movie.liked, false);

  // Omitting leaves the answer standing; sending null is what withdraws it.
  const kept = await ok(token, "update_movie", {
    title: "Arrival",
    year: 2016,
    imdb_id: "tt2543164",
  });
  assert.equal(kept.movie.watched, true);
  assert.equal(kept.movie.liked, false, "an unrelated change withdrew a stated no");

  const cleared = await ok(token, "update_movie", {
    title: "Arrival",
    year: 2016,
    watched: null,
    liked: null,
  });
  assert.equal(cleared.movie.watched, null);
  assert.equal(cleared.movie.liked, null);

  // And null survives serialisation rather than being dropped from the JSON —
  // an absent key would be indistinguishable from one the reader failed to read.
  const { result } = await callTool(token, "get_taste");
  assert.match(result?.content?.[0]?.text ?? "", /"watched":\s*null/);
});

test("a handle the schema cannot make sense of never reaches the store", async () => {
  const token = await tokenFor(someone());

  // Refused by the schema, which is how a client is told the field is required
  // and what shape it takes.
  assert.match(await refused(token, "create_movie", { title: "Dune" }), /year/);
  assert.match(await refused(token, "create_movie", { title: "Dune", year: "2021" }), /year/);
  assert.match(await refused(token, "create_movie", { title: "Dune", year: 2021.5 }), /year/);
  assert.match(await refused(token, "delete_movie", { title: "Dune" }), /year/);
  assert.match(
    await refused(token, "create_movie", { title: "Dune", year: 2021, watched: "yes" }),
    /watched/,
  );

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
    (await ok(token, "update_movie", { title: "Shawshank", year: 1994, watched: true })).movie
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
    watched: true,
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
    watched: true,
    liked: null,
    mixes: ["Space Tension"],
  });

  const taste = await ok(token, "get_taste");
  assert.deepEqual(taste.mixes[0].movies, [{ title: "Dune (Lynch)", year: 1985 }]);

  const gone = await ok(token, "delete_movie", { title: "Dune (Lynch)", year: 1985 });
  assert.deepEqual(gone.deleted.mixes, ["Space Tension"]);
  assert.deepEqual((await ok(token, "get_taste")).mixes[0].movies, [], "the mix kept a dead handle");
});
