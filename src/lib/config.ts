import { parse as parseYaml } from "yaml";
import configRaw from "../config.yaml?raw";

export interface Location {
  city: string;
  lat: number;
  lon: number;
  timezone: string;
}

export interface Config {
  location: Location;
}

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  cached = parseYaml(configRaw) as Config;
  return cached;
}
