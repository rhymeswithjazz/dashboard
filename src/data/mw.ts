import { XMLParser } from "fast-xml-parser";
import type { Word } from "./words";

const WOTD_RSS = "https://www.merriam-webster.com/wotd/feed/rss2";
const COLLEGIATE = "https://dictionaryapi.com/api/v3/references/collegiate/json";
const UA = "dashboard-personal/0.1 (https://github.com/rhymeswithjazz/dashboard)";
const TIMEOUT = 10_000;

interface RssItem { title?: string; description?: string; pubDate?: string }
interface RssShape { rss?: { channel?: { item?: RssItem | RssItem[] } } }

interface CollegiateEntry {
  meta?: { id?: string };
  hwi?: { hw?: string };
  fl?: string;
  shortdef?: string[];
}

/**
 * Returns today's Merriam-Webster Word of the Day, enriched with a definition
 * from the Collegiate Dictionary API if MW_API_KEY is set. Falls back through
 * three layers: enriched → RSS-description-only → null.
 */
export async function fetchWordOfTheDay(apiKey?: string): Promise<Word | null> {
  const rss = await fetchFromRss();
  if (!rss) return null;

  if (apiKey) {
    const enriched = await enrichViaCollegiate(rss.term, apiKey);
    if (enriched) return enriched;
  }

  if (rss.def) {
    return { term: rss.term, def: rss.def };
  }
  return null;
}

async function fetchFromRss(): Promise<{ term: string; def: string | null } | null> {
  try {
    const res = await fetch(WOTD_RSS, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) {
      console.warn(`[mw/rss] non-2xx: ${res.status}`);
      return null;
    }
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });
    const parsed = parser.parse(xml) as RssShape;
    const items = parsed.rss?.channel?.item;
    const first = Array.isArray(items) ? items[0] : items;
    if (!first?.title) return null;

    return {
      term: titleCase(String(first.title).trim()),
      def: rssDef(String(first.description ?? "")),
    };
  } catch (err) {
    console.warn("[mw/rss] fetch failed:", err);
    return null;
  }
}

async function enrichViaCollegiate(term: string, apiKey: string): Promise<Word | null> {
  const url = `${COLLEGIATE}/${encodeURIComponent(term.toLowerCase())}?key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) {
      console.warn(`[mw/collegiate] non-2xx: ${res.status}`);
      return null;
    }
    const body = await res.json();
    if (!Array.isArray(body) || body.length === 0) return null;
    // Suggestion mode returns an array of strings, not entry objects.
    const first = body[0];
    if (typeof first === "string") return null;

    const entry = first as CollegiateEntry;
    const def = entry.shortdef?.[0];
    if (!def) return null;

    return {
      term: titleCase(entry.hwi?.hw?.replace(/\*/g, "") ?? term),
      def: trimTrailingPeriod(def) + ".",
      pos: shortPos(entry.fl),
    };
  } catch (err) {
    console.warn("[mw/collegiate] fetch failed:", err);
    return null;
  }
}

function rssDef(description: string): string | null {
  if (!description) return null;
  // Strip HTML, normalize whitespace, take the first sentence.
  const text = description
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&#8211;|&#8212;/g, "—")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const m = text.match(/[^.!?]+[.!?]/);
  return (m?.[0] ?? text).trim();
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function trimTrailingPeriod(s: string): string {
  return s.replace(/[.\s]+$/, "");
}

function shortPos(fl?: string): string | undefined {
  if (!fl) return undefined;
  const map: Record<string, string> = {
    noun: "n.",
    verb: "v.",
    adjective: "adj.",
    adverb: "adv.",
    pronoun: "pron.",
    preposition: "prep.",
    conjunction: "conj.",
    interjection: "interj.",
    "abbreviation": "abbr.",
  };
  return map[fl.toLowerCase()] ?? fl;
}
