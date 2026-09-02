import { authorized, given } from "../../../lib/web/api.ts";

/** Creating a mix from the website. See lib/web/api.ts for the boundary. */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return authorized(request, async ({ store, body }) => {
    await store.createMix({
      name: given(body, "name"),
      instruction: given(body, "instruction"),
      genres: given(body, "genres"),
    });
    return { taste: await store.taste() };
  });
}
