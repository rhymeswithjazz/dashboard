import { WORDS, type Word } from "./words";

const UA = "dashboard-personal/0.1 (https://github.com/rhymeswithjazz/dashboard)";
const TIMEOUT = 10_000;

export interface PictureData {
  url: string;
  caption: string;
  credit: string;
  link: string;
}

export interface OnThisDayItem {
  year: string;
  text: string;
  link?: string;
}

export interface RandomWikiItem {
  text: string;
  title?: string;
  link?: string;
}

export interface WikipediaPack {
  onThisDay: OnThisDayItem | null;
  picture: PictureData | null;
  randomWiki: RandomWikiItem | null;
}

interface FeaturedResponse {
  image?: {
    title?: string;
    thumbnail?: { source: string; width?: number; height?: number };
    image?:     { source: string; width?: number; height?: number };
    file_page?: string;
    description?: { text?: string };
    credit?: { text?: string; html?: string };
    artist?: { text?: string; name?: string };
  };
  onthisday?: Array<{
    text: string;
    year: number;
    pages?: Array<{
      thumbnail?: unknown;
      titles?: { normalized?: string };
      content_urls?: { desktop?: { page?: string } };
    }>;
  }>;
}

interface RandomSummaryResponse {
  title?: string;
  displaytitle?: string;
  extract?: string;
  titles?: { normalized?: string };
  content_urls?: { desktop?: { page?: string } };
}

export async function fetchWikipediaPack(): Promise<WikipediaPack> {
  const [featured, random] = await Promise.allSettled([
    fetchFeatured(),
    fetchRandom(),
  ]);

  const feat = featured.status === "fulfilled" ? featured.value : null;
  const rand = random.status === "fulfilled" ? random.value : null;

  return {
    onThisDay: feat?.onThisDay ?? null,
    picture: feat?.picture ?? null,
    randomWiki: rand,
  };
}

export function pickWord(now: Date): Word {
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - start) / 86_400_000);
  return WORDS[dayOfYear % WORDS.length]!;
}

async function fetchFeatured(): Promise<{
  onThisDay: OnThisDayItem | null;
  picture: PictureData | null;
}> {
  const { year, month, day } = getETYMD();
  const url = `https://en.wikipedia.org/api/rest_v1/feed/featured/${year}/${month}/${day}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) {
      console.warn(`[wiki/featured] non-2xx: ${res.status}`);
      return { onThisDay: null, picture: null };
    }
    const json = (await res.json()) as FeaturedResponse;
    return {
      onThisDay: pickOnThisDay(json.onthisday ?? [], Number(day), Number(month)),
      picture: formatPicture(json.image),
    };
  } catch (err) {
    console.warn("[wiki/featured] fetch failed:", err);
    return { onThisDay: null, picture: null };
  }
}

async function fetchRandom(): Promise<RandomWikiItem | null> {
  try {
    const res = await fetch("https://en.wikipedia.org/api/rest_v1/page/random/summary", {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) {
      console.warn(`[wiki/random] non-2xx: ${res.status}`);
      return null;
    }
    const json = (await res.json()) as RandomSummaryResponse;
    if (!json.extract) return null;
    return {
      text: trimToSentences(json.extract, 2),
      title: json.titles?.normalized ?? json.displaytitle ?? json.title,
      link: json.content_urls?.desktop?.page,
    };
  } catch (err) {
    console.warn("[wiki/random] fetch failed:", err);
    return null;
  }
}

function pickOnThisDay(
  events: NonNullable<FeaturedResponse["onthisday"]>,
  day: number,
  month: number,
): OnThisDayItem | null {
  if (events.length === 0) return null;
  // Prefer events whose linked pages have thumbnails (proxy for notability).
  const notable = events.filter(
    (e) => (e.pages ?? []).some((p) => p.thumbnail),
  );
  const pool = notable.length > 0 ? notable : events;
  const seed = month * 32 + day;
  const event = pool[seed % pool.length]!;
  // Pick the first page with a thumbnail (most notable) for the link target;
  // fall back to the first page if none have one.
  const pages = event.pages ?? [];
  const primary = pages.find((p) => p.thumbnail) ?? pages[0];
  const link = primary?.content_urls?.desktop?.page;
  return { year: String(event.year), text: event.text, link };
}

function formatPicture(img: FeaturedResponse["image"]): PictureData | null {
  if (!img?.thumbnail?.source && !img?.image?.source) return null;
  const url = img.image?.source ?? img.thumbnail!.source;
  const caption = trimToSentences(img.description?.text?.trim() ?? "", 2) || "Wikimedia Picture of the Day";
  const credit = stripHtml(img.credit?.html ?? img.credit?.text ?? img.artist?.name ?? img.artist?.text ?? "Wikimedia Commons");
  const link = img.file_page ?? "https://commons.wikimedia.org/wiki/Commons:Picture_of_the_day";
  return { url, caption, credit, link };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function trimToSentences(s: string, n: number): string {
  if (!s) return "";
  const matches = s.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  if (!matches) return s.trim();
  return matches.slice(0, n).join("").trim();
}

function getETYMD(): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return { year, month, day };
}
