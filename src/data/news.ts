import { XMLParser } from "fast-xml-parser";
import type { NewsItem, NewsData, NewsSection } from "../lib/sample-data";
import type { CategorySources, NewsConfig } from "../lib/config";

const UA = "dashboard-personal/0.1 (https://github.com/rhymeswithjazz/dashboard)";
const TIMEOUT = 10_000;
const HN_BASE = "https://hacker-news.firebaseio.com/v0";

interface InternalItem extends NewsItem {
  date?: number; // epoch ms, for sort
}

interface HNStory {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  time?: number; // epoch seconds
  type?: string;
}

interface CategoryTasks {
  id: string;
  label: string;
  tasks: Promise<InternalItem[]>[];
}

export async function fetchNews(cfg: NewsConfig): Promise<NewsData | null> {
  const buckets: CategoryTasks[] = [];
  for (const [id, sources] of Object.entries(cfg.categories)) {
    buckets.push({
      id,
      label: labelForCategory(id),
      tasks: buildCategoryTasks(sources, cfg),
    });
  }

  // Run every fetch across every category in one flight so a slow feed in
  // one section doesn't hold up the others.
  const allTasks = buckets.flatMap((b) => b.tasks);
  const settled = await Promise.allSettled(allTasks);

  const seen = new Set<string>();
  const sections: NewsSection[] = [];
  let cursor = 0;
  let totalItems = 0;

  for (const bucket of buckets) {
    const taken = settled.slice(cursor, cursor + bucket.tasks.length);
    cursor += bucket.tasks.length;

    const items: InternalItem[] = [];
    for (const r of taken) {
      if (r.status === "fulfilled") items.push(...r.value);
    }

    // Dedupe within the section and against earlier sections.
    const unique: InternalItem[] = [];
    for (const it of items) {
      const key = canonical(it.url) ?? it.title.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(it);
    }

    unique.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
    const sectionItems = unique.slice(0, cfg.per_category_max).map(stripInternal);
    if (sectionItems.length === 0) continue;
    sections.push({ id: bucket.id, label: bucket.label, items: sectionItems });
    totalItems += sectionItems.length;
  }

  if (totalItems === 0) return null;
  return { sections };
}

function buildCategoryTasks(sources: CategorySources, cfg: NewsConfig): Promise<InternalItem[]>[] {
  const tasks: Promise<InternalItem[]>[] = [];
  if (sources.hn) {
    tasks.push(fetchHN(cfg.hn_count, cfg.per_source_max));
  }
  for (const url of sources.rss ?? []) {
    tasks.push(fetchRss(url, labelForRss(url), cfg.per_source_max));
  }
  for (const sub of sources.reddit_subs ?? []) {
    const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/top/.rss?t=day`;
    tasks.push(fetchRss(url, `r/${sub}`, cfg.per_source_max));
  }
  for (const q of sources.google_news_queries ?? []) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
    tasks.push(fetchRss(url, `Google News · ${q}`, cfg.per_source_max));
  }
  return tasks;
}

function labelForCategory(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function stripInternal(it: InternalItem): NewsItem {
  const { date: _date, ...item } = it;
  return item;
}

// ----- Hacker News -----

async function fetchHN(count: number, perSourceMax: number): Promise<InternalItem[]> {
  if (count <= 0) return [];
  try {
    const res = await fetch(`${HN_BASE}/topstories.json`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) {
      console.warn(`[news/hn] topstories non-2xx: ${res.status}`);
      return [];
    }
    const ids = (await res.json()) as number[];
    const slice = ids.slice(0, Math.max(count, perSourceMax));
    const stories = await Promise.all(slice.map(fetchHNStory));
    return stories
      .filter((s): s is HNStory => !!s && !!s.title)
      .slice(0, perSourceMax)
      .map(toNewsItem);
  } catch (err) {
    console.warn("[news/hn] failed:", err);
    return [];
  }
}

async function fetchHNStory(id: number): Promise<HNStory | null> {
  try {
    const res = await fetch(`${HN_BASE}/item/${id}.json`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return null;
    return (await res.json()) as HNStory;
  } catch {
    return null;
  }
}

function toNewsItem(s: HNStory): InternalItem {
  const hnLink = `https://news.ycombinator.com/item?id=${s.id}`;
  const score = s.score ?? 0;
  const comments = s.descendants ?? 0;
  return {
    tag: "Hacker News",
    title: s.title!,
    sub: `${score} points · ${comments} comments`,
    url: s.url ?? hnLink,
    date: s.time ? s.time * 1000 : undefined,
  };
}

// ----- RSS / Atom -----

interface ParsedRss {
  rss?: {
    channel?: {
      title?: string;
      item?: RssItem | RssItem[];
    };
  };
  feed?: {
    title?: string | { "#text"?: string };
    entry?: AtomEntry | AtomEntry[];
  };
}

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  source?: string | { "#text"?: string };
  description?: string;
}

interface AtomEntry {
  title?: string | { "#text"?: string };
  link?: AtomLink | AtomLink[] | string;
  updated?: string;
  published?: string;
  summary?: string;
}

interface AtomLink {
  "@_href"?: string;
  "@_rel"?: string;
}

async function fetchRss(url: string, label: string, max: number): Promise<InternalItem[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) {
      console.warn(`[news/rss] ${label} non-2xx: ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      trimValues: true,
    }).parse(xml) as ParsedRss;
    return parseFeed(parsed, label).slice(0, max);
  } catch (err) {
    console.warn(`[news/rss] ${label} failed:`, err);
    return [];
  }
}

function parseFeed(parsed: ParsedRss, label: string): InternalItem[] {
  if (parsed.rss?.channel?.item) {
    const items = arr(parsed.rss.channel.item);
    return items.map((it) => rssItemToNews(it, label)).filter(notNull);
  }
  if (parsed.feed?.entry) {
    const items = arr(parsed.feed.entry);
    return items.map((it) => atomItemToNews(it, label)).filter(notNull);
  }
  return [];
}

function rssItemToNews(it: RssItem, defaultLabel: string): InternalItem | null {
  const title = clean(strFrom(it.title));
  if (!title) return null;
  const url = strFrom(it.link);
  const sourceLabel = strFrom(it.source);
  const tag = sourceLabel ? `${defaultLabel.startsWith("Google News") ? "Google News · " : ""}${sourceLabel}` : defaultLabel;
  const date = parseDate(it.pubDate);
  return {
    tag,
    title,
    sub: date ? timeAgo(date) : "",
    url: url || undefined,
    date: date?.getTime(),
  };
}

function atomItemToNews(it: AtomEntry, label: string): InternalItem | null {
  const title = clean(strFrom(it.title));
  if (!title) return null;
  const url = extractAtomLink(it.link);
  const date = parseDate(it.published) ?? parseDate(it.updated);
  return {
    tag: label,
    title,
    sub: date ? timeAgo(date) : "",
    url: url || undefined,
    date: date?.getTime(),
  };
}

function extractAtomLink(link: AtomEntry["link"]): string | undefined {
  if (!link) return undefined;
  if (typeof link === "string") return link;
  const list = Array.isArray(link) ? link : [link];
  const alt = list.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? list[0];
  return alt?.["@_href"];
}

// ----- helpers -----

function arr<T>(v: T | T[]): T[] { return Array.isArray(v) ? v : [v]; }
function notNull<T>(v: T | null): v is T { return v !== null; }

function strFrom(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v && "#text" in v) {
    const t = (v as { "#text"?: unknown })["#text"];
    return typeof t === "string" ? t : "";
  }
  return "";
}

function clean(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function timeAgo(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function canonical(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    // Strip common tracking params and the fragment.
    const TRACKING = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref"]);
    for (const k of [...u.searchParams.keys()]) {
      if (TRACKING.has(k)) u.searchParams.delete(k);
    }
    u.hash = "";
    return u.host.toLowerCase() + u.pathname.toLowerCase().replace(/\/$/, "") + u.search;
  } catch {
    return url.toLowerCase();
  }
}

function labelForRss(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
