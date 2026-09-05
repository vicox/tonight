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

  assert.deepEqual(await ok(token, "get_taste"), { genres: [], mixes: [] });
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
  assert.deepEqual(await ok(token, "get_taste"), { genres: [], mixes: [] });
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
  assert.deepEqual(await ok(token, "get_taste"), { genres: [], mixes: [] });
});

// --- whose taste ----------------------------------------------------------

test("the user a tool acts for comes from the token", async () => {
  const alice = await tokenFor(someone());
  const bob = await tokenFor(someone());

  await ok(alice, "create_genre", { name: "Alice only", instruction: "Hers." });

  assert.deepEqual(await ok(bob, "get_taste"), { genres: [], mixes: [] });
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
