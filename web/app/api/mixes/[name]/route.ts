import { authorized, given } from "../../../../lib/web/api.ts";

/**
 * Changing or removing one mix, addressed by its current name in the path.
 *
 * Passing `genres` replaces the stored list rather than adding to it, which is the
 * store's rule and not this route's — see lib/taste/store.ts.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ name: string }> };

export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  const { name } = await params;
  return authorized(request, async ({ store, body }) => {
    await store.updateMix(name, {
      name: given(body, "new_name"),
      instruction: given(body, "instruction"),
      genres: given(body, "genres"),
    });
    return { taste: await store.taste() };
  });
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const { name } = await params;
  return authorized(request, async ({ store }) => {
    await store.deleteMix(name);
    return { taste: await store.taste() };
  });
}
