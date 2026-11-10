import {
  ArrowUpRight,
  Check,
  FileText,
  CalendarDays,
  ChevronRight,
  Download,
  Circle,
} from "lucide-react";
import { Logo } from "./brand";
const values = [
  ["Net sales", "$1,020"],
  ["Employee hours", "16"],
  ["Base wages", "$320"],
  ["Wage / sales", "31.37%"],
];
export function ServicePreview({ full = false }: { full?: boolean }) {
  return (
    <div className="product-preview">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Logo compact /> Service overview
        </div>
        <span className="text-xs text-muted-foreground">Sample · Nov 9, 2026</span>
      </div>
      <div className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Monday, November 9</p>
            <h3 className="mt-1 text-xl font-medium">A clear picture of service.</h3>
          </div>
          <ArrowUpRight className="size-5 text-primary" />
        </div>
        <div className={`grid gap-5 ${full ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
          {values.map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 text-[30px] font-medium text-forest">{value}</p>
              <div className="mt-2 h-1 w-12 rounded bg-sage" />
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <Check className="size-4 text-primary" /> Sales, labor and purchase records available
        </div>
      </div>
    </div>
  );
}
export function PayrollPreview() {
  return (
    <div className="product-preview">
      <div className="flex items-center justify-between border-b border-border p-5">
        <h3 className="font-medium">Payroll preparation</h3>
        <span className="text-xs text-muted-foreground">Nov 8–9</span>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Hours</th>
            <th>Base wages</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Alex Rivera", "11", "$220"],
            ["Jordan Lee", "10", "$200"],
            ["Sam Morgan", "10", "$200"],
          ].map((r) => (
            <tr key={r[0]}>
              {r.map((v, i) => (
                <td key={i}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between p-5">
        <span className="text-sm text-muted-foreground">Payroll preparation draft</span>
        <Download className="size-5 text-primary" />
      </div>
    </div>
  );
}
export function DocumentsPreview() {
  return (
    <div className="product-preview">
      <div className="flex items-center gap-2 border-b border-border p-5">
        <FileText className="size-5 text-primary" />
        <h3 className="font-medium">Your document cabinet</h3>
      </div>
      {[
        ["Food service permit", "Nov 18, 2026", "Permit"],
        ["General liability insurance", "Nov 27, 2026", "Insurance"],
        ["Equipment lease", "Nov 6, 2026", "Contract"],
      ].map(([title, date, category]) => (
        <div
          className="flex items-center gap-4 border-b border-border p-5 last:border-0"
          key={title}
        >
          <FileText className="size-8 text-primary/60" />
          <div className="flex-1">
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {category} · Review by {date}
            </p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>
      ))}
    </div>
  );
}
export function CalendarPreview() {
  return (
    <div className="product-preview">
      <div className="flex items-center justify-between border-b border-border p-5">
        <h3 className="flex items-center gap-2 font-medium">
          <CalendarDays className="size-5 text-primary" />
          The week ahead
        </h3>
        <span className="text-xs text-muted-foreground">November</span>
      </div>
      {[
        ["11", "WED", "Produce delivery", "8 lb tomatoes · 4 lb lemons"],
        ["12", "THU", "Team check-in", "Weekly service review"],
        ["18", "WED", "Food service permit", "Document deadline"],
      ].map(([d, day, title, sub]) => (
        <div className="flex gap-5 border-b border-border p-5 last:border-0" key={d}>
          <div className="w-9 text-center">
            <div className="text-xs text-muted-foreground">{day}</div>
            <div className="text-2xl font-medium">{d}</div>
          </div>
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
export function ToolsPreview() {
  return (
    <div className="product-preview p-6">
      <h3 className="mb-4 font-medium">Your restaurant toolkit</h3>
      {["Toast", "7shifts", "MarketMan", "Restaurant365", "Resy"].map((name) => (
        <div
          key={name}
          className="flex items-center justify-between border-b border-border py-3.5 last:border-0"
        >
          <span className="font-medium">{name}</span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Circle className="size-2.5" />
            Not connected
          </span>
        </div>
      ))}
    </div>
  );
}
