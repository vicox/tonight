/**
 * Materialises one M3 fixture, through the real MCP tools.
 *
 *   node evaluation/m3/seed.mjs m3-01-long-history            seed, then print a token
 *   node evaluation/m3/seed.mjs m3-01-long-history --token    print a token, seeding NOTHING
 *   node evaluation/m3/seed.mjs m3-01-long-history --snapshot <dir>/<name>
 *                                                             record what get_taste and
 *                                                             get_memory answer right now
 *
 * ## What is different from the Phase-1 seeder, and why
 *
 * Phase 1's fixtures are a taste model: genres, mixes and films, and the rule
 * there is **seed once**, because a reseed between two runs makes every earlier
 * recording describe rows that no longer exist.
 *
 * An M3 fixture is a *history*, and two of the seven scenarios ask the agent to
 * change it — withdrawing, forgetting, correcting an evening. A run that starts
 * from the wreckage of the previous one is not a run of the scenario. So this
 * seeder is idempotent over the whole history, **every run reseeds**, and the
 * snapshot is taken immediately afterwards and named in the artifact by its
 * digest. The provenance guarantee is the same one Phase 1 makes — *this is the
 * data the agent saw* — reached the other way round.
 *
 * ## Why through the tools
 *
 * Because a history that cannot be expressed through the public tool surface is
 * not a history of this product. Every genre, mix, film, verdict, withdrawal,
 * evening and correction below goes through the same MCP endpoint an agent uses.
 *
 * The one exception is a pending question. Nothing on the tool surface opens
 * one — `record_opportunity` spends a chance against a question that already
 * exists — so that single act reaches the store directly. It is written here
 * rather than hidden, and it is the same seam the deterministic M3 gates
 * declare in their own limits.
 *
 * ## Safety
 *
 * Every fixture user is `google:eval-m3-…` and this refuses to touch anything
 * else. Nothing outside the fixture's own user is read or written.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WEB = join(here, "..", "..", "..", "..", "web");
const ORIGIN = process.env.TONIGHT_ORIGIN ?? "http://localhost:3000";
const PROTOCOL_VERSION = "2026-07-28";

/** The fixture users this may write to, and no others. */
const OWNED = /^google:eval-m3-[a-z0-9-]+$/;

for (const line of readFileSync(join(WEB, ".env.local"), "utf8").split("\n")) {
  const at = line.indexOf("=");
  if (at > 0 && !line.startsWith("#")) process.env[line.slice(0, at)] ??= line.slice(at + 1).trim();
}

const { deployment, signingKey } = await import(join(WEB, "lib", "oauth", "config.ts"));
const { mintAccessToken } = await import(join(WEB, "lib", "oauth", "tokens.ts"));

function fixture(id) {
  return JSON.parse(readFileSync(join(here, "fixtures", `${id}.json`), "utf8"));
}

async function token(user) {
  if (!OWNED.test(user)) throw new Error(`refusing to act for ${user}: not an M3 evaluation user`);
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
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: args,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientInfo": { name: "tonight-m3-evaluation", version: "1.0.0" },
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
  return answer.result.structuredContent;
}

/**
 * Empties a fixture user completely.
 *
 * All five stores, because an M3 history reaches all five and a half-cleared
 * user is a different fixture wearing the right name. Verdict acts and pending
 * questions have no public delete that clears a user, so those two go through
 * the store — the same seam the question above uses.
 */
async function clear(bearer, user) {
  const taste = await call(bearer, "get_taste");
  for (const movie of taste.movies) await call(bearer, "delete_movie", { title: movie.title, year: movie.year });
  for (const mix of taste.mixes) await call(bearer, "delete_mix", { name: mix.name });
  for (const genre of taste.genres) await call(bearer, "delete_genre", { name: genre.name });

  const { episodes } = await call(bearer, "get_episodes");
  for (const episode of episodes) await call(bearer, "forget_episode", { episode: episode.id });

  const memory = await call(bearer, "get_memory");
  for (const root of [...memory.held, ...memory.remembered]) {
    if (root.of === "verdict") await call(bearer, "forget_verdict", { ref: root.handle.ref });
  }
  await forgetQuestions(user);
}

/** The one store this reaches directly, and the two things it does there. */
async function questionStore(user) {
  const { postgresDriver } = await import(join(WEB, "lib", "db", "postgres.ts"));
  const { sqlQuestionStore } = await import(join(WEB, "lib", "verdicts", "questions", "sql.ts"));
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set; the question seam needs the same database the server uses");
  const driver = await postgresDriver(url);
  return { driver, store: sqlQuestionStore(driver, { id: user }) };
}

async function forgetQuestions(user) {
  const { driver, store } = await questionStore(user);
  try {
    for (const open of await store.pending(new Date().toISOString())) await store.close(open.film);
  } finally {
    await driver.close?.();
  }
}

async function openQuestion(user, act) {
  const { askAbout } = await import(join(WEB, "lib", "verdicts", "questions.ts"));
  const { driver, store } = await questionStore(user);
  try {
    const since = new Date(Date.now() - act.daysAgo * 86_400_000).toISOString();
    await store.open(askAbout(act.film, since, act.opportunities ?? 0));
  } finally {
    await driver.close?.();
  }
}

async function seed(id) {
  const spec = fixture(id);
  const bearer = await token(spec.user);

  await clear(bearer, spec.user);

  for (const genre of spec.model.genres) await call(bearer, "create_genre", genre);
  for (const mix of spec.model.mixes) await call(bearer, "create_mix", mix);
  for (const movie of spec.model.movies) {
    const { title, year, viewing, mixes, imdbId } = movie;
    await call(bearer, "create_movie", {
      title,
      year,
      ...(viewing === null || viewing === undefined ? {} : { viewing }),
      ...(mixes?.length ? { mixes } : {}),
      ...(imdbId ? { imdb_id: imdbId } : {}),
    });
  }

  // References handed back by the seeded acts, so a later act can name an
  // earlier one by the label the fixture gave it.
  const noticed = new Map();
  const offered = new Map();

  // In order, because order is what makes one verdict supersede another.
  for (const act of spec.acts ?? []) {
    switch (act.do) {
      case "verdict":
        await call(bearer, "record_verdict", { film: act.film, told: act.told, said: act.said });
        break;
      case "withdraw":
        await call(bearer, "withdraw_verdict", {
          film: act.film,
          ...(act.occasion === undefined ? {} : { occasion: act.occasion }),
        });
        break;
      case "episode": {
        const { episode } = await call(bearer, "record_episode", {
          request: act.request,
          offered: act.offered,
        });
        if (act.outcome) await call(bearer, "correct_episode", { episode: episode.id, ...act.outcome });
        if (act.correction) await call(bearer, "correct_episode", { episode: episode.id, ...act.correction });
        break;
      }
      case "question":
        await openQuestion(spec.user, act);
        break;
      // M4's two agent-owned kinds. Seeded through the public tools like
      // everything else: a fixture where Tonight has already noticed something,
      // or already offered it, is a history the product can actually reach.
      case "observe": {
        const { observation } = await call(bearer, "record_observation", { noticed: act.noticed });
        noticed.set(act.as ?? act.noticed, observation.ref);
        break;
      }
      case "propose": {
        const { proposal } = await call(bearer, "propose_change", {
          ...(act.from === undefined ? {} : { from: noticed.get(act.from) }),
          noticed: act.noticed,
          target: act.target,
        });
        offered.set(act.as ?? act.noticed, proposal.ref);
        // A fixture may want the proposal already decided — a rejected one is
        // the only way to set up "a no stays a no across a conversation".
        if (act.decided === "rejected") await call(bearer, "reject_proposal", { ref: proposal.ref });
        if (act.decided === "accepted") await call(bearer, "accept_proposal", { ref: proposal.ref });
        break;
      }
      default:
        throw new Error(`${spec.id}: unknown act ${act.do}`);
    }
  }

  return { spec, bearer };
}

/** What the two reads answer for a fixture's user, right now. Provenance, not a call for the agent. */
async function snapshot(bearer) {
  return { taste: await call(bearer, "get_taste"), memory: await call(bearer, "get_memory") };
}

const id = process.argv[2];
const flag = (name) => process.argv.includes(`--${name}`);
if (!id) {
  const all = readdirSync(join(here, "fixtures")).filter((f) => f.endsWith(".json"));
  console.error(`usage: node evaluation/m3/seed.mjs <fixture>\n\n${all.map((f) => `  ${f.replace(".json", "")}`).join("\n")}`);
  process.exit(1);
}

if (flag("token")) {
  const spec = fixture(id);
  console.error(`Token for ${spec.id} (${spec.user}) — nothing was seeded.`);
  console.log(await token(spec.user));
} else if (flag("snapshot")) {
  const spec = fixture(id);
  const bearer = await token(spec.user);
  const taken = await snapshot(bearer);
  const body = `${JSON.stringify(taken, null, 2)}\n`;
  const digest = createHash("sha256").update(body, "utf8").digest("hex").slice(0, 16);

  const where = process.argv[process.argv.indexOf("--snapshot") + 1];
  if (!where || where.startsWith("--")) throw new Error("--snapshot needs a file to write to");
  mkdirSync(dirname(where), { recursive: true });
  writeFileSync(where, body, "utf8");

  console.error(
    `Snapshot of ${spec.id}: ${taken.taste.movies.length} movies, ` +
      `${taken.memory.held.length} held, ${taken.memory.remembered.length} remembered. ` +
      "Nothing was seeded.",
  );
  console.log(`sha256:${digest}`);
} else {
  const { spec, bearer } = await seed(id);
  const taken = await snapshot(bearer);
  console.error(
    `Seeded ${spec.id} for ${spec.user}: ${taken.taste.genres.length} genres, ` +
      `${taken.taste.mixes.length} mixes, ${taken.taste.movies.length} movies, ` +
      `${taken.memory.held.length} held, ${taken.memory.remembered.length} remembered.`,
  );
  if (flag("print")) console.log(JSON.stringify(taken, null, 2));
  else console.log(bearer);
}
