import { handleChoice } from "@/lib/web/choose";

/**
 * One of a film's five choices, pressed on its screen. POST only, from the
 * website's own film page: see `lib/web/choose.ts` for what it may write, and
 * `lib/web/readonly.test.ts` for how that is held to.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleChoice(request);
}
