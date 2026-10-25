import { redirect } from "next/navigation";

import { BackToStream } from "@/components/back-to-stream";
import { MovieView } from "@/components/movie-view";
import { NotHere, SignedIn, Unavailable } from "@/components/signed-in";
import { refusalFor } from "@/lib/web/choices";
import { positions, withPositions } from "@/lib/web/judgements";
import { readHeld, resolveVisitor } from "@/lib/web/held";
import { contextOf, findMovie, single } from "@/lib/web/screens";

/**
 * One film's screen: `/movie?title=…&year=…`, and `&from=…` when it was reached
 * through a vibe.
 *
 * Signed in only. Whose film it is comes from the session, through
 * `resolveVisitor` and `readHeld`, exactly as on `/`; the query only says which of
 * that person's saved films to show, found by the identity the store keeps, and
 * which of its vibes it was reached through. A film they have not saved — a
 * verdict about one included — is "not here".
 *
 * It reads and shows. Its answers post to `/movie/choose`, the website's one
 * write, which answers by sending the browser back here — with `&refused=…`, one
 * of a fixed set of codes, when a press was not kept. See
 * `components/movie-view.tsx` and `lib/web/choose.ts`.
 */
export const dynamic = "force-dynamic";

export default async function MoviePage({
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

  const movies = withPositions(held.taste.movies, positions(held.standing));
  const movie = findMovie(movies, single(query.title), single(query.year));
  if (!movie) {
    return (
      <SignedIn email={visitor.email}>
        <NotHere>
          <BackToStream />
        </NotHere>
      </SignedIn>
    );
  }

  return (
    <SignedIn email={visitor.email}>
      <MovieView
        movie={movie}
        context={contextOf(movie, single(query.from))}
        refused={refusalFor(single(query.refused))}
      />
    </SignedIn>
  );
}
