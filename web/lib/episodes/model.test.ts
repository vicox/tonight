import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  addRound,
  beginEpisode,
  checkEpisode,
  correctEpisode,
  EpisodeError,
  FACTS_ARE_PER_OFFER,
  isEmpty,
  MAX_OFFERED,
  MAX_OFFERS_PER_EVENING,
  MAX_PASS_REASON_LENGTH,
  MAX_REQUEST_LENGTH,
  shown,
  stated,
  UNKNOWN,
  type Episode,
  type Offer,
  type OfferedFilm,
} from "./model.ts";

/**
 * The episode model: a film evening, offer by offer.
 *
 * Most of these contracts are about what the model refuses to express. Four
 * facts per film, each known or not, with one entailment (finished ⇒ started)
 * and nothing else derived — so the tests below try the routes by which a wrong
 * history could be reached anyway: inferring one fact from another, a later
 * round overwriting what was said, a correction quietly dropping a statement,
 * and two spellings of one film being treated as one.
 */

const prisoners: OfferedFilm = { title: "Prisoners", year: 2013, lead: true };
const zodiac: OfferedFilm = { title: "Zodiac", year: 2007, lead: false };

const evening = (): Episode =>
  beginEpisode({ request: "something tense tonight", offered: [prisoners, zodiac] });

/** One offer of an evening, by title. */
const offerOf = (episode: Episode, title: string): Offer => {
  const found = episode.offers.find((offer) => offer.title === title);
  assert.ok(found, `${title} is not in the evening`);
  return found;
};

const titles = (episode: Episode) => episode.offers.map((offer) => offer.title);

/** A fact as the user said it, or `undefined` when unknown. */
const value = (fact: Offer["chosen"]): boolean | undefined => (fact.known ? fact.value : undefined);

/** Asserts `work` refuses with an EpisodeError and leaves `episode` exactly as it was. */
function refused(episode: Episode, work: () => unknown, message?: RegExp): void {
  const before = structuredClone(episode);
  assert.throws(
    () => work(),
    (error: unknown) => {
      assert.ok(error instanceof EpisodeError, `refused with ${String(error)} rather than an EpisodeError`);
      if (message) assert.match(error.message, message);
      return true;
    },
  );
  assert.deepEqual(episode, before, "a refusal changed the evening it was given");
}

describe("beginning an evening", () => {
  test("an evening records what was asked, in their words, and what was offered", () => {
    const episode = beginEpisode({ request: "  something tense tonight  ", offered: [prisoners, zodiac] });
    assert.equal(episode.request, "something tense tonight");
    assert.equal(episode.requestSource, "observed");
    assert.equal(episode.offeredSource, "observed");
    assert.deepEqual(titles(episode), ["Prisoners", "Zodiac"]);
    for (const offer of episode.offers) assert.equal(offer.offered, true);
    assert.equal(offerOf(episode, "Prisoners").lead, true);
    assert.equal(offerOf(episode, "Zodiac").lead, false);
  });

  test("a recommendation implies nothing: every fact starts unknown", () => {
    for (const offer of evening().offers) {
      assert.deepEqual(
        { chosen: offer.chosen, started: offer.started, finished: offer.finished, passed: offer.passed },
        { chosen: UNKNOWN, started: UNKNOWN, finished: UNKNOWN, passed: UNKNOWN },
      );
      assert.equal("passReason" in offer, false);
    }
  });

  test("an answer that named no film is a fact too", () => {
    const episode = beginEpisode({ request: "anything", offered: [] });
    assert.deepEqual(episode.offers, []);
    assert.equal(isEmpty(episode), false, "an evening with a request is not empty");
  });

  test("films Tonight offered need the request they answered", () => {
    assert.throws(() => beginEpisode({ offered: [prisoners] }), EpisodeError);
  });

  test("an evening with neither a request nor a film is refused", () => {
    assert.throws(() => beginEpisode({}), EpisodeError);
    assert.throws(() => beginEpisode({ offered: [], offers: [] }), EpisodeError);
  });

  test("an evening of their own is recorded from what they said, with no request", () => {
    const episode = beginEpisode({ offers: [{ title: "Heat", year: 1995, started: true }] });
    assert.equal(episode.request, null);
    assert.equal(episode.offers.length, 1);
    const heat = offerOf(episode, "Heat");
    assert.equal(heat.offered, false, "a film they brought up was recorded as Tonight's");
    assert.equal(heat.lead, false);
    assert.deepEqual(heat.started, stated(true));
    assert.equal(heat.chosen.known, false, "starting implied choosing");
  });

  test("a statement in the same breath as the offers lands on the offer it names", () => {
    const episode = beginEpisode({
      request: "something tense",
      offered: [prisoners, zodiac],
      offers: [{ title: "Zodiac", year: 2007, chosen: true }],
    });
    assert.equal(episode.offers.length, 2, "the statement added a second Zodiac");
    assert.equal(value(offerOf(episode, "Zodiac").chosen), true);
    assert.equal(offerOf(episode, "Zodiac").offered, true);
  });

  test("a new evening's statements only add: null is refused", () => {
    assert.throws(
      () => beginEpisode({ request: "x", offered: [prisoners], offers: [{ title: "Prisoners", year: 2013, chosen: null }] }),
      EpisodeError,
    );
  });

  test("the request and the round are bounded, as before", () => {
    assert.throws(() => beginEpisode({ request: "x".repeat(MAX_REQUEST_LENGTH + 1) }), EpisodeError);
    assert.throws(() => beginEpisode({ request: "   " }), EpisodeError);
    const many = Array.from({ length: MAX_OFFERED + 1 }, (_, at) => ({ title: `Film ${String(at)}`, year: 2000, lead: false }));
    assert.throws(() => beginEpisode({ request: "x", offered: many }), EpisodeError);
    assert.throws(
      () => beginEpisode({ request: "x", offered: [prisoners, { ...zodiac, lead: true }] }),
      /one lead/u,
    );
  });

  test("a statement that is not about an offer's facts is refused, not dropped", () => {
    assert.throws(
      () => beginEpisode({ offers: [{ title: "Heat", year: 1995, watched: true } as never] }),
      /Not a fact about an offer: watched/u,
    );
    assert.throws(
      () => beginEpisode({ offers: [{ title: "Heat", year: 1995, started: "yes" } as never] }),
      EpisodeError,
    );
  });
});

describe("identity, rounds, order and lead", () => {
  test("a round appends the films it offers, after the ones already there", () => {
    const later = addRound(evening(), { offered: [{ title: "Heat", year: 1995, lead: true }] });
    assert.deepEqual(titles(later), ["Prisoners", "Zodiac", "Heat"]);
    assert.equal(offerOf(later, "Heat").offered, true);
    assert.equal(offerOf(later, "Heat").lead, true);
    assert.equal(later.request, "something tense tonight", "a round replaced the evening's request");
  });

  test("a film offered again keeps its place and what was said about it, and gains the lead", () => {
    const said = correctEpisode(evening(), { offers: [{ title: "Zodiac", year: 2007, chosen: true }] });
    const later = addRound(said, {
      offered: [
        { title: "Heat", year: 1995, lead: false },
        { title: "Zodiac", year: 2007, lead: true },
      ],
    });
    assert.deepEqual(titles(later), ["Prisoners", "Zodiac", "Heat"], "a re-offer moved the film");
    const again = offerOf(later, "Zodiac");
    assert.equal(again.lead, true, "leading this round did not mark it");
    assert.equal(value(again.chosen), true, "a re-offer lost what they said");
    assert.equal(offerOf(later, "Prisoners").lead, true, "an earlier round's lead was cleared");
  });

  test("a re-offer never clears a lead", () => {
    const later = addRound(evening(), { offered: [{ ...prisoners, lead: false }] });
    assert.equal(offerOf(later, "Prisoners").lead, true);
  });

  test("a film they brought up becomes offered when Tonight offers it, and keeps its facts", () => {
    const theirs = correctEpisode(evening(), { offers: [{ title: "Heat", year: 1995, chosen: true }] });
    assert.equal(offerOf(theirs, "Heat").offered, false);

    const later = addRound(theirs, { offered: [{ title: "Heat", year: 1995, lead: true }] });
    const heat = offerOf(later, "Heat");
    assert.equal(heat.offered, true);
    assert.equal(heat.lead, true);
    assert.equal(value(heat.chosen), true);
    assert.deepEqual(titles(later), ["Prisoners", "Zodiac", "Heat"]);
  });

  test("a round that names a film twice is refused", () => {
    const episode = evening();
    refused(episode, () =>
      addRound(episode, {
        offered: [
          { title: "Heat", year: 1995, lead: false },
          { title: "Heat", year: 1995, lead: false },
        ],
      }),
    );
  });

  test("a round that adds nothing is refused", () => {
    const episode = evening();
    refused(episode, () => addRound(episode, {}));
    refused(episode, () => addRound(episode, { offered: [], offers: [] }));
  });

  test("a round does not carry a request: the evening keeps the one it was recorded with", () => {
    const episode = evening();
    refused(episode, () => addRound(episode, { request: "something else", offered: [] } as never));
  });

  test("a round holds at most ten films, and the evening at most fifty", () => {
    const episode = evening();
    const eleven = Array.from({ length: MAX_OFFERED + 1 }, (_, at) => ({ title: `Round ${String(at)}`, year: 2001, lead: false }));
    refused(episode, () => addRound(episode, { offered: eleven }));

    let full = evening();
    let made = full.offers.length;
    while (made < MAX_OFFERS_PER_EVENING) {
      const batch = Array.from({ length: Math.min(MAX_OFFERED, MAX_OFFERS_PER_EVENING - made) }, (_, at) => ({
        title: `Film ${String(made + at)}`,
        year: 2000,
        lead: false,
      }));
      full = addRound(full, { offered: batch });
      made += batch.length;
    }
    assert.equal(full.offers.length, MAX_OFFERS_PER_EVENING);
    refused(full, () => addRound(full, { offered: [{ title: "One too many", year: 2000, lead: false }] }), /at most 50/u);
    refused(full, () => correctEpisode(full, { offers: [{ title: "Theirs too", year: 2000, started: true }] }), /at most 50/u);
    // A film already there is not one more.
    assert.equal(addRound(full, { offered: [{ title: "Film 10", year: 2000, lead: true }] }).offers.length, MAX_OFFERS_PER_EVENING);
  });

  test("identity is the exact title and year: case or a far difference are two films", () => {
    const long = "A".repeat(200);
    const episode = beginEpisode({
      request: "x",
      offered: [
        { title: "Dune", year: 2021, lead: false },
        { title: "DUNE", year: 2021, lead: false },
        { title: `${long}x`, year: 2000, lead: false },
        { title: `${long}y`, year: 2000, lead: false },
        { title: "Dune", year: 1984, lead: false },
      ],
    });
    assert.equal(episode.offers.length, 5, "two spellings were folded into one film");
    const said = correctEpisode(episode, { offers: [{ title: "DUNE", year: 2021, chosen: true }] });
    assert.equal(value(offerOf(said, "DUNE").chosen), true);
    assert.equal(offerOf(said, "Dune").chosen.known, false, "a statement about DUNE landed on Dune");
  });

  test("a stored evening holding one film twice is refused whole", () => {
    const episode = evening();
    const twice: Episode = { ...episode, offers: [...episode.offers, { ...episode.offers[0]! }] };
    assert.throws(() => checkEpisode(twice), /twice/u);
  });
});

describe("the four facts", () => {
  test("F1: each fact stands alone — choosing is not starting, starting is not choosing", () => {
    const chose = correctEpisode(evening(), { offers: [{ title: "Zodiac", year: 2007, chosen: true }] });
    const zod = offerOf(chose, "Zodiac");
    assert.equal(value(zod.chosen), true);
    assert.deepEqual([zod.started, zod.finished, zod.passed], [UNKNOWN, UNKNOWN, UNKNOWN], "choosing implied another fact");

    const began = correctEpisode(evening(), { offers: [{ title: "Zodiac", year: 2007, started: true }] });
    assert.equal(offerOf(began, "Zodiac").chosen.known, false, "starting implied choosing");
  });

  test("F1: a stated no is a no, and different from unknown", () => {
    const said = correctEpisode(evening(), { offers: [{ title: "Zodiac", year: 2007, started: false }] });
    assert.deepEqual(offerOf(said, "Zodiac").started, stated(false));
    assert.deepEqual(offerOf(said, "Prisoners").started, UNKNOWN);
    assert.notDeepEqual(offerOf(said, "Zodiac").started, offerOf(said, "Prisoners").started);
  });

  test("several films may be chosen, started and finished in one evening", () => {
    const said = correctEpisode(evening(), {
      offers: [
        { title: "Prisoners", year: 2013, chosen: true, finished: true },
        { title: "Zodiac", year: 2007, chosen: true, started: true, finished: false },
      ],
    });
    for (const offer of said.offers) {
      assert.equal(value(offer.chosen), true);
      assert.equal(value(offer.started), true);
    }
    assert.equal(value(offerOf(said, "Prisoners").finished), true);
    assert.equal(value(offerOf(said, "Zodiac").finished), false);
  });

  test("statements merge one film at a time, and null takes a fact back to unknown", () => {
    const first = correctEpisode(evening(), { offers: [{ title: "Prisoners", year: 2013, chosen: true }] });
    const second = correctEpisode(first, { offers: [{ title: "Zodiac", year: 2007, started: true }] });
    assert.equal(value(offerOf(second, "Prisoners").chosen), true, "a statement about Zodiac erased one about Prisoners");
    assert.equal(value(offerOf(second, "Zodiac").started), true);

    const taken = correctEpisode(second, { offers: [{ title: "Prisoners", year: 2013, chosen: null }] });
    assert.deepEqual(offerOf(taken, "Prisoners").chosen, UNKNOWN, "a retraction left a value behind");
    assert.equal(value(offerOf(taken, "Zodiac").started), true, "a retraction moved another film");

    const changed = correctEpisode(taken, { offers: [{ title: "Zodiac", year: 2007, started: false }] });
    assert.deepEqual(offerOf(changed, "Zodiac").started, stated(false));
  });

  describe("F2 — finished ⇒ started, exactly", () => {
    const withStarted = (started: boolean) =>
      correctEpisode(evening(), { offers: [{ title: "Zodiac", year: 2007, started }] });

    test("a stored no plus started: true and finished: true together is accepted", () => {
      const said = correctEpisode(withStarted(false), {
        offers: [{ title: "Zodiac", year: 2007, started: true, finished: true }],
      });
      assert.equal(value(offerOf(said, "Zodiac").started), true);
      assert.equal(value(offerOf(said, "Zodiac").finished), true);
    });

    test("a stored no plus finished: true alone is refused", () => {
      const episode = withStarted(false);
      refused(episode, () => correctEpisode(episode, { offers: [{ title: "Zodiac", year: 2007, finished: true }] }), /not started/u);
    });

    test("started: null with finished: true is refused", () => {
      const episode = evening();
      refused(episode, () =>
        correctEpisode(episode, { offers: [{ title: "Zodiac", year: 2007, started: null, finished: true }] }),
      );
      refused(episode, () =>
        correctEpisode(episode, { offers: [{ title: "Zodiac", year: 2007, started: false, finished: true }] }),
      );
    });

    test("finished: true over an unknown start records the start", () => {
      const said = correctEpisode(evening(), { offers: [{ title: "Zodiac", year: 2007, finished: true }] });
      assert.deepEqual(offerOf(said, "Zodiac").started, stated(true));
      assert.equal(offerOf(said, "Zodiac").chosen.known, false, "finishing implied choosing");
    });

    test("taking the finish back afterwards keeps the start", () => {
      const finished = correctEpisode(evening(), { offers: [{ title: "Zodiac", year: 2007, finished: true }] });
      const taken = correctEpisode(finished, { offers: [{ title: "Zodiac", year: 2007, finished: null }] });
      assert.deepEqual(offerOf(taken, "Zodiac").finished, UNKNOWN);
      assert.deepEqual(offerOf(taken, "Zodiac").started, stated(true));
    });

    test("taking the start back while the finish stands is refused", () => {
      const finished = correctEpisode(evening(), { offers: [{ title: "Zodiac", year: 2007, finished: true }] });
      refused(finished, () => correctEpisode(finished, { offers: [{ title: "Zodiac", year: 2007, started: null }] }));
      refused(finished, () => correctEpisode(finished, { offers: [{ title: "Zodiac", year: 2007, started: false }] }));
      const both = correctEpisode(finished, {
        offers: [{ title: "Zodiac", year: 2007, started: null, finished: null }],
      });
      assert.deepEqual(offerOf(both, "Zodiac").started, UNKNOWN);
    });

    test("finished: false implies nothing about the start", () => {
      const said = correctEpisode(evening(), { offers: [{ title: "Zodiac", year: 2007, finished: false }] });
      assert.deepEqual(offerOf(said, "Zodiac").started, UNKNOWN);
      assert.deepEqual(offerOf(said, "Zodiac").finished, stated(false));
    });
  });

  describe("F3 — a pass excludes taking", () => {
    test("passed together with chosen or started is refused", () => {
      const episode = evening();
      for (const taken of [{ chosen: true }, { started: true }, { finished: true }]) {
        refused(episode, () =>
          correctEpisode(episode, { offers: [{ title: "Zodiac", year: 2007, passed: true, ...taken }] }),
          /passed/u,
        );
      }
    });

    test("passing on a film already chosen is refused, and changing their mind clears the pass", () => {
      const chose = correctEpisode(evening(), { offers: [{ title: "Zodiac", year: 2007, chosen: true }] });
      refused(chose, () => correctEpisode(chose, { offers: [{ title: "Zodiac", year: 2007, passed: true }] }));

      const passed = correctEpisode(evening(), {
        offers: [{ title: "Zodiac", year: 2007, passed: true, passReason: "too long" }],
      });
      refused(passed, () => correctEpisode(passed, { offers: [{ title: "Zodiac", year: 2007, started: true }] }));
      const changed = correctEpisode(passed, {
        offers: [{ title: "Zodiac", year: 2007, passed: null, started: true }],
      });
      const zod = offerOf(changed, "Zodiac");
      assert.deepEqual(zod.passed, UNKNOWN);
      assert.equal(value(zod.started), true);
      assert.equal("passReason" in zod, false, "the reason outlived its pass");
    });

    test("a pass is never a no to choosing, and implies nothing else", () => {
      const passed = correctEpisode(evening(), { offers: [{ title: "Zodiac", year: 2007, passed: true }] });
      const zod = offerOf(passed, "Zodiac");
      assert.deepEqual([zod.chosen, zod.started, zod.finished], [UNKNOWN, UNKNOWN, UNKNOWN]);
    });
  });

  describe("F4 — a reason belongs to a pass", () => {
    test("a reason is trimmed, and kept with its pass", () => {
      const passed = correctEpisode(evening(), {
        offers: [{ title: "Zodiac", year: 2007, passed: true, passReason: "  too long tonight  " }],
      });
      assert.equal(offerOf(passed, "Zodiac").passReason, "too long tonight");
    });

    test("a reason without a pass is refused", () => {
      const episode = evening();
      refused(episode, () =>
        correctEpisode(episode, { offers: [{ title: "Zodiac", year: 2007, chosen: true, passReason: "why not" }] }),
        /reason belongs to a pass/u,
      );
      refused(episode, () =>
        correctEpisode(episode, { offers: [{ title: "Zodiac", year: 2007, passed: false, passReason: "why not" }] }),
      );
    });

    test("a blank or overlong reason is refused", () => {
      const episode = evening();
      refused(episode, () =>
        correctEpisode(episode, { offers: [{ title: "Zodiac", year: 2007, passed: true, passReason: "   " }] }),
      );
      refused(episode, () =>
        correctEpisode(episode, {
          offers: [{ title: "Zodiac", year: 2007, passed: true, passReason: "x".repeat(MAX_PASS_REASON_LENGTH + 1) }],
        }),
      );
    });

    test("taking the pass back takes the reason with it; null takes the reason alone", () => {
      const passed = correctEpisode(evening(), {
        offers: [{ title: "Zodiac", year: 2007, passed: true, passReason: "too long" }],
      });
      const noReason = correctEpisode(passed, { offers: [{ title: "Zodiac", year: 2007, passReason: null }] });
      assert.equal(value(offerOf(noReason, "Zodiac").passed), true);
      assert.equal("passReason" in offerOf(noReason, "Zodiac"), false);

      const unpassed = correctEpisode(passed, { offers: [{ title: "Zodiac", year: 2007, passed: null }] });
      assert.equal("passReason" in offerOf(unpassed, "Zodiac"), false, "the reason outlived its pass");
    });
  });

  describe("F5 — a film they brought up lives while something they said stands", () => {
    test("a film not offered is added as theirs, at the end, from what they said", () => {
      const said = correctEpisode(evening(), { offers: [{ title: "Heat", year: 1995, started: true }] });
      assert.deepEqual(titles(said), ["Prisoners", "Zodiac", "Heat"]);
      assert.equal(offerOf(said, "Heat").offered, false);
      assert.equal(offerOf(said, "Heat").lead, false);
    });

    test("adding a film needs at least one fact", () => {
      const episode = evening();
      refused(episode, () => correctEpisode(episode, { offers: [{ title: "Heat", year: 1995 }] }));
      refused(episode, () => correctEpisode(episode, { offers: [{ title: "Heat", year: 1995, chosen: null }] }));
      refused(episode, () =>
        correctEpisode(episode, { offers: [{ title: "Heat", year: 1995, passReason: "not tonight" }] }),
      );
    });

    test("taking back the last fact of a film they brought up removes it", () => {
      const theirs = correctEpisode(evening(), { offers: [{ title: "Heat", year: 1995, chosen: true, started: true }] });
      const one = correctEpisode(theirs, { offers: [{ title: "Heat", year: 1995, chosen: null }] });
      assert.ok(one.offers.some((offer) => offer.title === "Heat"), "a fact still stood, yet the film went");
      const none = correctEpisode(one, { offers: [{ title: "Heat", year: 1995, started: null }] });
      assert.deepEqual(titles(none), ["Prisoners", "Zodiac"]);
    });

    test("an offered film stays when everything said about it is taken back", () => {
      const said = correctEpisode(evening(), { offers: [{ title: "Zodiac", year: 2007, chosen: true }] });
      const taken = correctEpisode(said, { offers: [{ title: "Zodiac", year: 2007, chosen: null }] });
      assert.deepEqual(titles(taken), ["Prisoners", "Zodiac"]);
    });

    test("the rule applies after the whole call has merged", () => {
      const theirs = correctEpisode(evening(), { offers: [{ title: "Heat", year: 1995, chosen: true }] });
      // Taken back and said again in one call: still there.
      const kept = correctEpisode(theirs, {
        offered: [prisoners, zodiac],
        offers: [{ title: "Heat", year: 1995, chosen: null, started: true }],
      });
      assert.equal(value(offerOf(kept, "Heat").started), true);
    });
  });

  describe("F6 — an evening with no request lives while it holds a film", () => {
    test("taking back the last fact of the only film leaves nothing to record", () => {
      const own = beginEpisode({ offers: [{ title: "Heat", year: 1995, started: true }] });
      const after = correctEpisode(own, { offers: [{ title: "Heat", year: 1995, started: null }] });
      assert.equal(isEmpty(after), true, "an evening of nothing was returned as something");
    });

    test("an evening with a request and no films is still an evening", () => {
      const after = correctEpisode(evening(), { offered: [] });
      assert.deepEqual(after.offers, []);
      assert.equal(isEmpty(after), false);
    });

    test("an evening of their own can gain a request, and a request cannot be removed", () => {
      const own = beginEpisode({ offers: [{ title: "Heat", year: 1995, started: true }] });
      const asked = correctEpisode(own, { request: "something with a heist" });
      assert.equal(asked.request, "something with a heist");
      assert.equal(asked.requestSource, "stated");
      refused(asked, () => correctEpisode(asked, { request: null }));
    });
  });

  describe("F7 — one statement per film per array", () => {
    test("the same film twice in offers is refused", () => {
      const episode = evening();
      refused(episode, () =>
        correctEpisode(episode, {
          offers: [
            { title: "Zodiac", year: 2007, chosen: true },
            { title: "Zodiac", year: 2007, started: true },
          ],
        }),
        /twice/u,
      );
    });

    test("the same film twice in offered is refused", () => {
      const episode = evening();
      refused(episode, () => correctEpisode(episode, { offered: [zodiac, zodiac] }), /twice/u);
    });

    test("the same film in offered and in offers is an offer and what they said about it", () => {
      const episode = beginEpisode({
        request: "x",
        offered: [{ title: "Heat", year: 1995, lead: true }],
        offers: [{ title: "Heat", year: 1995, chosen: true }],
      });
      assert.equal(episode.offers.length, 1);
      assert.equal(offerOf(episode, "Heat").offered, true);
      assert.equal(value(offerOf(episode, "Heat").chosen), true);
    });
  });
});

describe("correcting the offered set", () => {
  test("the offered set becomes exactly what was given, with leads as given, and is stated", () => {
    const fixed = correctEpisode(evening(), {
      offered: [
        { title: "Zodiac", year: 2007, lead: true },
        { title: "Cure", year: 1997, lead: true },
      ],
    });
    assert.deepEqual(titles(fixed), ["Zodiac", "Cure"], "a film with nothing said stayed after leaving the set");
    assert.equal(offerOf(fixed, "Zodiac").lead, true);
    assert.equal(offerOf(fixed, "Cure").lead, true, "several leads across rounds were refused");
    assert.equal(fixed.offeredSource, "stated");
    assert.equal(fixed.requestSource, "observed", "correcting the offers moved the request's provenance");
  });

  test("a film leaving the set while they chose it stays as theirs", () => {
    const chose = correctEpisode(evening(), { offers: [{ title: "Prisoners", year: 2013, chosen: true }] });
    const fixed = correctEpisode(chose, { offered: [zodiac] });
    const kept = offerOf(fixed, "Prisoners");
    assert.equal(kept.offered, false);
    assert.equal(kept.lead, false, "a film Tonight did not offer still led");
    assert.equal(value(kept.chosen), true, "their choice went with Tonight's correction");
  });

  test("a film coming back into the set keeps its first place", () => {
    const chose = correctEpisode(evening(), { offers: [{ title: "Prisoners", year: 2013, chosen: true }] });
    const left = correctEpisode(chose, { offered: [zodiac] });
    const back = correctEpisode(left, { offered: [zodiac, prisoners, { title: "Cure", year: 1997, lead: false }] });
    assert.deepEqual(titles(back), ["Prisoners", "Zodiac", "Cure"]);
    assert.equal(offerOf(back, "Prisoners").offered, true);
    assert.equal(value(offerOf(back, "Prisoners").chosen), true);
  });
});

describe("a later round only adds", () => {
  /** An evening with Prisoners started and Zodiac passed on, with a reason. */
  const said = () =>
    correctEpisode(evening(), {
      offers: [
        { title: "Prisoners", year: 2013, started: true },
        { title: "Zodiac", year: 2007, passed: true, passReason: "too long" },
      ],
    });

  test("taking something back is refused and routed to correct_episode", () => {
    const episode = said();
    refused(episode, () => addRound(episode, { offers: [{ title: "Prisoners", year: 2013, started: null }] }), /correct_episode/u);
    refused(episode, () => addRound(episode, { offers: [{ title: "Zodiac", year: 2007, passReason: null }] }), /correct_episode/u);
  });

  test("changing a known fact is refused and routed to correct_episode", () => {
    const episode = said();
    refused(episode, () => addRound(episode, { offers: [{ title: "Prisoners", year: 2013, started: false }] }), /correct_episode/u);
    refused(episode, () => addRound(episode, { offers: [{ title: "Zodiac", year: 2007, passed: false }] }), /correct_episode/u);
  });

  test("replacing a reason is refused; the same reason, trimmed, is a no-op", () => {
    const episode = said();
    refused(episode, () =>
      addRound(episode, { offers: [{ title: "Zodiac", year: 2007, passReason: "boring" }] }),
      /correct_episode/u,
    );
    const same = addRound(episode, { offers: [{ title: "Zodiac", year: 2007, passReason: "  too long  " }] });
    assert.deepEqual(same.offers, episode.offers);
  });

  test("restating a stored value changes nothing", () => {
    const episode = said();
    const same = addRound(episode, {
      offers: [
        { title: "Prisoners", year: 2013, started: true },
        { title: "Zodiac", year: 2007, passed: true },
      ],
    });
    assert.deepEqual(same.offers, episode.offers);
  });

  test("filling what is unknown is accepted", () => {
    const episode = said();
    const more = addRound(episode, { offers: [{ title: "Prisoners", year: 2013, finished: true, chosen: true }] });
    const pri = offerOf(more, "Prisoners");
    assert.equal(value(pri.finished), true);
    assert.equal(value(pri.chosen), true);
    assert.equal(value(pri.started), true);
  });

  test("a round mixing new offers with a forbidden change is refused whole", () => {
    const episode = said();
    refused(episode, () =>
      addRound(episode, {
        offered: [{ title: "Heat", year: 1995, lead: true }],
        offers: [{ title: "Prisoners", year: 2013, started: false }],
      }),
    );
  });

  test("a film they bring up in a round is added as theirs", () => {
    const more = addRound(said(), { offers: [{ title: "Heat", year: 1995, started: true }] });
    assert.equal(offerOf(more, "Heat").offered, false);
  });
});

describe("corrections", () => {
  test("the request is replaced in their words and becomes stated", () => {
    const fixed = correctEpisode(evening(), { request: "  something quiet  " });
    assert.equal(fixed.request, "something quiet");
    assert.equal(fixed.requestSource, "stated");
    assert.equal(fixed.offeredSource, "observed");
  });

  test("correcting nothing is refused", () => {
    const episode = evening();
    refused(episode, () => correctEpisode(episode, {}));
  });

  test("the old evening-level fields are refused with where the facts went", () => {
    const episode = evening();
    for (const retired of [{ chosen: { title: "Zodiac", year: 2007 } }, { watched: true }, { finished: false }]) {
      assert.throws(
        () => correctEpisode(episode, retired as never),
        (error: unknown) => error instanceof EpisodeError && error.message === FACTS_ARE_PER_OFFER,
      );
    }
    assert.deepEqual(episode, evening());
  });

  test("a correction refused anywhere changes nothing anywhere", () => {
    const episode = evening();
    refused(episode, () =>
      correctEpisode(episode, {
        request: "a request that must not land",
        offers: [{ title: "Zodiac", year: 2007, passed: true, chosen: true }],
      }),
    );
  });
});

describe("how an evening is shown", () => {
  test("an evening with a request shows where it came from", () => {
    const shownEvening = shown(evening());
    assert.equal(shownEvening.requestSource, "observed");
  });

  test("an evening of their own shows no request source", () => {
    const own = shown(beginEpisode({ offers: [{ title: "Heat", year: 1995, started: true }] }));
    assert.equal(own.request, null);
    assert.equal("requestSource" in own, false);
  });

  test("an offer carries its facts and nothing about taste", () => {
    const passed = correctEpisode(evening(), {
      offers: [{ title: "Zodiac", year: 2007, passed: true, passReason: "too long" }],
    });
    assert.deepEqual(Object.keys(offerOf(passed, "Zodiac")).sort(), [
      "chosen",
      "finished",
      "lead",
      "offered",
      "passReason",
      "passed",
      "started",
      "title",
      "year",
    ]);
    assert.deepEqual(Object.keys(passed).sort(), ["offeredSource", "offers", "request", "requestSource"]);
  });
});
