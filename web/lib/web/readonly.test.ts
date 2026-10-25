import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The website reads, with one narrow exception, and this is what holds it there.
 *
 * The exception is a film's answers — *Love it*, *Like it*, *Want to see*, *Not
 * interested*, *Dislike*, and *Seen now* / *Seen before* while it is seen — posted
 * from the film's screen to `/movie/choose`
 * and kept by `lib/web/choose.ts`: a verdict with its seen value, a listing with
 * the verdict taken back, a withdrawal, or the film's viewing, for a film the
 * signed-in user has saved, and nothing else. Every other change —
 * a film added, retitled, refiled or removed, a genre or a vibe, an evening — is
 * made through an assistant, over `/mcp`, by the tools in `lib/mcp/server.ts`.
 *
 * So the guard is structural rather than a refusal at runtime. Next.js routes by
 * file: a path with no handler answers 404 to every method, so a write route
 * that does not exist cannot be called by a browser, a script or anyone else.
 * What has to be kept true is that no other comes, and these tests fail the
 * moment one does — a route that accepts a mutating method, a server action, a
 * client `fetch`, a form posting anywhere but sign-in, sign-out and the choices,
 * a page or component calling a store operation that writes, or the choice route
 * writing anything beyond its three kinds of write.
 *
 * What is mutable is listed, and nothing else may join it: the website's own
 * sign-in and sign-out, which write a browser session and nothing of the user's
 * taste; a film's choices; and the shared MCP and OAuth routes, which are the
 * assistant's surface and are deliberately not the website's to limit.
 */

const WEB = fileURLToPath(new URL("../../", import.meta.url));
const APP = join(WEB, "app");
const COMPONENTS = join(WEB, "components");
const LIB = join(WEB, "lib");

/** Every file under a directory, as paths relative to `web/`. */
function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(WEB, join(entry.parentPath, entry.name)));
}

/** Shipped source only: a test file is not something a browser can reach. */
const shipped = (path: string) => /\.tsx?$/.test(path) && !/\.test\.ts$/.test(path);

const read = (path: string) => readFileSync(join(WEB, path), "utf8");

/**
 * The mutating methods each route exports, as `route METHOD`.
 *
 * GET is left out on purpose: a GET handler is a read by contract, and
 * `/auth/callback` and `/oauth/callback` are the two that complete a sign-in —
 * authentication, listed with the rest below.
 */
function mutatingRoutes(): string[] {
  const found: string[] = [];
  for (const path of files(APP).filter((one) => one.endsWith("route.ts"))) {
    const route = relative("app", path).replace(/\/?route\.ts$/, "");
    for (const match of read(path).matchAll(
      /export\s+(?:async\s+)?(?:function|const)\s+(POST|PUT|PATCH|DELETE)\b/g,
    )) {
      found.push(`${route} ${match[1]}`);
    }
  }
  return found.sort();
}

/**
 * Everything on the site that accepts a write, and why each may.
 *
 * `auth/*` writes a browser session, a parked sign-in and a rate-limit counter —
 * authentication, without which the signed-in screens cannot be reached.
 * `movie/choose` is a film's answers, and only those — see the last test.
 * `mcp` and `oauth/*` are the assistant's surface: MCP sessions, client
 * registrations, authorization codes, and every write an assistant makes on the
 * user's behalf.
 */
const ALLOWED = [
  "auth/signin POST",
  "auth/signout POST",
  "mcp DELETE",
  "mcp POST",
  "movie/choose POST",
  "oauth/authorize POST",
  "oauth/register POST",
  "oauth/token POST",
].sort();

test("the website's write routes are gone, not guarded", () => {
  // Removed rather than refused, so there is no check to get wrong: with no
  // handler, every method on these paths is a 404.
  assert.equal(existsSync(join(APP, "api")), false, "app/api is back");
  for (const file of ["lib/web/api.ts", "lib/web/manage.ts", "components/manage.tsx"]) {
    assert.equal(existsSync(join(WEB, file)), false, `${file} is back`);
  }
});

test("the only routes that accept a write are sign-in, sign-out, a film's choices and the assistant's", () => {
  assert.deepEqual(
    mutatingRoutes(),
    ALLOWED,
    "a route accepts a mutating method that is not authentication, a film's choices or MCP",
  );
});

test("the walk over routes finds what is there", () => {
  // A guard that read no files would pass for ever. These are known to exist,
  // so finding them is what makes an empty answer above mean something.
  const routes = files(APP).filter((one) => one.endsWith("route.ts"));
  assert.ok(routes.includes(join("app", "mcp", "route.ts")), "the walk does not reach app/mcp");
  assert.ok(routes.includes(join("app", "auth", "signin", "route.ts")));
  assert.ok(mutatingRoutes().includes("mcp POST"), "the method matcher finds nothing");
});

test("there are no server actions anywhere", () => {
  // A server action is an endpoint without a file of its own: a function the
  // browser can call by id. One of them would be a write route this walk over
  // `app/` could not see.
  const directive = /^\s*["']use server["'];?/m;
  for (const path of [...files(APP), ...files(COMPONENTS), ...files(LIB)].filter(shipped)) {
    assert.doesNotMatch(read(path), directive, `${path} declares a server action`);
  }
});

test("no component sends a request or re-reads the page after one", () => {
  for (const path of files(COMPONENTS).filter(shipped)) {
    const source = read(path);
    assert.doesNotMatch(source, /\bfetch\s*\(/, `${path} sends a request`);
    assert.doesNotMatch(source, /router\.refresh\s*\(/, `${path} refreshes after a write`);
    assert.doesNotMatch(source, /\buseRouter\b/, `${path} reaches for the router`);
  }
});

test("the only forms are sign-in, sign-out and a film's choices", () => {
  const forms: string[] = [];
  for (const path of [...files(APP), ...files(COMPONENTS)].filter(shipped)) {
    for (const match of read(path).matchAll(/<form\b[^>]*>/g)) {
      forms.push(`${path}: ${match[0]}`);
    }
  }

  assert.equal(forms.length, 4, `unexpected forms:\n${forms.join("\n")}`);
  const header = forms.filter((form) => form.startsWith("components/site-header.tsx: "));
  assert.equal(header.length, 2, "sign-in and sign-out are not the header's two forms");
  for (const form of header) {
    assert.match(form, /action="\/auth\/sign(in|out)"/, `a form posting elsewhere: ${form}`);
  }
  // A film's two questions: *What do you think?* and *When did you see it?*.
  const choices = forms.filter((form) => !form.startsWith("components/site-header.tsx: "));
  assert.equal(choices.length, 2);
  for (const form of choices) {
    assert.match(form, /^components\/movie-choices\.tsx: /, `a form outside the header and the choices: ${form}`);
    assert.match(form, /method="post"/);
    assert.match(form, /action="\/movie\/choose"/, `the choices post elsewhere: ${form}`);
  }
});

test("the choice route writes a verdict, a withdrawal or a viewing, and nothing else", () => {
  // The route file hands the request over and does nothing of its own.
  const route = read(join("app", "movie", "choose", "route.ts"));
  assert.match(route, /return handleChoice\(request\);/);

  // What it hands it to writes through one store operation, `choose`, which
  // decides the press on the film as it holds it under its lock and writes a
  // verdict, a withdrawal, a viewing — or a verdict or withdrawal together with
  // the viewing — in that one transaction. It calls no other operation that writes.
  const choose = read(join("lib", "web", "choose.ts"));
  assert.match(choose, /await taste\.choose\(movie, \(held\) => \{/, "a press is written some other way");
  assert.match(choose, /const outcome = decide\(choice, held\);/, "a press is decided on something other than the held film");
  assert.match(choose, /return writeFor\(outcome\);/);
  // Never the verdict store's own `say`, which writes about any film, saved or
  // not: a press could then land after the film was deleted, and outlive it.
  assert.doesNotMatch(choose, /\.say\s*\(/, "an act is written without holding its film");
  assert.doesNotMatch(choose, /"volunteered"/, "a pressed verdict is told as volunteered");
  const others = choose.match(
    /\.\s*(create\w+|delete\w+|update\w+|say\w*|forget|record|addRound|correct)\s*\(/,
  );
  assert.equal(others, null, `the choice route calls ${others?.[1]}, which it may not`);

  // The store writes a press as an answer to the question the page puts — told
  // `confirmed`, not something said unasked — stamped after the film is held,
  // and through the verdict module's own `writeAct`.
  const store = read(join("lib", "taste", "store", "sql.ts"));
  const held = store.slice(store.indexOf("async choose(film, decide)"), store.indexOf("function setViewing"));
  assert.match(held, /lockMovies\(tx, owner,/, "a press is not decided under the film's lock");
  assert.match(held, /const write = decide\(held\);/);
  assert.match(held, /stateVerdict\(handle, \{ about: "judgement", judgement: write\.judgement \}, "confirmed", at\)/);
  assert.match(held, /withdrawVerdict\(handle, at\)/);
  assert.match(held, /lastSaidWithin\(tx, owner, handle\)/, "a press is not checked against what was said later");
  assert.ok(
    held.indexOf("lockMovies(") < held.indexOf("new Date().toISOString()"),
    "a press is stamped before the film is held",
  );
  for (const [check, name] of [
    [/wrongOrigin\(request, config/, "the canonical origin"],
    [/crossSite\(request, config\)/, "a page of ours"],
    [/signedInVisitor\(sessionOf\(request, config\)\)/, "a session"],
  ] as [RegExp, string][]) {
    assert.match(choose, check, `the choice route does not check ${name}`);
  }

  // And nothing else under `lib/web` writes the user's taste, verdicts or
  // evenings: the choices are the one place. (Sign-in's own session writes are
  // authentication, and are the routes above.)
  const call =
    /\.\s*(create(?:Genre|Vibe|Movie)|update(?:Genre|Vibe|Movie)|delete(?:Genre|Vibe|Movie)|say|sayFiled|saySaved|choose|forget|record|addRound|correct)\s*\(/;
  for (const path of files(join(LIB, "web")).filter(shipped)) {
    if (path === join("lib", "web", "choose.ts")) continue;
    const found = read(path).match(call);
    assert.equal(found, null, `${path} calls ${found?.[1]}, which writes`);
  }
});

test("no page or component calls a store operation that writes", () => {
  // The stores are opened by the pages to read them. Every operation below
  // writes, and each is reached only through `lib/mcp/server.ts` — or, for a
  // film's choices, `lib/web/choose.ts`, pinned above.
  const writes = [
    "createGenre",
    "updateGenre",
    "deleteGenre",
    "createVibe",
    "updateVibe",
    "deleteVibe",
    "createMovie",
    "updateMovie",
    "deleteMovie",
    "say",
    "sayFiled",
    "saySaved",
    "choose",
    "forget",
    "record",
    "addRound",
    "correct",
  ];
  const call = new RegExp(`\\.\\s*(${writes.join("|")})\\s*\\(`);

  for (const path of [...files(APP), ...files(COMPONENTS)].filter(shipped)) {
    if (path.startsWith(join("app", "mcp"))) continue;
    const found = read(path).match(call);
    assert.equal(found, null, `${path} calls ${found?.[1]}, which writes`);
  }

  // And they are all still there for the assistant: this is the website giving
  // them up, not the product.
  const server = read(join("lib", "mcp", "server.ts"));
  for (const one of ["createGenre", "deleteVibe", "updateMovie", "say", "record"]) {
    assert.match(server, new RegExp(`\\.${one}\\(`), `the MCP server no longer calls ${one}`);
  }
});
