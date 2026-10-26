import assert from "node:assert/strict";
import test from "node:test";

import { keeper } from "./browser.ts";

/**
 * The box in the browser, with the network replaced by a hand that answers
 * each save when told to — so the order things happen in is the test's, and
 * every case is a moment a real tab can be in: a save on its way, a press
 * waiting behind it, the page being hidden, a Stream handed back by Back, and
 * a Stream read after another browser changed the answer.
 */

/** A sender whose saves stay on their way until answered, in any order. */
function network() {
  const saves: { value: boolean; answer: (keptAt: number | undefined) => Promise<void> }[] = [];
  const send = (value: boolean) =>
    new Promise<number | undefined>((resolve) => {
      saves.push({
        value,
        // Answered, then given the turns the keeper needs to hear it and send the next.
        answer: async (keptAt) => {
          resolve(keptAt);
          for (let turn = 0; turn < 5; turn++) await Promise.resolve();
        },
      });
    });
  return { send, saves, values: () => saves.map((save) => save.value) };
}

test("opens as the server has it until the box is pressed", () => {
  const box = keeper(network().send);
  assert.equal(box.opening(true, 10), true);
  assert.equal(box.opening(false, 10), false);
});

test("a press opens as pressed on any Stream drawn while its save is on its way", () => {
  const net = network();
  const box = keeper(net.send);

  box.keep(false);
  assert.deepEqual(net.values(), [false]);
  assert.equal(box.opening(true, 0), false, "a Stream read before the press");
  assert.equal(box.opening(true, Number.MAX_SAFE_INTEGER), false, "a Stream read before the save landed");
});

test("kept: Back opens as pressed, and a Stream read after the save opens as the account has it", async () => {
  const net = network();
  const box = keeper(net.send);

  box.keep(false);
  await net.saves[0]!.answer(100);

  // Back hands over the Stream read before the press.
  assert.equal(box.opening(true, 50), false);
  // Read at the same moment the save landed: not known to have it.
  assert.equal(box.opening(true, 100), false);
  // Read after it, and another browser has ticked it since: that is the answer.
  assert.equal(box.opening(true, 200), true);
  assert.equal(box.opening(false, 200), false);
});

test("drawn again in place from a new read: another browser's later answer wins, a press not yet saved is kept", async () => {
  // What the box is remounted with when the Stream is read again while it is
  // on screen (`key={readAt}` in `components/include-previously-seen.tsx`).
  const net = network();
  const box = keeper(net.send);

  // The laptop unticks and it is kept; the phone ticks it afterwards; the
  // laptop presses Home while on the Stream, and the server reads it ticked.
  box.keep(false);
  await net.saves[0]!.answer(100);
  assert.equal(box.opening(true, 200), true, "the laptop keeps its own, older answer");

  // The laptop unticks again, and the Stream is read again before that save
  // lands — and again with a further press waiting behind it.
  box.keep(false);
  assert.equal(box.opening(true, 300), false, "a press on its way was overwritten by the read");
  box.keep(true);
  box.keep(false);
  assert.equal(box.opening(true, 400), false, "a waiting press was overwritten by the read");
});

test("not kept: the press is forgotten, and the box opens as the server has it", async () => {
  const net = network();
  const box = keeper(net.send);

  box.keep(false);
  await net.saves[0]!.answer(undefined);
  assert.equal(box.opening(true, 50), true);
});

test("one save at a time, in order, and only the last of the presses that waited", async () => {
  const net = network();
  const box = keeper(net.send);

  box.keep(false);
  box.keep(true);
  box.keep(false);
  box.keep(true);
  assert.deepEqual(net.values(), [false], "a second save went out while the first was on its way");

  await net.saves[0]!.answer(100);
  assert.deepEqual(net.values(), [false, true], "the presses in between were sent, or the last was not");
  assert.equal(box.opening(false, 150), true, "the first save's answer was taken for the last press");

  await net.saves[1]!.answer(200);
  assert.equal(box.opening(false, 150), true);
  assert.equal(box.opening(false, 250), false);
});

test("hidden with a press waiting: it is sent at once, not after a save that may never answer", async () => {
  const net = network();
  const box = keeper(net.send);

  box.keep(false);
  box.keep(true);
  box.flush();
  assert.deepEqual(net.values(), [false, true], "the waiting press was not sent when the page was hidden");

  // The first save answers after; it is not the last press, and nothing is sent again.
  await net.saves[0]!.answer(100);
  assert.deepEqual(net.values(), [false, true]);
  assert.equal(box.opening(false, 150), true);

  await net.saves[1]!.answer(200);
  assert.equal(box.opening(false, 150), true);
  assert.equal(box.opening(false, 250), false);
});

test("hidden with nothing waiting sends nothing", async () => {
  const net = network();
  const box = keeper(net.send);

  box.flush();
  box.keep(false);
  box.flush();
  assert.deepEqual(net.values(), [false]);
  await net.saves[0]!.answer(100);
  box.flush();
  assert.deepEqual(net.values(), [false]);
});

test("a sender that throws is a save not kept, and the next press is still sent", async () => {
  let calls = 0;
  const box = keeper(async () => {
    calls += 1;
    throw new Error("offline");
  });

  box.keep(false);
  for (let turn = 0; turn < 5; turn++) await Promise.resolve();
  assert.equal(box.opening(true, 50), true);

  box.keep(false);
  for (let turn = 0; turn < 5; turn++) await Promise.resolve();
  assert.equal(calls, 2);
});
