import { useQuery, type QueryKey } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createLiveApi, createSampleApi, type SideWorkApi } from "./api";
import type { RecordKind, SourceRef } from "./types";

export const DEFAULT_DATE = "2026-11-09";
export const DEFAULT_API_URL = (import.meta.env["VITE_SIDEWORK_API_URL"] as string | undefined) ?? "/sidework-api";

type Mode = "sample" | "live";
// Hosted demo defaults to clearly labeled browser-local sample data until a
// persistent backend is configured. Local development still starts connected.
export const DEFAULT_MODE: Mode = import.meta.env["VITE_SIDEWORK_DEFAULT_MODE"] === "live" ? "live"
  : import.meta.env["VITE_SIDEWORK_DEFAULT_MODE"] === "sample" ? "sample"
  : import.meta.env.PROD && !import.meta.env["VITE_SIDEWORK_API_URL"] ? "sample" : "live";

interface Settings {
  mode: Mode;
  setMode: (m: Mode) => void;
  baseUrl: string;
  setBaseUrl: (u: string) => void;
  date: string;
  setDate: (d: string) => void;
  api: SideWorkApi;
  keyBase: QueryKey;
  openSources: (title: string, sources: SourceRef[]) => void;
  sources: { title: string; sources: SourceRef[] } | null;
  closeSources: () => void;
}

const Ctx = createContext<Settings | null>(null);

export function SideWorkProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(DEFAULT_MODE);
  const [baseUrl, setBaseUrlState] = useState(DEFAULT_API_URL);
  const [date, setDate] = useState(DEFAULT_DATE);
  const [sources, setSources] = useState<Settings["sources"]>(null);

  useEffect(() => {
    const m = localStorage.getItem("sidework.mode");
    if (m === "live" || m === "sample") setModeState(m);
    const u = localStorage.getItem("sidework.baseUrl");
    if (u) setBaseUrlState(u);
  }, []);

  const value = useMemo<Settings>(() => {
    const api = mode === "sample" ? createSampleApi() : createLiveApi(baseUrl);
    return {
      mode,
      setMode: (m) => {
        localStorage.setItem("sidework.mode", m);
        setModeState(m);
      },
      baseUrl,
      setBaseUrl: (u) => {
        localStorage.setItem("sidework.baseUrl", u);
        setBaseUrlState(u);
      },
      date,
      setDate,
      api,
      keyBase: ["sw", mode, mode === "live" ? baseUrl : "local"],
      openSources: (title, s) => setSources({ title, sources: s }),
      sources,
      closeSources: () => setSources(null),
    };
  }, [mode, baseUrl, date, sources]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSideWork() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSideWork must be used inside SideWorkProvider");
  return v;
}

/* Query hooks — keys include mode + backend so modes never share cache. */
export function useBriefing() {
  const { api, keyBase, date } = useSideWork();
  return useQuery({ queryKey: [...keyBase, "briefing", date], queryFn: () => api.briefing(date), retry: false });
}
export function useInventory() {
  const { api, keyBase, date } = useSideWork();
  return useQuery({ queryKey: [...keyBase, "inventory", date], queryFn: () => api.inventory(date), retry: false });
}
export function useRecords(kind: RecordKind, on: string | null, limit: number, offset: number) {
  const { api, keyBase } = useSideWork();
  return useQuery({ queryKey: [...keyBase, "records", kind, on, limit, offset], queryFn: () => api.listRecords(kind, on, limit, offset), retry: false });
}
export function useRecord(id: string | null) {
  const { api, keyBase } = useSideWork();
  return useQuery({ queryKey: [...keyBase, "record", id], queryFn: () => api.getRecord(id!), enabled: !!id, retry: false });
}
export function useImports() {
  const { api, keyBase } = useSideWork();
  return useQuery({ queryKey: [...keyBase, "imports"], queryFn: () => api.listImports(), retry: false });
}
export function useTemplates() {
  const { api, keyBase } = useSideWork();
  return useQuery({ queryKey: [...keyBase, "templates"], queryFn: () => api.templates(), retry: false });
}
export function useIntegrations() {
  const { api, keyBase } = useSideWork();
  return useQuery({ queryKey: [...keyBase, "integrations"], queryFn: () => api.integrations(), retry: false });
}
export function useHealth() {
  const { api, keyBase, mode } = useSideWork();
  return useQuery({ queryKey: [...keyBase, "health"], queryFn: () => api.health(), retry: false, enabled: mode === "live", refetchInterval: 30000 });
}
