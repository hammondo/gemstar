// src/utils/dates.ts — Simple date helpers (no heavy dependency)

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function nextMonday(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay(); // 0=Sun, 1=Mon ...
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  return addDays(d, daysUntilMonday);
}

export function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatAWST(date: Date): string {
  return date.toLocaleString("en-AU", {
    timeZone: "Australia/Perth",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}
