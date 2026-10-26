import { handleIncludeSeen } from "@/lib/web/stream-settings";

/**
 * The Stream's *Include previously seen* box, pressed. POST only, from the
 * Stream itself: see `lib/web/stream-settings.ts` for the one value it keeps,
 * and `lib/web/readonly.test.ts` for how that is held to.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleIncludeSeen(request);
}
