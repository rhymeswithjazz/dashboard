import type { Mode } from "../lib/mode";
import type { Location } from "../lib/config";
import type { WeatherData } from "../lib/sample-data";

interface OpenMeteoResponse {
  current: {
    time: string;
    temperature_2m: number;
    weather_code: number;
  };
  hourly: {
    time: string[];
    precipitation_probability: number[];
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
}

export async function fetchWeather(
  loc: Location,
  mode: Mode,
): Promise<WeatherData | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(loc.lat));
  url.searchParams.set("longitude", String(loc.lon));
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("hourly", "precipitation_probability");
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  );
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("timezone", loc.timezone);
  url.searchParams.set("forecast_days", "2");

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.warn(`[weather] non-2xx from open-meteo: ${res.status}`);
      return null;
    }
    const json = (await res.json()) as OpenMeteoResponse;
    return format(json, mode, loc);
  } catch (err) {
    console.warn("[weather] fetch failed:", err);
    return null;
  }
}

function format(json: OpenMeteoResponse, mode: Mode, loc: Location): WeatherData {
  const currentTemp = Math.round(json.current.temperature_2m);
  const condition = wmoToCondition(json.current.weather_code);
  const summary = `${currentTemp}°F ${condition}`;

  const dayIdx = mode === "warmup" ? 0 : 1;
  const high = Math.round(json.daily.temperature_2m_max[dayIdx] ?? 0);
  const low = Math.round(json.daily.temperature_2m_min[dayIdx] ?? 0);

  const rainNote = rainNoteFor(json, mode, loc);

  return { summary, high, low, rainNote };
}

function rainNoteFor(
  json: OpenMeteoResponse,
  mode: Mode,
  loc: Location,
): string {
  const now = new Date();
  const threshold = 40; // %

  if (mode === "warmup") {
    // Look at today's remaining hours.
    const idxs: number[] = [];
    for (let i = 0; i < json.hourly.time.length; i++) {
      const t = new Date(json.hourly.time[i]!);
      if (t < now) continue;
      if (sameLocalDay(t, now, loc.timezone)) idxs.push(i);
      else break;
    }
    return summarizeWindow(json, idxs, threshold, loc.timezone, "today");
  }

  // cooldown: rest of tonight + tomorrow morning preview
  const idxs: number[] = [];
  for (let i = 0; i < json.hourly.time.length; i++) {
    const t = new Date(json.hourly.time[i]!);
    if (t < now) continue;
    idxs.push(i);
    if (idxs.length >= 18) break;
  }
  const remaining = summarizeWindow(json, idxs, threshold, loc.timezone, "tonight");
  const tomorrowHigh = Math.round(json.daily.temperature_2m_max[1] ?? 0);
  return `${remaining} · tomorrow H ${tomorrowHigh}°`;
}

function summarizeWindow(
  json: OpenMeteoResponse,
  idxs: number[],
  threshold: number,
  tz: string,
  windowName: "today" | "tonight",
): string {
  if (idxs.length === 0) {
    return windowName === "today" ? "dry rest of day" : "dry through morning";
  }
  let firstRainIdx = -1;
  let peakProb = 0;
  for (const i of idxs) {
    const p = json.hourly.precipitation_probability[i] ?? 0;
    if (p > peakProb) peakProb = p;
    if (firstRainIdx === -1 && p >= threshold) firstRainIdx = i;
  }
  if (firstRainIdx === -1) {
    return windowName === "today" ? "dry rest of day" : "dry through morning";
  }
  const when = formatLocalHour(new Date(json.hourly.time[firstRainIdx]!), tz);
  return `rain ${peakProb}% after ${when}`;
}

function sameLocalDay(a: Date, b: Date, tz: string): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(a) === fmt.format(b);
}

function formatLocalHour(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: true,
  })
    .format(d)
    .replace(/\s/g, "")
    .toLowerCase()
    .replace("am", "a")
    .replace("pm", "p");
}

function wmoToCondition(code: number): string {
  if (code === 0) return "clear";
  if (code === 1) return "mostly clear";
  if (code === 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code >= 45 && code <= 48) return "foggy";
  if (code >= 51 && code <= 57) return "drizzling";
  if (code >= 61 && code <= 67) return "rainy";
  if (code >= 71 && code <= 77) return "snowing";
  if (code >= 80 && code <= 82) return "showers";
  if (code === 85 || code === 86) return "snow showers";
  if (code >= 95 && code <= 99) return "thunderstorms";
  return "—";
}
