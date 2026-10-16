import { getSession } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { checkPostcode, fetchCities, fetchStates, fetchZipCodes } from "@/lib/data/locations";

/**
 * The location cascade's data source for the browser.
 *
 * The lists depend on what the customer has just picked, so they cannot be
 * fetched on the server at render time — but the rule that a client component
 * never talks to a third party directly still holds. This handler is the seam:
 * the island asks us, we ask countriesnow / zippopotam.
 *
 * Three things it buys over fetching from the browser:
 *
 * - **One shape.** Three upstream services with three different envelopes
 *   become `{ options: string[] }`. The island renders a list; it does not
 *   know what a `state_code` is.
 * - **One place to change.** restcountries.com deprecated its free API out
 *   from under this feature the same week it was built. When countriesnow does
 *   the same, `lib/data/locations.ts` is the only file that moves.
 * - **Caching and no CORS.** Next's fetch cache holds the upstream response for
 *   a day, shared across every customer filling in this form.
 *
 * It reads nothing about the user and writes nothing — but it is deliberately
 * a fixed menu of four lookups rather than a URL passthrough, which would be
 * an open proxy. The fourth, `postcode` (2026-10-01), checks ONE code for the
 * location picker and answers `{ status, state?, city? }` (`checkPostcode`).
 */

export async function GET(request: Request) {
  // Signed-in only: an open endpoint let anyone fill our data cache with
  // made-up places and spend the third-party quota the campaign forms rely on.
  if (!(await getSession())) {
    return Response.json({ options: [] }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const country = params.get("country") ?? "";
  const state = params.get("state") ?? "";
  const city = params.get("city") ?? "";

  if (kind === "postcode") {
    return NextResponse.json(await checkPostcode(country, params.get("code") ?? ""));
  }

  let options: string[];
  switch (kind) {
    case "states":
      options = (await fetchStates(country)).map((s) => s.name);
      break;
    case "cities":
      options = await fetchCities(country, state);
      break;
    case "zips":
      options = await fetchZipCodes(country, state, city);
      break;
    default:
      return NextResponse.json({ error: `Unknown kind: ${kind}` }, { status: 400 });
  }

  // An empty list is a valid answer, not an error: most countries have no
  // postcode data here, and the control shows a text box instead.
  return NextResponse.json({ options });
}
