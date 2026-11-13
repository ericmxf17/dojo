import { useSyncExternalStore } from "react";

export const FEATURES = [
  { id: "payroll", label: "Payroll", note: "Drafts, hours and exports" },
  { id: "documents", label: "Legal documents", note: "Licenses, versions and deadlines" },
  { id: "calendar", label: "Calendar & orders", note: "Events and recurring orders" },
  { id: "tools", label: "Connected tools", note: "Toast, 7shifts, MarketMan and more" },
  { id: "imports", label: "Imports", note: "Bring in CSV records" },
  { id: "pantry", label: "Digital pantry", note: "Inventory on hand" },
  { id: "records", label: "Records", note: "Every source record" },
  { id: "ask", label: "Ask sidework", note: "Questions about your numbers" },
  { id: "sales", label: "Net sales", note: "Dashboard number" },
  { id: "hours", label: "Employee hours", note: "Dashboard number" },
  { id: "wages", label: "Base wages", note: "Dashboard number" },
  { id: "ratio", label: "Wage-to-sales ratio", note: "Dashboard number" },
  { id: "alerts", label: "Needs attention", note: "Dashboard alerts" },
  { id: "comparison", label: "Service comparison", note: "Today vs. yesterday" },
  { id: "coverage", label: "Data coverage", note: "Which records are missing" },
] as const;
export type FeatureId = (typeof FEATURES)[number]["id"];
export const ALL_FEATURES: FeatureId[] = FEATURES.map((f) => f.id);
const KEY = "sidework.features";
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: FeatureId[] } | null = null;

export function parseFeatures(raw: string | null): FeatureId[] {
  if (!raw) return ALL_FEATURES;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? ALL_FEATURES.filter((f) => v.includes(f)) : ALL_FEATURES;
  } catch {
    return ALL_FEATURES;
  }
}
function read(): FeatureId[] {
  const raw = localStorage.getItem(KEY);
  if (!cache || cache.raw !== raw) cache = { raw, value: parseFeatures(raw) };
  return cache.value;
}
export function saveFeatures(ids: FeatureId[]) {
  localStorage.setItem(KEY, JSON.stringify(ids));
  listeners.forEach((l) => l());
}
export function useFeatures() {
  const features = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    read,
    () => ALL_FEATURES,
  );
  return { features, has: (id: FeatureId) => features.includes(id) };
}
