import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The website is read-only, and this is what holds it there.
 *
 * Nothing on the website writes the user's data — not a film, a verdict, a
 * genre, a vibe or an evening. Every one of those is changed through an
 * assistant, over `/mcp`, by the tools in `lib/mcp/server.ts`. The website
 * reads the same stores in a Server Component and shows what they hold.
 *
 * So the guard is structural rather than a refusal at runtime. Next.js routes by
 * file: a path with no handler answers 404 to every method, so a write route
 * that does not exist cannot be called by a browser, a script or anyone else.
 * What has to be kept true is that none comes back, and these tests fail the
 * moment one does — a route that accepts a mutating method, a server action, a
 * client `fetch`, a form posting anywhere but sign-in, or a page calling a store
 * operation that writes.
 *
 * What stays mutable is listed, and nothing else may join it: the website's own
 * sign-in and sign-out, which write a browser session and nothing of the user's
 * taste; and the shared MCP and OAuth routes, which are the assistant's surface
 * and are deliberately not the website's to limit.
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
 * authentication, without which the read-only page cannot be reached. `mcp` and
 * `oauth/*` are the assistant's surface: MCP sessions, client registrations,
 * authorization codes, and every write an assistant makes on the user's behalf.
 */
const ALLOWED = [
  "auth/signin POST",
  "auth/signout POST",
  "mcp DELETE",
  "mcp POST",
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

test("the only routes that accept a write are sign-in, sign-out and the assistant's", () => {
  assert.deepEqual(
    mutatingRoutes(),
    ALLOWED,
    "a route accepts a mutating method that is not authentication or MCP — the website is read-only",
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

test("the only forms are sign-in and sign-out", () => {
  const forms: string[] = [];
  for (const path of [...files(APP), ...files(COMPONENTS)].filter(shipped)) {
    for (const match of read(path).matchAll(/<form\b[^>]*>/g)) {
      forms.push(`${path}: ${match[0]}`);
    }
  }

  assert.equal(forms.length, 2, `unexpected forms:\n${forms.join("\n")}`);
  for (const form of forms) {
    assert.match(form, /^components\/site-header\.tsx: /, `a form outside the header: ${form}`);
    assert.match(form, /action="\/auth\/sign(in|out)"/, `a form posting elsewhere: ${form}`);
  }
});

test("no page or component calls a store operation that writes", () => {
  // The stores are opened by the page to read them. Every operation below
  // writes, and each is reached only through `lib/mcp/server.ts`.
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
