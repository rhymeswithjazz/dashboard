import type { Mode } from "./mode";

export interface BriefingData { text: string }
export interface WeatherData {
  summary: string;
  high: number;
  low: number;
  rainNote: string;
}
export interface CalendarEvent { time: string; title: string }
export interface CalendarData { heading: string; events: CalendarEvent[] }
export interface WorkItem { tag: string; title: string; sub: string }
export interface WorkData { items: WorkItem[] }
export interface GameLine { team: string; result: string; next: string }
export interface SportsData { games: GameLine[] }
export interface NewsItem { tag: string; title: string; sub: string }
export interface NewsData { items: NewsItem[] }
export interface CurioData {
  onThisDay: { year: string; text: string };
  word: { term: string; def: string };
  wiki: string;
}
export interface PictureData {
  url: string;
  caption: string;
  credit: string;
  link: string;
}

export interface DashboardData {
  briefing: BriefingData;
  weather: WeatherData;
  calendar: CalendarData;
  work: WorkData;
  sports: SportsData;
  news: NewsData;
  picture: PictureData | null;
  curio: CurioData;
}

export function sampleData(mode: Mode): DashboardData {
  if (mode === "warmup") return WARMUP;
  return COOLDOWN;
}

const WARMUP: DashboardData = {
  briefing: {
    text: "Braves blanked the Mets 5–0 last night; Strider went eight innings with eleven strikeouts. Two pull requests need your review — both small. Rain pushes in after four, so plan around it. Calendar is light: a 1:1 at two and Dr. Patel at four-thirty.",
  },
  weather: {
    summary: "72°F partly cloudy",
    high: 81,
    low: 64,
    rainNote: "rain 60% after 4p",
  },
  calendar: {
    heading: "Today",
    events: [
      { time: "2:00 pm", title: "1:1 with Sarah" },
      { time: "4:30 pm", title: "Dr. Patel — annual" },
    ],
  },
  work: {
    items: [
      { tag: "Review · org/foo #142", title: "fix flaky test in auth-spec", sub: "@jdoe · 2 files · +18 −4" },
      { tag: "Review · org/bar #88",  title: "add caching to dashboard query", sub: "@asmith · 1 file · +42 −12" },
      { tag: "Yours · org/web #301 · CI red", title: "feat: morning briefing", sub: "2 of 3 checks failing" },
    ],
  },
  sports: {
    games: [
      { team: "Braves",   result: "W 5–0 vs NYM",  next: "Today 7:20p" },
      { team: "Falcons",  result: "offseason",     next: "camp Jul 23" },
      { team: "Bulldogs", result: "offseason",     next: "Clemson · Aug 30" },
    ],
  },
  news: {
    items: [
      { tag: "Google News · Braves",  title: "Braves call up top prospect for series finale", sub: "ajc.com · 2h" },
      { tag: "Google News · Falcons", title: "Falcons release rookie minicamp schedule",      sub: "espn.com · 5h" },
      { tag: "r/AtlantaBraves",       title: "Strider's slider has been unreal lately",       sub: "432 upvotes · 87 comments" },
      { tag: "Hacker News",           title: "Show HN: I built a tiny SQLite for the browser", sub: "312 points · 84 comments" },
      { tag: "Hacker News",           title: "Why I left Big Tech to grow garlic",             sub: "589 points · 217 comments" },
      { tag: "Anthropic blog",        title: "Introducing Opus 4.7",                           sub: "anthropic.com · today" },
    ],
  },
  picture: null,
  curio: {
    onThisDay: { year: "1954", text: "The Supreme Court decides Brown v. Board of Education, ruling racial segregation in public schools unconstitutional." },
    word: { term: "Sonder", def: "the realization that each passerby is living a life as vivid and complex as your own." },
    wiki: "The Gympie-Gympie tree of Queensland is among the most painfully stinging plants known; survivors describe the sensation as lasting months.",
  },
};

const COOLDOWN: DashboardData = {
  briefing: {
    text: "Closing the day: Braves are on the board against the Mets, top of the fifth. You shipped one PR; two more are waiting for your last look before tomorrow. Storms cleared. Tomorrow opens light — coffee at nine and a focused afternoon.",
  },
  weather: {
    summary: "68°F clearing",
    high: 74,
    low: 58,
    rainNote: "dry through morning · tomorrow H 79°",
  },
  calendar: {
    heading: "Tomorrow",
    events: [
      { time: "9:00 am", title: "Coffee with Marcus" },
      { time: "11:00 am", title: "Eng review" },
      { time: "3:30 pm", title: "Focus block — briefing rollout" },
    ],
  },
  work: {
    items: [
      { tag: "Shipped today · org/web #299", title: "fix: calendar tz off-by-one", sub: "merged 11:42a" },
      { tag: "Review · org/foo #142",        title: "fix flaky test in auth-spec", sub: "approved, awaiting CI" },
      { tag: "Review · org/bar #88",         title: "add caching to dashboard query", sub: "unread · opened 30m ago" },
    ],
  },
  sports: {
    games: [
      { team: "Braves",   result: "vs NYM · top 5",  next: "Tomorrow 7:20p" },
      { team: "Falcons",  result: "offseason",       next: "camp Jul 23" },
      { team: "Bulldogs", result: "offseason",       next: "Clemson · Aug 30" },
    ],
  },
  news: {
    items: [
      { tag: "Google News · Braves",  title: "Olson, Riley homer in 5–0 win over Mets", sub: "ajc.com · 1h" },
      { tag: "Google News · Falcons", title: "Falcons trim roster to 85, waive two", sub: "espn.com · 4h" },
      { tag: "r/AtlantaBraves",       title: "What an outing from Strider tonight",    sub: "1.2k upvotes · 312 comments" },
      { tag: "Hacker News",           title: "The rise and fall of the iPad as a creative tool", sub: "412 points · 198 comments" },
      { tag: "Hacker News",           title: "A short history of monospace fonts", sub: "267 points · 64 comments" },
      { tag: "Anthropic blog",        title: "Introducing Opus 4.7",                  sub: "anthropic.com · today" },
    ],
  },
  picture: null,
  curio: {
    onThisDay: { year: "1954", text: "The Supreme Court decides Brown v. Board of Education, ruling racial segregation in public schools unconstitutional." },
    word: { term: "Sonder", def: "the realization that each passerby is living a life as vivid and complex as your own." },
    wiki: "The Gympie-Gympie tree of Queensland is among the most painfully stinging plants known; survivors describe the sensation as lasting months.",
  },
};
