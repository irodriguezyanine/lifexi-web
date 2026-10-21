export type SanctionKind = "yellow_accum" | "second_yellow" | "red" | "other";

export type MatchdayLite = {
  number: number;
  played_on: string | null;
};

export type SanctionRow = {
  id: number;
  player_id: number;
  detail: string;
  sanction: string;
  sort_order: number;
  kind?: SanctionKind | null;
  duration?: number | null;
  origin_matchday?: number | null;
  starts_matchday?: number | null;
  issued_on?: string | null;
  voided?: boolean | null;
  note?: string | null;
  players?: { id?: number; full_name: string; team_id?: number } | { id?: number; full_name: string; team_id?: number }[] | null;
};

export type SanctionView = {
  id: number;
  playerId: number;
  playerName: string;
  teamId: number | null;
  teamName: string;
  detail: string;
  sanction: string;
  kind: SanctionKind;
  duration: number;
  origin: number;
  starts: number;
  ends: number;
  served: number;
  remaining: number;
  voided: boolean;
  note: string;
  issuedOn: string | null;
  active: boolean;
  lastSunday: boolean;
  servingToday: boolean;
  window: number[];
};

export function chileToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now);
}

export function formatDia(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!d) return iso;
  return `${d}.${m}${y ? `.${y.slice(2)}` : ""}`;
}

export function weekdayShort(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const day = new Date(utc).getUTCDay();
  return ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][day] ?? "";
}

export function parseDuration(text: string) {
  const m = String(text || "").match(/(\d+)/);
  const n = m ? Number(m[1]) : 1;
  return Math.max(1, Math.min(16, Number.isFinite(n) ? n : 1));
}

export function inferKind(detail: string): SanctionKind {
  const t = detail.toLowerCase();
  if (t.includes("roja") || t.includes("expuls")) return "red";
  if (t.includes("doble")) return "second_yellow";
  if (t.includes("acumul")) return "yellow_accum";
  return "other";
}

export function kindLabel(kind: SanctionKind) {
  if (kind === "yellow_accum") return "Acumulación";
  if (kind === "second_yellow") return "Doble TA";
  if (kind === "red") return "Roja";
  return "Otra";
}

export function durationLabel(n: number) {
  return n === 1 ? "1 fecha" : `${n} fechas`;
}

export function calendarState(matchdays: MatchdayLite[], now = new Date()) {
  const today = chileToday(now);
  const sorted = [...matchdays].sort((a, b) => a.number - b.number);
  const closed = sorted.filter((m) => m.played_on && m.played_on < today);
  const lastClosed = closed.reduce((max, m) => Math.max(max, m.number), 0);
  const todayMd = sorted.find((m) => m.played_on === today) ?? null;
  const upcoming = sorted.filter((m) => !m.played_on || m.played_on >= today);
  const next = upcoming[0] ?? null;
  return {
    today,
    lastClosed,
    todayMd,
    next,
    closedNumbers: new Set(closed.map((m) => m.number)),
  };
}

export function hydrateSanction(
  row: SanctionRow,
  cal: ReturnType<typeof calendarState>,
  teams: { id: number; name: string }[],
  fallbackStart: number,
): SanctionView {
  const nested = Array.isArray(row.players) ? row.players[0] : row.players;
  const playerId = row.player_id ?? nested?.id ?? 0;
  const playerName = nested?.full_name ?? "Jugador";
  const teamId = nested?.team_id ?? null;
  const teamName = teamId != null ? (teams.find((t) => t.id === teamId)?.name ?? "") : "";
  const kind = (row.kind as SanctionKind) || inferKind(row.detail);
  const duration = row.duration ?? parseDuration(row.sanction);
  const origin = row.origin_matchday ?? Math.max(1, fallbackStart - 1);
  const starts = row.starts_matchday ?? fallbackStart;
  const ends = starts + duration - 1;
  const window = Array.from({ length: duration }, (_, i) => starts + i);
  const served = window.filter((n) => cal.closedNumbers.has(n)).length;
  const voided = Boolean(row.voided);
  const remaining = voided ? 0 : Math.max(0, duration - served);
  const servingToday = !voided && Boolean(cal.todayMd && window.includes(cal.todayMd.number));
  return {
    id: row.id,
    playerId,
    playerName,
    teamId,
    teamName,
    detail: row.detail,
    sanction: row.sanction || durationLabel(duration),
    kind,
    duration,
    origin,
    starts,
    ends,
    served,
    remaining,
    voided,
    note: row.note ?? "",
    issuedOn: row.issued_on ?? null,
    active: !voided && remaining > 0,
    lastSunday: !voided && remaining === 1,
    servingToday,
    window,
  };
}

export type SanctionLedger = Record<
  string,
  Partial<Pick<SanctionRow, "kind" | "duration" | "origin_matchday" | "starts_matchday" | "voided" | "note" | "issued_on">>
>;

export function readLedger(extra: unknown, body?: string | null): SanctionLedger {
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    const rec = extra as Record<string, unknown>;
    if (rec.items && typeof rec.items === "object") return rec.items as SanctionLedger;
    const keys = Object.keys(rec);
    if (keys.length && keys.every((k) => /^\d+$/.test(k))) return rec as SanctionLedger;
  }
  if (body) {
    try {
      const parsed = JSON.parse(body) as unknown;
      return readLedger(parsed, null);
    } catch {
      return {};
    }
  }
  return {};
}

export function applyLedger(rows: SanctionRow[], ledger: SanctionLedger): SanctionRow[] {
  return rows.map((row) => {
    const extra = ledger[String(row.id)];
    if (!extra) return row;
    return { ...row, ...extra, id: row.id, player_id: row.player_id };
  });
}

export const TEMPLATES: { label: string; kind: SanctionKind; duration: number; detail: string }[] = [
  { label: "Acumulación", kind: "yellow_accum", duration: 1, detail: "Acumulación de amarillas" },
  { label: "Doble TA", kind: "second_yellow", duration: 1, detail: "Doble amarilla" },
  { label: "Doble + acum.", kind: "second_yellow", duration: 2, detail: "Doble amarilla + acumulación" },
  { label: "Roja · 1", kind: "red", duration: 1, detail: "Expulsión" },
  { label: "Roja · 2", kind: "red", duration: 2, detail: "Expulsión" },
  { label: "Roja · 3", kind: "red", duration: 3, detail: "Expulsión" },
];
