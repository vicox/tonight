/**
 * What *Include previously seen* does in the browser: sends each press to the
 * server, and remembers the last one only as long as the server might not have
 * it yet.
 *
 * Two things make remembering necessary, and both are about a Stream drawn from
 * a read older than the press. Back and Forward hand back a Stream the router
 * already drew, read before the box was pressed; and a Stream fetched while a
 * save is on its way can be read before the save lands. Either would open the
 * box as it was rather than as it was left.
 *
 * And one thing makes forgetting necessary: a Stream read *after* the save
 * landed is the account's answer, which another browser may have changed since.
 * So the tab's answer outranks a read only while that read could be older than
 * the write — told apart by the server's own clock on both sides: when the
 * Stream was read (`readAt`) and when the press was kept (`keptAt`). Neither
 * time is stored anywhere.
 */

/** Sends one answer; resolves to when the server kept it, or undefined if it did not. */
export type Send = (value: boolean) => Promise<number | undefined>;

export type Keeper = {
  /** Whether the box opens ticked, given what the server read and when. */
  opening(saved: boolean, readAt: number): boolean;
  /** A press: remembered at once, and sent after any save already on its way. */
  keep(value: boolean): void;
  /**
   * The page is being hidden, and may be closing: an answer still waiting is
   * sent now, rather than after the one in flight, which could be never.
   */
  flush(): void;
};

export function keeper(send: Send): Keeper {
  /** The last answer pressed, and when the server kept it — undefined until it says. */
  let latest: { value: boolean; keptAt?: number } | undefined;
  /** An answer not sent yet, because another is on its way. Only the last one waits. */
  let waiting: boolean | undefined;
  let sending = false;

  const sent = (value: boolean) => send(value).catch(() => undefined);

  /**
   * What the server said about one answer — heeded only if it is still the last
   * one pressed and nothing newer waits. Kept, it is remembered until a read is
   * seen to be later; not kept, it is forgotten, and the box opens as the server
   * has it.
   */
  function settle(value: boolean, keptAt: number | undefined): void {
    if (latest?.value !== value || waiting !== undefined) return;
    latest = keptAt === undefined ? undefined : { value, keptAt };
  }

  /** One save at a time, in order, so the last answer pressed is the last one kept. */
  async function drain(): Promise<void> {
    sending = true;
    while (waiting !== undefined) {
      const value = waiting;
      waiting = undefined;
      settle(value, await sent(value));
    }
    sending = false;
  }

  return {
    opening(saved, readAt) {
      if (!latest) return saved;
      if (latest.keptAt !== undefined && readAt > latest.keptAt) return saved;
      return latest.value;
    },

    keep(value) {
      latest = { value };
      waiting = value;
      if (!sending) void drain();
    },

    flush() {
      if (waiting === undefined) return;
      const value = waiting;
      waiting = undefined;
      void sent(value).then((keptAt) => settle(value, keptAt));
    },
  };
}

/** The real sender: the Stream setting's own endpoint, finished even if the page closes. */
export async function post(value: boolean): Promise<number | undefined> {
  try {
    const response = await fetch("/stream/include-seen", {
      method: "POST",
      body: new URLSearchParams({ "include-seen": String(value) }),
      keepalive: true,
    });
    if (!response.ok) return undefined;
    const { keptAt } = (await response.json()) as { keptAt?: unknown };
    return typeof keptAt === "number" ? keptAt : undefined;
  } catch {
    return undefined;
  }
}
