import type { GameLine, SportsData } from "../lib/sample-data";
import type { SportsConfig, SportsLeague, SportsTeam } from "../lib/config";

const UA = "dashboard-personal/0.1 (https://github.com/rhymeswithjazz/dashboard)";
const TIMEOUT = 10_000;
const STALE_DAYS = 30; // older than this, the "last game" is buried as offseason

// ESPN site API response shape (loosely typed; we only touch the fields we use).
interface EspnEvent {
  id: string;
  date: string; // ISO
  competitions?: EspnCompetition[];
}
interface EspnCompetition {
  date?: string;
  competitors?: EspnCompetitor[];
  status?: EspnStatus;
  notes?: Array<{ type?: string; headline?: string }>;
}
interface EspnCompetitor {
  id?: string;
  homeAway?: "home" | "away";
  winner?: boolean;
  // ESPN returns this as a plain string on most endpoints, but as
  // { value, displayValue } on some scoreboard responses. Accept both.
  score?: string | { value?: number; displayValue?: string };
  team?: { id?: string; abbreviation?: string; displayName?: string };
}
interface EspnStatus {
  type?: {
    name?: string;       // STATUS_FINAL / STATUS_SCHEDULED / STATUS_IN_PROGRESS
    state?: "pre" | "in" | "post";
    completed?: boolean;
    description?: string;
    shortDetail?: string;
  };
}
interface EspnScheduleResponse {
  events?: EspnEvent[];
}

export async function fetchSports(
  cfg: SportsConfig,
  timezone: string,
): Promise<SportsData | null> {
  const lines = await Promise.all(cfg.teams.map((t) => fetchTeam(t, timezone)));
  const games = lines.filter((g): g is GameLine => g !== null);
  if (games.length === 0) return null;
  return { games };
}

async function fetchTeam(team: SportsTeam, tz: string): Promise<GameLine | null> {
  const url = scheduleUrl(team);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) {
      console.warn(`[sports/${team.label}] schedule non-2xx: ${res.status}`);
      return { team: team.label, result: `${team.label} —`, next: "—" };
    }
    const json = (await res.json()) as EspnScheduleResponse;
    const events = json.events ?? [];
    const inProgress = events.find((e) => stateOf(e) === "in");
    // Schedule endpoint doesn't refresh competitor.score for in-progress
    // games. Pull a fresh event from the league scoreboard if we have one.
    const live = inProgress ? await fetchLiveEvent(team, inProgress.id) : null;
    return buildLine(team, events, live, tz);
  } catch (err) {
    console.warn(`[sports/${team.label}] fetch failed:`, err);
    return { team: team.label, result: `${team.label} —`, next: "—" };
  }
}

async function fetchLiveEvent(team: SportsTeam, eventId: string): Promise<EspnEvent | null> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath(team.league)}/scoreboard`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) {
      console.warn(`[sports/${team.label}] scoreboard non-2xx: ${res.status}`);
      return null;
    }
    const json = (await res.json()) as EspnScheduleResponse;
    return json.events?.find((e) => e.id === eventId) ?? null;
  } catch (err) {
    console.warn(`[sports/${team.label}] scoreboard fetch failed:`, err);
    return null;
  }
}

function scheduleUrl(team: SportsTeam): string {
  return `https://site.api.espn.com/apis/site/v2/sports/${sportPath(team.league)}/teams/${team.team_id}/schedule`;
}

function sportPath(league: SportsLeague): string {
  switch (league) {
    case "mlb": return "baseball/mlb";
    case "nfl": return "football/nfl";
    case "college-football": return "football/college-football";
  }
}

function buildLine(team: SportsTeam, events: EspnEvent[], liveEvent: EspnEvent | null, tz: string): GameLine {
  const now = new Date();
  const teamIdStr = String(team.team_id);

  // Sort chronologically just in case.
  const sorted = events.slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  const inProgress = sorted.find((e) => stateOf(e) === "in");
  const lastFinal = [...sorted].reverse().find((e) => stateOf(e) === "post");
  const nextScheduled = sorted.find((e) => stateOf(e) === "pre" && Date.parse(e.date) > now.getTime());

  let result: string;
  if (inProgress) {
    // Prefer the scoreboard event for fresh scores; fall back to schedule.
    result = formatLive(liveEvent ?? inProgress, teamIdStr, team.label);
  } else if (lastFinal) {
    const ageDays = (now.getTime() - Date.parse(lastFinal.date)) / 86_400_000;
    result = ageDays <= STALE_DAYS ? formatResult(lastFinal, teamIdStr, team.label) : `${team.label} · offseason`;
  } else {
    result = `${team.label} · offseason`;
  }

  const next = nextScheduled
    ? formatNext(nextScheduled, teamIdStr, now, tz)
    : "—";

  return { team: team.label, result, next };
}

function stateOf(e: EspnEvent): "pre" | "in" | "post" | undefined {
  return e.competitions?.[0]?.status?.type?.state;
}

function competitorsFor(e: EspnEvent, teamId: string): { us?: EspnCompetitor; them?: EspnCompetitor } {
  const comps = e.competitions?.[0]?.competitors ?? [];
  const us = comps.find((c) => c.team?.id === teamId || c.id === teamId);
  const them = comps.find((c) => c !== us);
  return { us, them };
}

function readScore(c: EspnCompetitor | undefined): string {
  if (!c) return "0";
  if (typeof c.score === "string") return c.score;
  if (c.score && typeof c.score === "object") {
    if (typeof c.score.displayValue === "string") return c.score.displayValue;
    if (typeof c.score.value === "number") return String(c.score.value);
  }
  return "0";
}

function formatResult(e: EspnEvent, teamId: string, ourName: string): string {
  const { us, them } = competitorsFor(e, teamId);
  if (!us || !them) return "—";
  const opp = them.team?.displayName ?? them.team?.abbreviation ?? "?";
  return `${ourName} ${readScore(us)} - ${opp} ${readScore(them)}`;
}

function formatLive(e: EspnEvent, teamId: string, ourName: string): string {
  const { us, them } = competitorsFor(e, teamId);
  if (!us || !them) return "live";
  const opp = them.team?.displayName ?? them.team?.abbreviation ?? "?";
  const detail = e.competitions?.[0]?.status?.type?.shortDetail ?? "live";
  return `${ourName} ${readScore(us)} - ${opp} ${readScore(them)} · ${detail}`;
}

function formatNext(e: EspnEvent, teamId: string, now: Date, tz: string): string {
  const { us, them } = competitorsFor(e, teamId);
  const venue = us?.homeAway === "home" ? "vs" : us?.homeAway === "away" ? "@" : "vs";
  const opp = them?.team?.abbreviation ?? them?.team?.displayName ?? "?";
  const when = formatDate(new Date(e.date), now, tz);
  const tag = preseasonTag(e) ?? postseasonTag(e);
  const tail = tag ? ` (${tag})` : "";
  return `${when} ${venue} ${opp}${tail}`;
}

function preseasonTag(e: EspnEvent): string | undefined {
  const notes = e.competitions?.[0]?.notes;
  for (const n of notes ?? []) {
    if (n.headline && /preseason/i.test(n.headline)) return "preseason";
  }
  return undefined;
}
function postseasonTag(e: EspnEvent): string | undefined {
  const notes = e.competitions?.[0]?.notes;
  for (const n of notes ?? []) {
    if (n.headline && /playoffs|postseason|series|championship|world series/i.test(n.headline)) {
      return "postseason";
    }
  }
  return undefined;
}

function formatDate(d: Date, now: Date, tz: string): string {
  const ymd = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  const today = ymd(now);
  const tomorrow = ymd(new Date(now.getTime() + 86_400_000));
  const target = ymd(d);

  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true })
    .format(d).replace(/\s/g, "").toLowerCase().replace("am", "a").replace("pm", "p");

  if (target === today) return `Today ${time}`;
  if (target === tomorrow) return `Tomorrow ${time}`;

  const daysAhead = Math.floor((Date.parse(target) - Date.parse(today)) / 86_400_000);
  if (daysAhead >= 0 && daysAhead < 7) {
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
    return `${weekday} ${time}`;
  }

  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(d);
}
