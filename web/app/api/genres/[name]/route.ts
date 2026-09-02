import { authorized, given } from "../../../../lib/web/api.ts";

/**
 * Changing or removing one genre, addressed by its current name in the path.
 *
 * The name to change is never taken from the body: one address per request, and
 * the body carries only what should become true. `new_name` is the rename.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ name: string }> };

export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  const { name } = await params;
  return authorized(request, async ({ store, body }) => {
    await store.updateGenre(name, {
      name: given(body, "new_name"),
      instruction: given(body, "instruction"),
    });
    return { taste: await store.taste() };
  });
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const { name } = await params;
  return authorized(request, async ({ store }) => {
    await store.deleteGenre(name);
    return { taste: await store.taste() };
  });
}
