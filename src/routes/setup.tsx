import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeLogo } from "@/components/sidework/brand";
import { FEATURES, saveFeatures, useFeatures, type FeatureId } from "@/lib/sidework/features";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Set up your workspace — sidework" },
      { name: "description", content: "Pick the sidework features your restaurant needs." },
      { property: "og:title", content: "Set up your workspace — sidework" },
      { property: "og:description", content: "Pick the sidework features your restaurant needs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Setup,
});

function Setup() {
  const { features } = useFeatures();
  const [picked, setPicked] = useState<FeatureId[] | null>(null);
  const sel = picked ?? features;
  const navigate = useNavigate();
  const toggle = (id: FeatureId) =>
    setPicked(sel.includes(id) ? sel.filter((f) => f !== id) : [...sel, id]);
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto max-w-[1000px] px-6 py-6">
        <HomeLogo />
      </header>
      <main className="mx-auto max-w-[1000px] px-6 pb-20 pt-8">
        <h1 className="text-4xl font-medium md:text-5xl">What do you want to see?</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Pick only what your restaurant uses. You can change this anytime.
        </p>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const on = sel.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(f.id)}
                className={`flex items-start justify-between gap-3 rounded-md border p-5 text-left transition-colors ${on ? "border-primary bg-secondary" : "border-border bg-card hover:bg-muted"}`}
              >
                <span>
                  <span className="block font-medium">{f.label}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{f.note}</span>
                </span>
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                >
                  {on && <Check className="size-4" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            className="h-12 px-7 text-base"
            onClick={() => {
              saveFeatures(sel);
              navigate({ to: "/dashboard" });
            }}
          >
            Open my dashboard <ArrowRight />
          </Button>
          <Button variant="ghost" onClick={() => setPicked(FEATURES.map((f) => f.id))}>
            Select all
          </Button>
          <Button variant="ghost" onClick={() => setPicked([])}>
            Clear
          </Button>
        </div>
      </main>
    </div>
  );
}
