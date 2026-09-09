/**
 * Deleting a genre or a mix: the request, and what its answer means.
 *
 * The one write the website makes to the taste model itself, and the only part
 * of the confirmation dialog that is not a rendering decision — so it is here,
 * where a test can press the button without a browser. The dialog is then three
 * lines of glue: ask this, show what comes back, and re-render.
 *
 * It decides nothing about the model. Whether a genre a mix is built from may be
 * deleted at all is the store's, reached through the same endpoint an assistant
 * uses; what comes back is what this reports.
 */

/** Which endpoint a kind is deleted through. Two words, one decision. */
const WHERE = { genre: "genres", mix: "mixes" } as const;

/**
 * What a delete can leave behind: nothing, or a sentence for the reader.
 *
 * Not an exception, because a refusal is an ordinary answer here — the store
 * declining to remove a genre two mixes are built from is the system working —
 * and a caller has to render it either way.
 */
export type Removal = { removed: true } | { removed: false; problem: string };

/**
 * When the request itself did not get through.
 *
 * Deliberately vague about whether anything changed, because from here the two
 * are indistinguishable: the request may never have left, or it may have been
 * answered and the answer lost. Only one of those changed nothing, so the
 * sentence sends the reader to look rather than telling them which it was.
 */
export const UNREACHABLE = "Could not reach Tonight. Reload to see where your taste model stands.";

/** When the answer carried no reason of its own. */
export const REFUSED = "That could not be deleted. Reload before trying again.";

/** The row a name addresses, escaped so that any name a user chose can be sent. */
export function endpoint(kind: keyof typeof WHERE, name: string): string {
  return `/api/${WHERE[kind]}/${encodeURIComponent(name)}`;
}

/**
 * Asks for one genre or mix to be deleted.
 *
 * `send` is the browser's `fetch` in the page and a stand-in under test, which
 * is the whole reason this is a function and not four statements inside a click
 * handler.
 *
 * The answer's own body is read for a message and for nothing else: what the
 * model looks like afterwards is asked of the server again by re-rendering the
 * page, so a copy of it taken here would be a second version of the truth with
 * nothing to correct it.
 */
export async function remove(
  kind: keyof typeof WHERE,
  name: string,
  send: typeof fetch = fetch,
): Promise<Removal> {
  let response: Response;
  try {
    response = await send(endpoint(kind, name), {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  } catch {
    return { removed: false, problem: UNREACHABLE };
  }

  if (response.ok) return { removed: true };

  // The server's own sentence when it gave one: a refusal is a decision it
  // reached before writing, and it is precise about why.
  const answer = (await response.json().catch(() => null)) as { message?: string } | null;
  return { removed: false, problem: answer?.message ?? REFUSED };
}
