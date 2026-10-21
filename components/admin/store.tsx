"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { listDirectory } from "@/app/admin/actions";

type Directory = Record<string, unknown> & {
  teams: { id: number; name: string; slug: string; is_dissolved: boolean; is_founding_team: boolean }[];
  players: { id: number; full_name: string; team_id: number; source_index: number }[];
  matchdays: {
    id: number;
    number: number;
    played_on: string | null;
    round_number: number;
    league_site_number: number | null;
  }[];
  calendar: Record<string, unknown>[];
  sanctions: Record<string, unknown>[];
  history: Record<string, unknown>[];
  tournaments: Record<string, unknown>[];
  media: Record<string, unknown>[];
  content: Record<string, unknown>[];
  season: Record<string, unknown> | null;
  stats: Record<string, unknown>[];
  standings: Record<string, unknown>[];
};

const Ctx = createContext<{
  data: Directory | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
} | null>(null);

export function AdminStore({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Directory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await listDirectory();
    if (!res.ok) {
      setError(res.error);
      setData(null);
    } else {
      setError(null);
      setData(res.data as Directory);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(() => ({ data, loading, error, reload }), [data, loading, error, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("AdminStore");
  return ctx;
}
