import { parse as parseYaml } from "yaml";
import configRaw from "../config.yaml?raw";

export interface Location {
  city: string;
  lat: number;
  lon: number;
  timezone: string;
}

export interface CategorySources {
  hn?: boolean;
  rss?: string[];
  reddit_subs?: string[];
  google_news_queries?: string[];
}

export interface NewsConfig {
  hn_count: number;
  per_source_max: number;
  per_category_max: number;
  categories: Record<string, CategorySources>;
}

export type SportsLeague = "mlb" | "nfl" | "college-football";

export interface SportsTeam {
  league: SportsLeague;
  team_id: number;
  label: string;
}

export interface SportsConfig {
  teams: SportsTeam[];
}

export interface Config {
  location: Location;
  news: NewsConfig;
  sports: SportsConfig;
}

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  cached = parseYaml(configRaw) as Config;
  return cached;
}
