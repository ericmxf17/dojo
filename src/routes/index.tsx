import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { ArrowRight, ArrowDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeLogo } from "@/components/sidework/brand";
import {
  ServicePreview,
  PayrollPreview,
  DocumentsPreview,
  CalendarPreview,
  ToolsPreview,
} from "@/components/sidework/previews";
import tomato from "@/assets/produce-tomato-soft.png";
import lemon from "@/assets/produce-lemon-soft.png";
import lime from "@/assets/produce-lime-soft.png";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "sidework — Side work, finally handled." },
      {
        name: "description",
        content:
          "Your restaurant’s numbers, paperwork, and next steps—in one place. Explore the Sidework owner demo.",
      },
      { property: "og:title", content: "sidework — Side work, finally handled." },
      {
        property: "og:description",
        content: "Your restaurant’s numbers, paperwork, and next steps—in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Homepage,
});
const features = [
  {
    num: "01",
    title: "Know how service went.",
    text: "The numbers that matter, without the digging. See sales, hours and base wages together—with the records behind every figure.",
    label: "See the dashboard",
    to: "/dashboard" as const,
    Preview: ServicePreview,
  },
  {
    num: "02",
    title: "Prepare payroll in one place.",
    text: "Bring employee hours together. Review tips and adjustments, then save a clear payroll preparation draft.",
    label: "Explore payroll",
    to: "/payroll" as const,
    Preview: PayrollPreview,
  },
  {
    num: "03",
    title: "Give paperwork a home.",
    text: "Permits, policies and contracts, neatly together. Keep every file version and the next deadline in sight.",
    label: "Open the cabinet",
    to: "/documents" as const,
    Preview: DocumentsPreview,
  },
  {
    num: "04",
    title: "Stay ahead of the week.",
    text: "Know what’s coming through the door. Keep events, deliveries and recurring order plans on one calendar.",
    label: "Explore the calendar",
    to: "/calendar" as const,
    Preview: CalendarPreview,
  },
  {
    num: "05",
    title: "Work with the tools you already use.",
    text: "Dedicated spaces for your restaurant tools. Bring in mapped records, with their sources clearly attached. Live connections are not connected.",
    label: "Explore workspaces",
    to: "/providers/$provider" as const,
    Preview: ToolsPreview,
  },
];
function Homepage() {
  const scene = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rows = document.querySelectorAll(".feature-row");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("feature-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    rows.forEach((row) => { row.classList.add("feature-reveal"); observer.observe(row); });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const move = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const factor = window.innerWidth < 768 ? 0.25 : 1;
        scene.current?.querySelectorAll<HTMLElement>(".produce").forEach((el, i) => {
          const y = Math.min(window.scrollY, 950);
          el.style.transform = `translateY(${y * (i === 1 ? -0.12 : 0.09) * factor}px) rotate(${y * (i === 1 ? -0.017 : 0.012) * factor}deg)`;
        });
      });
    };
    window.addEventListener("scroll", move, { passive: true });
    return () => {
      window.removeEventListener("scroll", move);
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div className="overflow-hidden bg-background">
      <header className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-6 md:px-10">
        <HomeLogo />
        <nav className="flex items-center gap-5">
          <Button variant="ghost" asChild className="hidden sm:inline-flex">
            <a href="#platform">Explore the platform</a>
          </Button>
          <Button asChild className="h-11 px-5">
            <Link to="/setup">
              Open demo <ArrowUpRightIcon />
            </Link>
          </Button>
        </nav>
      </header>
      <main>
        <div
          ref={scene}
          className="home-hero relative mx-auto flex max-w-[1240px] flex-col items-center px-6 pb-20 pt-24 text-center"
        >
          <img src={tomato} width={1024} height={1024} alt="" className="produce produce-tomato" />
          <img src={lemon} width={1024} height={1024} alt="" className="produce produce-lemon" />
          <img src={lime} width={1024} height={1024} alt="" className="produce produce-lime" />
          <div className="relative z-10 max-w-[770px]">
            <h1 className="hero-heading text-forest">
              Side work,
              <br />
              finally handled.
            </h1>
            <p className="mx-auto mt-7 max-w-[490px] text-lg leading-relaxed text-muted-foreground md:text-xl">
              Your restaurant’s numbers, paperwork,
              <br className="hidden sm:block" /> and next steps—in one place.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="h-12 px-7 text-base">
                <Link to="/setup">
                  Open the demo <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="ghost" className="h-12 px-5">
                <a href="#platform">
                  Take a look around <ArrowDown />
                </a>
              </Button>
            </div>
          </div>
          <a
            href="#platform"
            className="absolute bottom-9 left-1/2 -translate-x-1/2 text-muted-foreground"
            aria-label="Scroll to the platform"
          >
            <ArrowDown className="size-5" />
          </a>
        </div>
        <section id="platform" className="scroll-mt-8 border-t border-border bg-card">
          <div className="mx-auto max-w-[1120px] px-6 py-16 md:px-10">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="mb-3 text-sm font-medium text-primary">LESS SCATTER. MORE CLARITY.</p>
                <h2 className="text-3xl font-medium md:text-[42px]">
                  Your whole restaurant.
                  <br />
                  One clearer picture.
                </h2>
              </div>
              <p className="max-w-xs text-base leading-relaxed text-muted-foreground">
                From the last service to the next delivery,
                <br className="hidden md:block" /> keep the important things together.
              </p>
            </div>
            <ServicePreview full />
          </div>
        </section>
        <section className="mx-auto max-w-[1120px] px-6 md:px-10">
          {features.map(({ num, title, text, label, to, Preview }) => (
            <div className="feature-row border-b border-border last:border-0" key={num}>
              <div className="feature-copy">
                <p className="mb-5 text-sm font-medium text-primary">
                  {num} /{" "}
                  {num === "01"
                    ? "SERVICE"
                    : num === "02"
                      ? "PAYROLL"
                      : num === "03"
                        ? "DOCUMENTS"
                        : num === "04"
                          ? "PLANNING"
                          : "YOUR TOOLS"}
                </p>
                <h2 className="max-w-md text-[36px] font-medium leading-[1.15] md:text-[42px]">
                  {title}
                </h2>
                <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
                  {text}
                </p>
                <Button asChild variant="link" className="mt-5 px-0 text-base">
                  {to === "/providers/$provider" ? (
                    <Link to={to} params={{ provider: "toast" }}>
                      {label}
                      <ChevronRight />
                    </Link>
                  ) : (
                    <Link to={to}>
                      {label}
                      <ChevronRight />
                    </Link>
                  )}
                </Button>
              </div>
              <Preview />
            </div>
          ))}
        </section>
        <section className="border-t border-border bg-secondary py-20">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <h2 className="text-4xl font-medium md:text-5xl">Make room for what’s next.</h2>
            <p className="mt-5 text-lg text-muted-foreground">
              A little less side work. A little more perspective.
            </p>
            <Button asChild className="mt-8 h-12 px-7 text-base">
              <Link to="/setup">
                Step inside the demo <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-5 px-6 py-8 md:px-10">
        <HomeLogo />
        <p className="text-sm text-muted-foreground">© 2026 sidework</p>
        <Link to="/setup" className="text-sm">
          Open the demo ↗
        </Link>
      </footer>
    </div>
  );
}
function ArrowUpRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M6 18 18 6M6 6h12v12" />
    </svg>
  );
}
