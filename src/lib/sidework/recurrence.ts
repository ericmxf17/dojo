import type { EventInput } from "./workspace-types";
export function eventDates(event: EventInput, start: string, end: string): string[] {
  if (!event.active) return [];
  const original = new Date(event.date + "T12:00:00Z");
  const result: string[] = [];
  const finish = event.repeat_until && event.repeat_until < end ? event.repeat_until : end;
  for (let i = 0; i < 2000; i++) {
    const d = new Date(original);
    let valid = true;
    if (event.repeat === "weekly") d.setUTCDate(original.getUTCDate() + i * 7);
    if (event.repeat === "monthly") {
      d.setUTCDate(1);
      d.setUTCMonth(original.getUTCMonth() + i);
      const month = d.getUTCMonth();
      d.setUTCDate(original.getUTCDate());
      valid = d.getUTCMonth() === month;
    }
    if (event.repeat === "yearly") {
      d.setUTCDate(1);
      d.setUTCFullYear(original.getUTCFullYear() + i);
      const month = d.getUTCMonth();
      d.setUTCDate(original.getUTCDate());
      valid = d.getUTCMonth() === month;
    }
    const day = d.toISOString().slice(0, 10);
    if (day > finish) break;
    if (valid && day >= start) result.push(day);
    if (event.repeat === "none") break;
  }
  return result;
}
