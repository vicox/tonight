import { authorized, given } from "../../../lib/web/api.ts";

/**
 * Creating a genre from the website. See lib/web/api.ts for the boundary.
 *
 * The whole taste model comes back rather than the one row, because a write can
 * move more than it names and the page shows what the store now holds.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return authorized(request, async ({ store, body }) => {
    await store.createGenre({ name: given(body, "name"), instruction: given(body, "instruction") });
    return { taste: await store.taste() };
  });
}
