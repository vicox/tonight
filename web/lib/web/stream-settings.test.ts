import assert from "node:assert/strict";
import test from "node:test";

/**
 * The Stream's one setting, driven as the box drives it: a post from the Stream,
 * through the origin and session checks, into one answer per user — and read
 * back the way the Stream reads it when it is drawn.
 *
 * What it may keep is one yes-or-no for the signed-in user, and every case here
 * is about that: ticked until somebody unticks it, the same in every browser of
 * theirs, nobody else's, and nothing at all for a press from another site, a
 * press without a session or a value that is not true or false.
 */
process.env.PUBLIC_ORIGIN = "http://localhost:3000";
process.env.OAUTH_SIGNING_SECRET = "test-signing-secret-of-at-least-32-bytes";

const ORIGIN = "http://localhost:3000";

// The one connection every store shares (`lib/db.ts` keeps it on `globalThis`).
const { embeddedDriver } = await import("../db/pglite.ts");
const driver = await embeddedDriver();
(globalThis as Record<symbol, unknown>)[Symbol.for("tonight.database")] = Promise.resolve(driver);

const { handleIncludeSeen, readIncludeSeen } = await import("./stream-settings.ts");
const { webStore } = await import("./store.ts");
const { SESSION_COOKIE } = await import("./cookies.ts");

/** A signed-in browser, made directly: the sign-in flow is tested elsewhere. */
let people = 0;
async function signedIn(id = `google:stream-${++people}`) {
  const email = `${id.replace(":", "-")}@example.com`;
  const value = await (await webStore()).createSession({ user: { id }, email });
  return { cookie: `${SESSION_COOKIE}=${value}`, visitor: { user: { id }, email } };
}

type Options = { cookie?: string; origin?: string | null };

function press(value: string | null, options: Options = {}): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (options.origin !== null) headers.origin = options.origin ?? ORIGIN;
  if (options.cookie) headers.cookie = options.cookie;
  return handleIncludeSeen(
    new Request(`${ORIGIN}/stream/include-seen`, {
      method: "POST",
      headers,
      body: value === null ? "" : new URLSearchParams({ "include-seen": value }).toString(),
    }),
  );
}

/** Whether the Stream would open ticked for this person, read as it reads it. */
async function saved(visitor: Parameters<typeof readIncludeSeen>[0]): Promise<boolean> {
  return (await readIncludeSeen(visitor)).saved;
}

test("ticked for somebody who has never pressed it", async () => {
  const { visitor } = await signedIn();
  assert.equal(await saved(visitor), true);
});

test("unticked is kept, read back on the next visit, and ticked again when pressed again", async () => {
  const { cookie, visitor } = await signedIn();

  const response = await press("false", { cookie });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(typeof (await response.json()).keptAt, "number");
  assert.equal(await saved(visitor), false);

  assert.equal((await press("true", { cookie })).status, 200);
  assert.equal(await saved(visitor), true);

  // The last answer is the one kept, however many came before it.
  for (const value of ["false", "false", "true", "false"]) await press(value, { cookie });
  assert.equal(await saved(visitor), false);
});

test("a read is dated before it reads and a press after it lands, by the server's clock", async () => {
  // What lets the browser tell a Stream drawn before its press from one drawn
  // after (`stream-settings/browser.ts`): a read that began before the write
  // is never dated after it, and a read that began after it always is.
  const { cookie, visitor } = await signedIn();

  const before = await readIncludeSeen(visitor);
  const { keptAt } = (await (await press("false", { cookie })).json()) as { keptAt: number };
  await new Promise((resolve) => setTimeout(resolve, 2));
  const after = await readIncludeSeen(visitor);

  assert.ok(before.readAt <= keptAt, "a read from before the press is dated after it");
  assert.equal(before.saved, true);
  assert.ok(after.readAt > keptAt, "a read from after the press is dated before it");
  assert.equal(after.saved, false);
});

test("kept for the account, so every browser it signs in with opens the same way", async () => {
  const id = `google:stream-${++people}`;
  const laptop = await signedIn(id);
  const phone = await signedIn(id);

  assert.equal((await press("false", { cookie: laptop.cookie })).status, 200);
  assert.equal(await saved(phone.visitor), false, "the other browser opens ticked");

  assert.equal((await press("true", { cookie: phone.cookie })).status, 200);
  assert.equal(await saved(laptop.visitor), true);
});

test("one person's answer is nobody else's", async () => {
  const one = await signedIn();
  const other = await signedIn();

  await press("false", { cookie: one.cookie });
  assert.equal(await saved(one.visitor), false);
  assert.equal(await saved(other.visitor), true, "somebody else's box was unticked");
});

test("without a session nothing is kept", async () => {
  const response = await press("false");
  assert.equal(response.status, 401);

  const { cookie, visitor } = await signedIn();
  await (await webStore()).endSession(cookie.slice(cookie.indexOf("=") + 1));
  assert.equal((await press("false", { cookie })).status, 401, "a signed-out browser kept an answer");
  assert.equal(await saved(visitor), true);
});

test("a press that did not come from a page of ours keeps nothing", async () => {
  const { cookie, visitor } = await signedIn();

  for (const origin of ["https://evil.example", null]) {
    const response = await press("false", { cookie, origin });
    assert.equal(response.status, 403, `origin ${origin} was let through`);
  }
  assert.equal(await saved(visitor), true);
});

test("anything but true or false is refused, and keeps nothing", async () => {
  const { cookie, visitor } = await signedIn();

  for (const value of ["", "yes", "0", "TRUE", null]) {
    const response = await press(value, { cookie });
    assert.equal(response.status, 400, `${JSON.stringify(value)} was kept`);
  }
  assert.equal(await saved(visitor), true);
});

test("a setting that cannot be read leaves the box ticked, and says why without saying whose", async () => {
  const { cookie, visitor } = await signedIn();
  await press("false", { cookie });

  const said: string[] = [];
  const error = console.error;
  console.error = (...args: unknown[]) => said.push(args.join(" "));
  await driver.exec("ALTER TABLE stream_settings RENAME TO stream_settings_away");
  try {
    // Ticked, and dated before everything: a guess never outranks a press the
    // browser knows was kept.
    assert.deepEqual(await readIncludeSeen(visitor), { saved: true, readAt: 0 });
    assert.equal((await press("true", { cookie })).status, 500);
  } finally {
    await driver.exec("ALTER TABLE stream_settings_away RENAME TO stream_settings");
    console.error = error;
  }

  assert.equal(said.length, 2);
  assert.match(said[0]!, /^\[tonight\] stream: could not read the Stream setting: /);
  assert.match(said[1]!, /^\[tonight\] stream: could not keep the Stream setting: /);
  assert.equal(said.some((line) => line.includes(visitor.user.id)), false, "a failure named the user");

  // Nothing was lost on the way: the answer kept before is still the answer.
  assert.equal(await saved(visitor), false);
});
