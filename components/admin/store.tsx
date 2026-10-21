"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { listDirectory } from "@/app/admin/actions";
import { PlayerDossierModal } from "@/components/admin/player-dossier";
import { TeamDossierModal } from "@/components/admin/team-dossier";
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
  openTeam: (id: number, listIds?: number[]) => void;
  closeTeam: () => void;
} | null>(null);

function isRowControl(target: EventTarget | null, current?: EventTarget | null) {
  if (!target || target === current) return false;
  return Boolean((target as HTMLElement).closest("a, button, input, select, textarea, label"));
}

export function bindRow(onOpen: () => void, opts?: { className?: string; selected?: boolean; label?: string }) {
  return {
    className: [opts?.className ?? "pd-row", opts?.selected ? "on" : ""].filter(Boolean).join(" "),
    tabIndex: 0 as const,
    ...(opts?.label ? { "aria-label": opts.label } : {}),
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (isRowControl(event.target, event.currentTarget)) return;
      onOpen();
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (isRowControl(event.target, event.currentTarget)) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen();
      }
    },
  };
}

export function bindPlayerRow(
  id: number,
  listIds: number[],
  openPlayer: (id: number, listIds?: number[]) => void,
) {
  return bindRow(() => openPlayer(id, listIds));
}

export function AdminStore({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Directory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peek, setPeek] = useState<{ id: number; listIds: number[] } | null>(null);
  const [teamPeek, setTeamPeek] = useState<{ id: number; listIds: number[] } | null>(null);

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

  const openTeam = useCallback(
    (id: number, listIds?: number[]) => {
      const fallback = data?.teams.map((t) => t.id) ?? [id];
      setTeamPeek({ id, listIds: listIds?.length ? listIds : fallback });
    },
    [data],
  );

  const closeTeam = useCallback(() => setTeamPeek(null), []);

  const value = useMemo(
    () => ({ data, loading, error, reload, openPlayer, closePlayer, openTeam, closeTeam }),
    [data, loading, error, reload, openPlayer, closePlayer, openTeam, closeTeam],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {teamPeek ? (
        <TeamDossierModal
          teamId={teamPeek.id}
          listIds={teamPeek.listIds}
          onClose={closeTeam}
          onOpen={(id) => setTeamPeek((cur) => (cur ? { ...cur, id } : { id, listIds: [id] }))}
          onOpenPlayer={openPlayer}
          onSaved={() => void reload()}
        />
      ) : null}
      {peek ? (
        <PlayerDossierModal
          playerId={peek.id}
          listIds={peek.listIds}
          onClose={closePlayer}
          onOpen={(id) => setPeek((cur) => (cur ? { ...cur, id } : { id, listIds: [id] }))}
          onOpenTeam={openTeam}
          onSaved={() => void reload()}
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
