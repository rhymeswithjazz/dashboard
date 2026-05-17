import ical from "node-ical";
import type { Mode } from "../lib/mode";
import type { CalendarEvent } from "../lib/sample-data";

const UA = "dashboard-personal/0.1 (https://github.com/rhymeswithjazz/dashboard)";
const TIMEOUT = 15_000;

interface RawIcalEvent {
  type?: string;
  summary?: string;
  start?: Date;
  end?: Date;
  datetype?: "date" | "date-time";
  rrule?: { between(after: Date, before: Date, inc?: boolean): Date[] };
  recurrences?: Record<string, RawIcalEvent | undefined>;
  exdate?: Record<string, Date>;
  status?: string;
  uid?: string;
}

interface Occurrence {
  date: Date;
  title: string;
  allDay: boolean;
}

/**
 * Returns events for today (warmup) or tomorrow (cooldown) in the user's
 * timezone, drawn from one or more ICS URLs (comma-separated env var).
 *
 *   null  → not configured (caller may use sample data)
 *   []    → configured + fetched, nothing scheduled
 *   [...] → configured + fetched, events found
 */
export async function fetchCalendar(
  urlsStr: string | undefined,
  mode: Mode,
  timezone: string,
): Promise<CalendarEvent[] | null> {
  if (!urlsStr) return null;
  const urls = urlsStr.split(",").map((s) => s.trim()).filter(Boolean);
  if (urls.length === 0) return null;

  const now = new Date();
  const targetYmd = ymdInTz(
    new Date(now.getTime() + (mode === "cooldown" ? 1 : 0) * 86_400_000),
    timezone,
  );
  // Expand recurring events in a wide window around the target day so that
  // events crossing DST or starting late at night still get caught.
  const expandFrom = new Date(now.getTime() - 2 * 86_400_000);
  const expandTo = new Date(now.getTime() + 3 * 86_400_000);

  const settled = await Promise.allSettled(urls.map(fetchAndParse));
  const occurrences: Occurrence[] = [];
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    for (const event of r.value) {
      for (const occ of expandOccurrences(event, expandFrom, expandTo)) {
        if (occurrenceYmd(occ, timezone) === targetYmd) {
          occurrences.push(occ);
        }
      }
    }
  }

  occurrences.sort((a, b) => a.date.getTime() - b.date.getTime());
  return occurrences.map((o) => ({
    time: o.allDay ? "all day" : formatTime(o.date, timezone),
    title: o.title,
  }));
}

async function fetchAndParse(url: string): Promise<RawIcalEvent[]> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/calendar, text/plain", "User-Agent": UA },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) {
      console.warn(`[cal] non-2xx: ${res.status}`);
      return [];
    }
    const text = await res.text();
    const parsed = ical.parseICS(text) as Record<string, RawIcalEvent>;
    return Object.values(parsed).filter((v): v is RawIcalEvent => v?.type === "VEVENT");
  } catch (err) {
    console.warn("[cal] fetch failed:", err);
    return [];
  }
}

function expandOccurrences(event: RawIcalEvent, from: Date, to: Date): Occurrence[] {
  if (event.status === "CANCELLED") return [];
  if (!event.start) return [];
  const title = (event.summary ?? "(no title)").toString().trim();
  const allDay = event.datetype === "date";

  if (!event.rrule) {
    if (event.start >= from && event.start <= to) {
      return [{ date: event.start, title, allDay }];
    }
    return [];
  }

  const exDateKeys = new Set<string>();
  if (event.exdate) {
    for (const k of Object.keys(event.exdate)) {
      const d = event.exdate[k];
      if (d instanceof Date) exDateKeys.add(d.toISOString().slice(0, 10));
      else exDateKeys.add(k.slice(0, 10));
    }
  }

  const out: Occurrence[] = [];
  for (const d of event.rrule.between(from, to, true)) {
    const key = d.toISOString().slice(0, 10);
    if (exDateKeys.has(key)) continue;

    const override = event.recurrences?.[key];
    if (override) {
      if (override.status === "CANCELLED") continue;
      out.push({
        date: override.start ?? d,
        title: (override.summary ?? title).toString().trim(),
        allDay: override.datetype === "date" || allDay,
      });
    } else {
      out.push({ date: d, title, allDay });
    }
  }
  return out;
}

function occurrenceYmd(occ: Occurrence, tz: string): string {
  // All-day events are timezone-independent: their `start` is midnight UTC of
  // the calendar date, so tz conversion would (e.g.) shove a May 17 all-day
  // event into May 16 if tz is west of UTC.
  if (occ.allDay) return occ.date.toISOString().slice(0, 10);
  return ymdInTz(occ.date, tz);
}

function ymdInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(d)
    .replace(/\s/g, " ")
    .toLowerCase();
}
