import assert from "node:assert/strict";
import test from "node:test";

import { operator } from "./legal.ts";

/**
 * The rule the three legal pages rest on: an incomplete configuration yields no
 * page rather than a page with gaps.
 *
 * § 5 DDG and Art. 13 GDPR require a real name and an address at which the
 * operator can be served. A disclosure missing either is not a lesser one, it is
 * a false one — it looks like the required statement while naming nobody. So
 * `operator()` answers null and the pages answer 404, and the thing being tested
 * here is that no arrangement of half-filled variables can get past it.
 *
 * The prose on those pages is not tested. It is the operator's own statement and
 * changes when the product does; pinning sentences would only make editing them
 * a test failure.
 */

const COMPLETE = {
  LEGAL_NAME: "Erika Mustermann",
  LEGAL_ADDRESS_LINE_1: "Musterstrasse 1",
  LEGAL_ADDRESS_LINE_2: "12345 Musterstadt",
  LEGAL_CONTACT_EMAIL: "support@example.test",
};

/** Runs `work` with exactly this environment, and puts the old one back. */
function withEnv<T>(values: Record<string, string | undefined>, work: () => T): T {
  const mutable = process.env as Record<string, string | undefined>;
  const before = Object.fromEntries(Object.keys(values).map((name) => [name, mutable[name]]));
  try {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete mutable[name];
      else mutable[name] = value;
    }
    return work();
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete mutable[name];
      else mutable[name] = value;
    }
  }
}

test("a fully configured operator is returned, with the country stated", () => {
  const op = withEnv(COMPLETE, operator);

  assert.equal(op?.name, "Erika Mustermann");
  assert.equal(op?.email, "support@example.test");
  // The country is not configurable: these pages cite German statutes and one of
  // them is in German, so a different country would need different texts.
  assert.deepEqual(op?.addressLines, ["Musterstrasse 1", "12345 Musterstadt", "Germany"]);
});

test("any missing or blank field yields no operator at all, not a partial one", () => {
  for (const omitted of Object.keys(COMPLETE)) {
    for (const value of [undefined, "", "   "]) {
      const op = withEnv({ ...COMPLETE, [omitted]: value }, operator);
      assert.equal(op, null, `${omitted} = ${JSON.stringify(value)}`);
    }
  }
});

test("the configured values are read per call, not frozen at import", () => {
  // An operator who fixes a variable in a dashboard should not have to wait for a
  // process to be recycled, which is why nothing here is read at module scope.
  assert.equal(withEnv({ ...COMPLETE, LEGAL_NAME: undefined }, operator), null);
  assert.equal(withEnv(COMPLETE, operator)?.name, "Erika Mustermann");
});
