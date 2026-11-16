import { describe, expect, it } from "vitest";
import { classifyAssistantIntent, trailingWeek } from "@/lib/sidework/assistant";

describe("Sidework assistant", () => {
  it("routes business questions to visual artifact intents", () => {
    expect(classifyAssistantIntent("Summarize payroll expenses for this week")).toBe("payroll");
    expect(classifyAssistantIntent("How were sales last night?")).toBe("sales");
    expect(classifyAssistantIntent("Did supplier costs change?")).toBe("purchases");
    expect(classifyAssistantIntent("What needs attention in inventory?")).toBe("attention");
    expect(classifyAssistantIntent("Give me a business overview")).toBe("overview");
  });

  it("uses a trailing seven-day period for weekly payroll", () => {
    expect(trailingWeek("2026-11-09")).toEqual({ start: "2026-11-03", end: "2026-11-09" });
  });
});
