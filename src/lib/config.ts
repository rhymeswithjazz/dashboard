import { parse as parseYaml } from "yaml";
import configRaw from "../config.yaml?raw";

export interface Location {
  city: string;
  lat: number;
  lon: number;
  timezone: string;
}

export interface NewsConfig {
  hn_count: number;
  per_source_max: number;
  total_max: number;
  rss: string[];
  reddit_subs: string[];
  google_news_queries: string[];
}

export interface Config {
  location: Location;
  news: NewsConfig;
}

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  cached = parseYaml(configRaw) as Config;
  return cached;
}
