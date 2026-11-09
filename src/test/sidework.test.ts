import { describe, expect, it } from "vitest";
import { answerQuestion, computeBriefing, computeInventory } from "@/lib/sidework/engine";
import { seedState } from "@/lib/sidework/seed";
import { validateCsv } from "@/lib/sidework/csv";

describe("Juniper Kitchen briefing for 2026-11-09", () => {
  const b = computeBriefing(seedState(), "2026-11-09");
  it("net sales are $1,020", () => expect(b.metrics.net_sales.amount_cents).toBe(102000));
  it("estimated base wages are $320", () => expect(b.metrics.estimated_wages.amount_cents).toBe(32000));
  it("recorded purchases are $96", () => expect(b.metrics.recorded_purchases.amount_cents).toBe(9600));
  it("wage-to-sales ratio is 31.37%", () => expect(b.metrics.estimated_wage_to_sales_percent).toBe(31.37));
  it("sales are unchanged vs Nov 8", () => expect(b.changes_vs_previous_day.net_sales?.amount_cents).toBe(0));
  it("wages increased by $40", () => expect(b.changes_vs_previous_day.estimated_wages?.amount_cents).toBe(4000));
  it("has exactly the four expected alerts", () => {
    expect(b.alerts.map((a) => a.type).sort()).toEqual(["expiration_approaching", "expiration_approaching", "low_stock", "price_increase"]);
    expect(b.alerts.find((a) => a.type === "price_increase")?.title).toContain("20%");
  });
});

describe("rules", () => {
  it("missing data is null, not zero", () => {
    expect(computeBriefing(seedState(), "2026-11-20").metrics.net_sales.amount_cents).toBeNull();
  });
  it("milk is flagged low stock (4 < 5 liters)", () => {
    const milk = computeInventory(seedState(), "2026-11-09").items.find((i) => i.ingredient === "Milk");
    expect(milk?.statuses).toContain("low_stock");
  });
  it("rejects duplicate external IDs within a file", () => {
    const r = validateCsv("sales", "external_id,date,item,quantity,net_sales\nA,2026-11-10,Latte,1,600\nA,2026-11-10,Latte,1,600\n");
    expect(r.errors.some((e) => e.row === 3)).toBe(true);
  });
  it("unsupported questions are not answered", () => {
    expect(answerQuestion(seedState(), "Will tomorrow be busy?", "2026-11-09").supported).toBe(false);
  });
});

describe('CSV parity and edge cases', () => {
  it('normalizes dollar inputs to integer cents', () => {
    const r = validateCsv('sales', 'external_id,date,item,quantity,net_sales\nD,2026-11-10,Tea,2,8.50\n');
    expect(r.errors).toEqual([]);
    expect(r.rows[0]?.data.net_sales_cents).toBe(850);
    expect(r.rows[0]?.data.business_date).toBe('2026-11-10');
  });
  it.each([
    'a,2026-02-30,Tea,1,3.00',
    'a,2026-11-10,Tea,0,3.00',
    'a,2026-11-10,Tea,1,3.001',
    'a,2026-11-10,Tea,NaN,3.00',
    'a,2026-11-10,Tea,-1,3.00',
  ])('rejects invalid CSV row: %s', row => {
    expect(validateCsv('sales', 'external_id,date,item,quantity,net_sales\n' + row).errors.length).toBeGreaterThan(0);
  });
  it('rejects unknown and repeated headers', () => {
    expect(validateCsv('sales', 'external_id,date,item,quantity,net_sales,unknown\na,2026-11-10,Tea,1,3.00,x').errors.length).toBeGreaterThan(0);
    expect(validateCsv('sales', 'external_id,date,item,quantity,net_sales,net_sales\na,2026-11-10,Tea,1,3.00,3.00').errors.length).toBeGreaterThan(0);
  });
  it('rejects unclosed quoted fields', () => {
    expect(validateCsv('sales', 'external_id,date,item,quantity,net_sales\na,2026-11-10,"Tea,1,3.00').errors.length).toBeGreaterThan(0);
  });
  it('does not mistake a forecast request for a recorded sales question', () => {
    expect(answerQuestion(seedState(), 'Forecast sales next month', '2026-11-09').supported).toBe(false);
  });
  it('treats stock exactly at its threshold as low', () => {
    const state = seedState();
    const milk = state.records.find(r => r.kind === 'inventory' && r.data.ingredient === 'Milk')!;
    milk.data.quantity = milk.data.low_stock_threshold ?? 5;
    expect(computeInventory(state, '2026-11-09').items.find(i => i.ingredient === 'Milk')?.statuses).toContain('low_stock');
  });
});
