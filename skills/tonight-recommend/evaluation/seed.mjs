/**
 * Materialises one evaluation fixture, through the real MCP tools.
 *
 *   node evaluation/seed.mjs 03-state-rich              seed, then print a token
 *   node evaluation/seed.mjs 03-state-rich --token      print a token, seeding NOTHING
 *   node evaluation/seed.mjs 03-state-rich --snapshot <file>
 *                                                       record what get_taste answers
 *                                                       right now, and print its digest
 *   node evaluation/seed.mjs 03-state-rich --print-taste
 *
 * ## Why `--token` exists, and why it is the flag you want mid-session
 *
 * A token expires. Re-running the seed to get a fresh one **reseeds the fixture**:
 * same content, new rows, new timestamps — and every run recorded after that saw
 * data the recorded input no longer describes, with nothing to say so. `--token`
 * mints without writing, so refreshing credentials cannot move the ground under a
 * recording.
 *
 * ## Why `--snapshot` exists
 *
 * It is the proof. Taken immediately before a run and named in the run artifact by
 * its digest, it is what makes "this is the data the model saw" checkable rather
 * than asserted.
 *
 * Seeds through `create_genre`, `create_mix` and `create_movie` over HTTP rather
 * than writing rows: a fixture that cannot be expressed through the public tool
 * surface is not a fixture of this product, and the evaluation is supposed to run
 * against real tools rather than against a hand-written imitation of one.
 *
 * Prints a bearer token for the fixture's user, so a host can be pointed at the
 * same model the recording claims it saw.
 *
 * ## Safety
 *
 * Every fixture user is `google:eval-…` and this refuses to touch anything else.
 * Seeding deletes what the fixture defines and writes it again, so a re-run is
 * idempotent; nothing outside the fixture's own user is read or written.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WEB = join(here, "..", "..", "..", "web");
const ORIGIN = process.env.TONIGHT_ORIGIN ?? "http://localhost:3000";
const PROTOCOL_VERSION = "2026-07-28";

/** The fixture users this may write to, and no others. */
const OWNED = /^google:eval-[a-z0-9-]+$/;

for (const line of readFileSync(join(WEB, ".env.local"), "utf8").split("\n")) {
  const at = line.indexOf("=");
  if (at > 0 && !line.startsWith("#")) process.env[line.slice(0, at)] ??= line.slice(at + 1).trim();
}

const { deployment, signingKey } = await import(join(WEB, "lib", "oauth", "config.ts"));
const { mintAccessToken } = await import(join(WEB, "lib", "oauth", "tokens.ts"));

function fixture(id) {
  const file = join(here, "fixtures", `${id}.json`);
  return JSON.parse(readFileSync(file, "utf8"));
}

/** The model a fixture seeds: its own, or the one it declares it shares. */
function modelFor(spec) {
  if (spec.model) return spec.model;
  if (!spec.sameModelAs) throw new Error(`${spec.id} defines no model and names no source`);
  const source = fixture(spec.sameModelAs);
  if (source.user !== spec.user) {
    throw new Error(`${spec.id} shares ${spec.sameModelAs}'s model but not its user`);
  }
  return modelFor(source);
}

async function token(user) {
  if (!OWNED.test(user)) throw new Error(`refusing to act for ${user}: not an evaluation user`);
  const { token } = await mintAccessToken(
    deployment(), signingKey(), { id: user }, "evaluation", "mcp", deployment().resource,
  );
  return token;
}

/** One tool call, as a client makes it. Throws on a refusal, so seeding stops loudly. */
async function call(bearer, name, args = {}) {
  const response = await fetch(`${ORIGIN}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL_VERSION,
      "mcp-method": "tools/call",
      "mcp-name": name,
    },
    // The per-request envelope this protocol revision requires, in the shape
    // `lib/mcp/tools.test.ts` uses — this is a client, and it calls like one.
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: args,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientInfo": { name: "tonight-evaluation", version: "1.0.0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });

  const body = await response.text();
  const line = body.split("\n").find((one) => one.startsWith("data: "));
  const answer = JSON.parse(line ? line.slice(6) : body);
  if (answer.error) throw new Error(`${name}: ${JSON.stringify(answer.error)}`);
  if (answer.result?.isError) throw new Error(`${name}: ${answer.result.content?.[0]?.text}`);
  return answer.result;
}

/** Empties a fixture user, so seeding is idempotent. Movies, then mixes, then genres. */
async function clear(bearer) {
  const taste = (await call(bearer, "get_taste")).structuredContent;
  for (const movie of taste.movies) await call(bearer, "delete_movie", { title: movie.title, year: movie.year });
  for (const mix of taste.mixes) await call(bearer, "delete_mix", { name: mix.name });
  for (const genre of taste.genres) await call(bearer, "delete_genre", { name: genre.name });
}

/** What `get_taste` answers for a fixture's user, right now. */
async function snapshot(bearer) {
  return (await call(bearer, "get_taste")).structuredContent;
}

async function seed(id) {
  const spec = fixture(id);
  const bearer = await token(spec.user);
  const model = modelFor(spec);

  await clear(bearer);
  for (const genre of model.genres) await call(bearer, "create_genre", genre);
  for (const mix of model.mixes) await call(bearer, "create_mix", mix);
  for (const movie of model.movies) {
    const { title, year, state, mixes } = movie;
    await call(bearer, "create_movie", {
      title,
      year,
      ...(state === null || state === undefined ? {} : { state }),
      ...(mixes?.length ? { mixes } : {}),
    });
  }

  return { spec, bearer, taste: (await call(bearer, "get_taste")).structuredContent };
}

const id = process.argv[2];
const flag = (name) => process.argv.includes(`--${name}`);
if (!id) {
  const all = readdirSync(join(here, "fixtures")).filter((f) => f.endsWith(".json"));
  console.error(`usage: node evaluation/seed.mjs <fixture>\n\n${all.map((f) => `  ${f.replace(".json", "")}`).join("\n")}`);
  process.exit(1);
}

// `--token` and `--snapshot` read; only the bare form writes. A recording must
// never be invalidated by the act of refreshing a credential.
if (flag("token")) {
  const spec = fixture(id);
  console.error(`Token for ${spec.id} (${spec.user}) — nothing was seeded.`);
  console.log(await token(spec.user));
} else if (flag("snapshot")) {
  const spec = fixture(id);
  const bearer = await token(spec.user);
  const taste = await snapshot(bearer);
  const body = `${JSON.stringify(taste, null, 2)}\n`;
  const digest = createHash("sha256").update(body, "utf8").digest("hex").slice(0, 16);

  const where = process.argv[process.argv.indexOf("--snapshot") + 1];
  if (!where || where.startsWith("--")) throw new Error("--snapshot needs a file to write to");
  mkdirSync(dirname(where), { recursive: true });
  writeFileSync(where, body, "utf8");

  console.error(
    `Snapshot of ${spec.id} (${spec.user}) → ${where}: ` +
      `${taste.genres.length} genres, ${taste.mixes.length} mixes, ${taste.movies.length} movies. ` +
      `Nothing was seeded.`,
  );
  console.log(`sha256:${digest}`);
} else {
  const { spec, bearer, taste } = await seed(id);
  console.error(
    `Seeded ${spec.id} for ${spec.user}: ` +
      `${taste.genres.length} genres, ${taste.mixes.length} mixes, ${taste.movies.length} movies.`,
  );
  if (flag("print-taste")) console.log(JSON.stringify(taste, null, 2));
  else console.log(bearer);
}
