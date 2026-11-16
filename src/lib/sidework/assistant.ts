import { addDays } from "./format";

export type AssistantIntent =
  "overview" | "sales" | "payroll" | "purchases" | "attention" | "question";

export function classifyAssistantIntent(question: string): AssistantIntent {
  const q = question.toLowerCase();
  if (/payroll|labor|labour|wage|hours|employee|staff/.test(q)) return "payroll";
  if (/purchase|supplier|spend|invoice|cost/.test(q)) return "purchases";
  if (/attention|alert|inventory|stock|expir|problem|risk/.test(q)) return "attention";
  if (/sales|revenue|service|night/.test(q)) return "sales";
  if (/summary|summarize|overview|how are we|how did we|business/.test(q)) return "overview";
  return "question";
}

export function trailingWeek(on: string) {
  return { start: addDays(on, -6), end: on };
}
