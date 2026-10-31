import { redirect } from "next/navigation";

import { BackToStream } from "@/components/back-to-stream";
import { NotHere, SignedIn, Unavailable } from "@/components/signed-in";
import { VibeView } from "@/components/vibe-view";
import { positions, withPositions } from "@/lib/web/judgements";
import { readHeld, resolveVisitor } from "@/lib/web/held";
import { findVibe, genresOf, single } from "@/lib/web/screens";
import { filmsIn } from "@/lib/web/vibes";

/**
 * One vibe's screen: `/vibe?name=…`.
 *
 * Signed in only. Whose vibe it is comes from the session, through
 * `resolveVisitor` and `readHeld`, exactly as on `/`; the query only says which of
 * that person's vibes to show, and is looked up in what has already been read for
 * them. A name they do not have — renamed, deleted, or typed — is "not here".
 *
 * It reads and shows; nothing on a vibe's screen writes. See `components/vibe-view.tsx`.
 */
export const dynamic = "force-dynamic";

export default async function VibePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const visitor = await resolveVisitor();
  if (!visitor) redirect("/");

  const query = await searchParams;
  const held = await readHeld(visitor);
  if (held === "unavailable") {
    return (
      <SignedIn email={visitor.email}>
        <Unavailable />
      </SignedIn>
    );
  }

  const vibe = findVibe(held.taste.vibes, single(query.name));
  if (!vibe) {
    return (
      <SignedIn email={visitor.email}>
        <NotHere>
          <BackToStream />
        </NotHere>
      </SignedIn>
    );
  }

  const movies = withPositions(held.taste.movies, positions(held.standing));
  return (
    <SignedIn email={visitor.email}>
      <VibeView
        vibe={vibe}
        vibes={held.taste.vibes}
        genres={genresOf(vibe, held.taste.genres)}
        films={filmsIn(vibe, movies)}
      />
    </SignedIn>
  );
}
