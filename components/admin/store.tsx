"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { listDirectory } from "@/app/admin/actions";
import { PlayerDossierModal } from "@/components/admin/player-dossier";
import "@/app/admin/player-dossier.css";

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
  openPlayer: (id: number, listIds?: number[]) => void;
  closePlayer: () => void;
} | null>(null);

export function bindPlayerRow(
  id: number,
  listIds: number[],
  openPlayer: (id: number, listIds?: number[]) => void,
) {
  return {
    className: "pd-row",
    tabIndex: 0 as const,
    onClick: () => openPlayer(id, listIds),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPlayer(id, listIds);
      }
    },
  };
}

export function AdminStore({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [data, setData] = useState<Directory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peek, setPeek] = useState<{ id: number; listIds: number[] } | null>(null);

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

  const openPlayer = useCallback(
    (id: number, listIds?: number[]) => {
      const fallback = data?.players.map((p) => p.id) ?? [id];
      setPeek({ id, listIds: listIds?.length ? listIds : fallback });
    },
    [data],
  );

  const closePlayer = useCallback(() => setPeek(null), []);

  const value = useMemo(
    () => ({ data, loading, error, reload, openPlayer, closePlayer }),
    [data, loading, error, reload, openPlayer, closePlayer],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {peek ? (
        <PlayerDossierModal
          playerId={peek.id}
          listIds={peek.listIds}
          onClose={closePlayer}
          onOpen={(id) => setPeek((cur) => (cur ? { ...cur, id } : { id, listIds: [id] }))}
          onEdit={() => {
            const id = peek.id;
            closePlayer();
            router.push(`/admin/jugadores?id=${id}`);
          }}
        />
      ) : null}
    </Ctx.Provider>
  );
}

export function useAdminData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("AdminStore");
  return ctx;
}
