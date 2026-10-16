/**
 * The three analytics sources on one date axis.
 *
 * ## Why this exists
 *
 * Google Analytics, Search Console and the ad platforms arrive in the SAME
 * `/api/connected-data` call and every one of them is a daily series — and the
 * analytics screen rendered them as three unrelated line charts, hundreds of
 * pixels apart, each with its own axis. The one question the page is for
 * ("is the paid half buying anything the free half wasn't already getting?")
 * was the one thing it could not answer, despite already holding the data.
 *
 * ## Why the dates are a union and not one source's list
 *
 * The three series do not cover the same days. Analytics backfills further
 * than Search Console; an ad account starts the day someone connected it.
 * Taking any one series' dates as the axis silently truncates the others, so
 * the axis is the union — and a day a series does not cover is `null`, never
 * `0`.
 *
 * That distinction is the whole reason this is a tested module rather than a
 * `.map()` in the page. `0` on a spend chart means "we ran ads and spent
 * nothing"; `null` means "this account did not exist yet". Drawn as zero, the
 * first week before an ad account was connected reads as a campaign that
 * flatlined.
 */

export interface TimelineBand {
  key: string;
  label: string;
  /** One entry per date in `dates`, null where that series has no data. */
  values: (number | null)[];
  /** The largest value in the band, used as its own y-scale. Null when empty. */
  peak: number | null;
  /** Pre-formatted peak, so the chart island stays free of formatting rules. */
  peakLabel: string | null;
  /** How to render a value in the readout. */
  format: "count" | "amount";
}

export interface Timeline {
  /** ISO dates, ascending. */
  dates: string[];
  bands: TimelineBand[];
}

export interface BandInput {
  key: string;
  label: string;
  format: "count" | "amount";
  /** Whatever daily rows this source has. Dates need not align with any other. */
  rows: readonly { date: string; value: number }[];
}

/**
 * Merges any number of daily series onto one ascending date axis.
 *
 * A band with no rows is kept, not dropped: the chart shows it as an empty lane
 * with its label, which says "we have nothing here" — dropping it would make an
 * unconnected ad account and a connected one with a quiet week look identical.
 * The caller decides whether a band is worth including at all.
 *
 * Duplicate dates within one series are summed. Both ad platforms feed the same
 * spend band, and two platforms genuinely do report the same day.
 */
export function buildTimeline(inputs: readonly BandInput[]): Timeline {
  const dates = [
    ...new Set(inputs.flatMap((input) => input.rows.map((row) => row.date))),
  ].sort();

  const bands = inputs.map((input) => {
    const byDate = new Map<string, number>();
    for (const row of input.rows) {
      byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.value);
    }

    const values = dates.map((date) => byDate.get(date) ?? null);
    const present = values.filter((value): value is number => value !== null);
    const peak = present.length > 0 ? Math.max(...present) : null;

    return {
      key: input.key,
      label: input.label,
      values,
      peak,
      peakLabel: peak === null ? null : formatPeak(peak, input.format),
      format: input.format,
    };
  });

  return { dates, bands };
}

/**
 * The peak, short enough to sit at the end of a band's label row.
 *
 * Compact notation only above a thousand: `1.2k` is easier than `1,240` in a
 * cramped label, but `840` compacted to `0.8k` throws away a digit for nothing.
 */
function formatPeak(value: number, format: "count" | "amount"): string {
  const rounded = format === "amount" && value < 10 ? value.toFixed(2) : null;
  if (rounded !== null) return rounded;

  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

/**
 * The window the data actually covers, for the page header.
 *
 * This replaced a "Days of data" stat tile. A count of days is metadata about
 * our import, sitting at the same visual weight as the sessions figure — and it
 * does not answer the question someone actually has on arriving, which is
 * "how recent is this?". A dated range does.
 *
 * Returns null for an empty timeline rather than a range with no ends in it.
 */
export function timelineWindow(dates: readonly string[]): string | null {
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === undefined || last === undefined) return null;

  if (first === last) return formatDay(first, "day-month-year");

  // The month is dropped from the start only when both ends share it: "1 – 8
  // Sep" rather than "1 Sep – 8 Sep", which repeats a word to say nothing.
  // Across a month boundary both ends need naming or the range is unreadable.
  const sameMonth = monthKey(first) === monthKey(last);
  // The year is named once, on the end that fixes it. The range is read as a
  // whole, and repeating it on both ends is two words for one fact.
  return `${formatDay(first, sameMonth ? "day" : "day-month")} – ${formatDay(last, "day-month-year")}`;
}

/** Year and month, so "Aug 2025" and "Aug 2026" are not the same month. */
function monthKey(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return `${parsed.getFullYear()}-${parsed.getMonth()}`;
}

/**
 * A day, short: `14 Sep`, or `14 Sep 2026` with the year.
 *
 * Hand-written month names rather than `toLocaleDateString`, which renders
 * September as "Sept" in en-GB — four letters where every other month has
 * three, so a date range changed width depending on the month it landed in.
 */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `2026-09-14` → `14 Sep`. The one spelling every analytics axis uses. */
export function shortDay(iso: string): string {
  return formatDay(iso, "day-month");
}

/** `2026-09-14` → `14 Sep 2026`. `shortDay` with the year, for dates that may not be this one's. */
export function shortDayYear(iso: string): string {
  return formatDay(iso, "day-month-year");
}

function formatDay(iso: string, parts: "day" | "day-month" | "day-month-year"): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;

  // A bare `YYYY-MM-DD` is a calendar day, and `new Date` reads it as UTC
  // midnight — so the local getters printed the day BEFORE for anyone west of
  // UTC, and the server (UTC) and browser disagreed (audit, 2026-09-29). Read
  // a calendar day back in UTC; a full timestamp keeps local time.
  const utc = /^\d{4}-\d{2}-\d{2}$/.test(iso.trim());
  const day = utc ? parsed.getUTCDate() : parsed.getDate();
  if (parts === "day") return String(day);
  const month = MONTHS[utc ? parsed.getUTCMonth() : parsed.getMonth()] ?? "";
  const year = utc ? parsed.getUTCFullYear() : parsed.getFullYear();
  return parts === "day-month" ? `${day} ${month}` : `${day} ${month} ${year}`;
}
