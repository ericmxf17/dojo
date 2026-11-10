import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSideWork } from "@/lib/sidework/context";
import { createWorkspaceApi } from "@/lib/sidework/workspace-api";
export function useWorkspace() {
  const { api, baseUrl, keyBase, date, openSources, mode } = useSideWork();
  const workspace = useMemo(() => createWorkspaceApi(api, baseUrl), [api, baseUrl]);
  return { workspace, keyBase, date, openSources, mode };
}
export function useWorkspaceQuery<T>(key: unknown[], fn: () => Promise<T>) {
  const { keyBase } = useWorkspace();
  return useQuery({ queryKey: [...keyBase, "workspace", ...key], queryFn: fn, retry: false });
}
