import Anthropic from "@anthropic-ai/sdk";
import type { Mode } from "../lib/mode";
import type { DashboardData, BriefingData } from "../lib/sample-data";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 400;

const SYSTEM = `You're the masthead editor of a personal Newsprint-style daily dashboard. Twice a day — Warm Up at 4 a.m. and Cool Down at 4 p.m. — you write the lead paragraph that sits below the masthead and above every other widget on the page.

Your job is to report the day's signals in a single short paragraph. Three to five sentences. One paragraph, plain text, no markdown, no emoji, no greeting, no sign-off.

Voice:
- Conversational, slightly literary. Like a thoughtful friend who has skimmed the day for the reader.
- Specific over vague. Name names — teams, scores, people on the calendar, weather thresholds, story titles when worth it.
- Lead with the most striking or actionable thing. Don't restate every widget; the reader will look at them too.
- Avoid clichés (game-changer, hit the ground running, etc.) and corporate hedges (it's worth noting, that said, etc.).
- Report sports scores in a sane way. For example if the score says Braves 7, Red Sox 0 that means the Braves are winning 7-0. If the score says Braves 3, Red Sox 7 that means the Braves are losing 7-3.
- For each team, the "current" line is today's in-progress or most recent game, and the "next scheduled" line is a separately scheduled future matchup against possibly a different opponent. They are unrelated. If a game is delayed or suspended, report only what's known (score and status) — do not assume it resumes on the date of the next scheduled game, and do not invent a resumption time.
- If a team is in the offseason and there is little news, don't mention them.

Mode framing:
- Warm Up: forward-looking. "Today...", "Heads up...", "Plan around the storms after 4..."
- Cool Down: retrospective with a peek at tomorrow. "Day's wrapped...", "Tomorrow's a light one...", "The Braves took it in 5..."

Don't moralize. The reader skimmed this in 8 seconds and moved on.`;

export async function fetchBriefing(
  data: DashboardData,
  mode: Mode,
  city: string,
  apiKey: string | undefined,
): Promise<BriefingData | null> {
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  const userContent = buildUserMessage(data, mode, city);

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userContent }],
    });
    const first = res.content[0];
    if (!first || first.type !== "text") return null;
    const text = first.text.trim();
    if (!text) return null;
    return { text };
  } catch (err) {
    console.warn("[briefing] failed:", err);
    return null;
  }
}

function buildUserMessage(data: DashboardData, mode: Mode, city: string): string {
  const lines: string[] = [];
  const dateStr = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  lines.push(`MODE: ${mode === "warmup" ? "Warm Up (morning)" : "Cool Down (evening)"}`);
  lines.push(`DATE: ${dateStr}, ${city}`);
  lines.push("");

  lines.push("WEATHER:");
  lines.push(`  ${data.weather.summary}`);
  lines.push(`  H ${data.weather.high}° / L ${data.weather.low}°`);
  lines.push(`  ${data.weather.rainNote}`);
  lines.push("");

  lines.push(`CALENDAR (${data.calendar.heading.toLowerCase()}):`);
  if (data.calendar.events.length === 0) {
    lines.push("  (nothing scheduled)");
  } else {
    for (const ev of data.calendar.events) {
      lines.push(`  ${ev.time} — ${ev.title}`);
    }
  }
  lines.push("");

  lines.push("SPORTS:");
  for (const g of data.sports.games) {
    lines.push(`  ${g.team}`);
    lines.push(`    current: ${g.result}`);
    if (g.next && g.next !== "—") {
      lines.push(`    next scheduled: ${g.next}`);
    }
  }
  lines.push("");

  lines.push("NEWS (grouped by section, most recent first within each):");
  let remaining = 8;
  for (const section of data.news.sections) {
    if (remaining <= 0) break;
    if (section.items.length === 0) continue;
    lines.push(`  [${section.label.toUpperCase()}]`);
    for (const n of section.items) {
      if (remaining <= 0) break;
      lines.push(`  - ${n.title} [${n.tag}]`);
      remaining--;
    }
  }

  return lines.join("\n");
}
