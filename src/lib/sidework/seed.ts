import type { SampleState } from "./engine";
import type { RecordData, RecordKind, StoredRecord } from "./types";

type Row = RecordData;

function build(importId: string, filename: string, kind: RecordKind, rows: Row[]): StoredRecord[] {
  return rows.map((data, i) => {
    const id = `${importId}-r${i + 2}`;
    return {
      id,
      kind,
      data,
      source: {
        record_id: id,
        import_id: importId,
        filename,
        row_number: i + 2,
        external_id: String(data.external_id),
        url: null,
      },
    };
  });
}

export function seedState(): SampleState {
  const sales = build("imp-sales-1109", "juniper-sales-nov-8-9.csv", "sales", [
    {
      external_id: "S-0801",
      business_date: "2026-11-08",
      item: "Latte",
      quantity: 90,
      net_sales_cents: 54000,
    },
    {
      external_id: "S-0802",
      business_date: "2026-11-08",
      item: "Sandwich",
      quantity: 40,
      net_sales_cents: 48000,
    },
    {
      external_id: "S-0901",
      business_date: "2026-11-09",
      item: "Latte",
      quantity: 100,
      net_sales_cents: 60000,
    },
    {
      external_id: "S-0902",
      business_date: "2026-11-09",
      item: "Sandwich",
      quantity: 35,
      net_sales_cents: 42000,
    },
  ]);
  const labor = build("imp-labor-1109", "juniper-hours-nov-8-9.csv", "labor", [
    {
      external_id: "L-0801",
      business_date: "2026-11-08",
      employee: "Avery",
      hours: 7,
      hourly_rate_cents: 2000,
    },
    {
      external_id: "L-0802",
      business_date: "2026-11-08",
      employee: "Jordan",
      hours: 7,
      hourly_rate_cents: 2000,
    },
    {
      external_id: "L-0901",
      business_date: "2026-11-09",
      employee: "Avery",
      hours: 8,
      hourly_rate_cents: 2000,
    },
    {
      external_id: "L-0902",
      business_date: "2026-11-09",
      employee: "Jordan",
      hours: 8,
      hourly_rate_cents: 2000,
    },
  ]);
  const purchases = build("imp-purch-1109", "juniper-purchases-nov-8-9.csv", "purchases", [
    {
      external_id: "P-0801",
      business_date: "2026-11-08",
      vendor: "Local Dairy",
      item: "Milk",
      quantity: 20,
      unit: "liter",
      total_cents: 6000,
    },
    {
      external_id: "P-0901",
      business_date: "2026-11-09",
      vendor: "Local Dairy",
      item: "Milk",
      quantity: 20,
      unit: "liter",
      total_cents: 7200,
    },
    {
      external_id: "P-0902",
      business_date: "2026-11-09",
      vendor: "Market Greens",
      item: "Spinach",
      quantity: 3,
      unit: "kg",
      total_cents: 2400,
    },
  ]);
  const inventory = build("imp-inv-1109", "juniper-inventory-nov-9.csv", "inventory", [
    {
      external_id: "I-0901",
      snapshot_date: "2026-11-09",
      ingredient: "Milk",
      quantity: 4,
      unit: "liter",
      low_stock_threshold: 5,
      expiration_date: "2026-11-11",
      batch_id: "MLK-1109",
    },
    {
      external_id: "I-0902",
      snapshot_date: "2026-11-09",
      ingredient: "Spinach",
      quantity: 2,
      unit: "kg",
      low_stock_threshold: 1,
      expiration_date: "2026-11-10",
      batch_id: "SPN-1109",
    },
    {
      external_id: "I-0903",
      snapshot_date: "2026-11-09",
      ingredient: "Coffee beans",
      quantity: 12,
      unit: "kg",
      low_stock_threshold: 3,
      expiration_date: "2027-01-01",
      batch_id: "COF-1101",
    },
  ]);
  const mk = (id: string, kind: RecordKind, filename: string, recs: StoredRecord[]) => ({
    id,
    kind,
    filename,
    status: "committed" as const,
    errors: [],
    row_count: recs.length,
    preview: recs.map((r) => r.data),
    created_at: "2026-11-09T22:10:00Z",
    committed_at: "2026-11-09T22:11:00Z",
    file_hash: `seed-${id}`,
  });
  return {
    records: [...sales, ...labor, ...purchases, ...inventory],
    imports: [
      mk("imp-sales-1109", "sales", "juniper-sales-nov-8-9.csv", sales),
      mk("imp-labor-1109", "labor", "juniper-hours-nov-8-9.csv", labor),
      mk("imp-purch-1109", "purchases", "juniper-purchases-nov-8-9.csv", purchases),
      mk("imp-inv-1109", "inventory", "juniper-inventory-nov-9.csv", inventory),
    ],
  };
}
