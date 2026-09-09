import assert from "node:assert/strict";
import test from "node:test";

import { REFUSED, UNREACHABLE, endpoint, remove } from "./manage.ts";

/**
 * What pressing the red button does.
 *
 * The confirmation dialog's whole effect, with a stand-in for `fetch`: which
 * request leaves, and what each kind of answer means to the reader. Written
 * against the function the button calls rather than against the button, because
 * this project has no browser in its tests — what the button is wired to is
 * `overview.test.ts`, and that it lands where a person can see it is the pass
 * through a real browser.
 */

/** One recorded request, and the answer to give back for it. */
function stub(answer: Partial<Response> & { throws?: boolean }) {
  const sent: { url: string; init: RequestInit }[] = [];
  const send = (async (url: string | URL | Request, init: RequestInit = {}) => {
    sent.push({ url: String(url), init });
    if (answer.throws) throw new TypeError("Failed to fetch");
    return {
      ok: answer.ok ?? true,
      json: answer.json ?? (async () => ({})),
    } as Response;
  }) as typeof fetch;
  return { sent, send };
}

test("confirming a delete asks for exactly that row to be removed", async () => {
  const genre = stub({ ok: true });
  assert.deepEqual(await remove("genre", "Slow Burn", genre.send), { removed: true });
  assert.equal(genre.sent.length, 1, "the press sent something other than one request");
  assert.equal(genre.sent[0].url, "/api/genres/Slow%20Burn");
  assert.equal(genre.sent[0].init.method, "DELETE");

  // The two kinds go to their own endpoint, and nothing else about them differs.
  const mix = stub({ ok: true });
  assert.deepEqual(await remove("mix", "Quiet Dread", mix.send), { removed: true });
  assert.equal(mix.sent[0].url, "/api/mixes/Quiet%20Dread");
  assert.equal(mix.sent[0].init.method, "DELETE");
});

test("a name is addressed as itself, whatever the user called it", () => {
  // A name is the user's own text and can hold anything a URL cares about. It
  // addresses a row, so it is escaped rather than trusted to be tidy.
  assert.equal(endpoint("genre", "Sci-Fi / Horror"), "/api/genres/Sci-Fi%20%2F%20Horror");
  assert.equal(endpoint("mix", "100% Nonsense?"), "/api/mixes/100%25%20Nonsense%3F");
  assert.equal(endpoint("genre", "Öl & Wasser"), "/api/genres/%C3%96l%20%26%20Wasser");
});

test("a refusal is the store's own sentence, not one written here", async () => {
  const refused = stub({
    ok: false,
    json: async () => ({ message: "Two mixes are built from Slow Burn." }),
  });
  assert.deepEqual(await remove("genre", "Slow Burn", refused.send), {
    removed: false,
    problem: "Two mixes are built from Slow Burn.",
  });
});

test("an answer with no reason in it still says something true", async () => {
  // Nothing to quote, and nothing known about whether the write landed — so the
  // sentence sends the reader to look rather than claiming either way.
  const silent = stub({ ok: false, json: async () => ({}) });
  assert.deepEqual(await remove("mix", "Quiet Dread", silent.send), {
    removed: false,
    problem: REFUSED,
  });

  // Including an answer that is not JSON at all, which is a proxy or a crash.
  const rubbish = stub({
    ok: false,
    json: async () => {
      throw new SyntaxError("Unexpected token <");
    },
  });
  assert.deepEqual(await remove("mix", "Quiet Dread", rubbish.send), {
    removed: false,
    problem: REFUSED,
  });
});

test("a request that never got through is not reported as a deletion", async () => {
  // The one answer that must not be `removed: true`: the dialog would close and
  // the page re-render over a model nothing had happened to.
  const offline = stub({ throws: true });
  assert.deepEqual(await remove("genre", "Slow Burn", offline.send), {
    removed: false,
    problem: UNREACHABLE,
  });
});
