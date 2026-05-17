export type Mode = "warmup" | "cooldown";

export interface ModeMeta {
  mode: Mode;
  label: string;
  builtAt: Date;
}

export function getMode(): Mode {
  const raw = process.env["MODE"]?.toLowerCase();
  if (raw === "cooldown") return "cooldown";
  if (raw === "warmup") return "warmup";

  const hourUtc = new Date().getUTCHours();
  return hourUtc >= 14 ? "cooldown" : "warmup";
}

export function getModeMeta(): ModeMeta {
  const mode = getMode();
  return {
    mode,
    label: mode === "warmup" ? "Warm Up" : "Cool Down",
    builtAt: new Date(),
  };
}

const ET_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const ET_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatDateET(d: Date): string {
  return ET_FORMATTER.format(d);
}

export function formatTimeET(d: Date): string {
  return ET_TIME_FORMATTER.format(d);
}

export function volumeNumber(d: Date): string {
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const day = Math.floor((d.getTime() - start.getTime()) / 86_400_000) + 1;
  const roman = toRoman(d.getUTCFullYear());
  return `Vol. ${roman} · No. ${day}`;
}

function toRoman(num: number): string {
  const map: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let n = num;
  let out = "";
  for (const [v, s] of map) {
    while (n >= v) { out += s; n -= v; }
  }
  return out;
}
