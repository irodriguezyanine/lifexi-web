"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getMatchWorkspace, saveMatchDesk, savePlayer } from "@/app/admin/actions";
import { IconChevL, IconChevR } from "@/components/admin/icons";
import { useAdminData } from "@/components/admin/store";
import type { AppearanceRow, EventKind, MatchEventRow, PlayerRow } from "@/lib/admin/types";
import "@/app/admin/match-desk.css";

type EventDraft = {
  key: string;
  kind: EventKind;
  teamId: number;
  playerId: number | "";
  assistPlayerId: number | "";
  minute: string;
  extra: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";
type MatchStatus = "played" | "scheduled" | "pending";

const GOAL_KINDS: EventKind[] = ["goal", "penalty", "own_goal"];
const CARD_KINDS: EventKind[] = ["yellow", "second_yellow", "red"];
const TABS = ["Marcador", "Goles", "Tarjetas", "Cierre"] as const;

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function asNum(v: string) {
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampScore(v: string) {
  const n = Number(String(v).replace(/\D/g, "") || "0");
  return String(Math.max(0, Math.min(20, n)));
}

function emptyGoal(teamId: number): EventDraft {
  return { key: uid(), kind: "goal", teamId, playerId: "", assistPlayerId: "", minute: "", extra: "" };
}

function reconstruct(apps: AppearanceRow[]): EventDraft[] {
  const out: EventDraft[] = [];
  for (const a of apps) {
    for (let i = 0; i < a.goals; i++) out.push({ ...emptyGoal(a.team_id), playerId: a.player_id });
    for (let i = 0; i < a.own_goals; i++) {
      out.push({ key: uid(), kind: "own_goal", teamId: a.team_id, playerId: a.player_id, assistPlayerId: "", minute: "", extra: "" });
    }
    let y = a.yellows;
    let r = a.reds;
    if (r > 0 && y >= 2) {
      out.push({ key: uid(), kind: "second_yellow", teamId: a.team_id, playerId: a.player_id, assistPlayerId: "", minute: "", extra: "" });
      y -= 2;
      r -= 1;
    }
    for (let i = 0; i < y; i++) {
      out.push({ key: uid(), kind: "yellow", teamId: a.team_id, playerId: a.player_id, assistPlayerId: "", minute: "", extra: "" });
    }
    for (let i = 0; i < r; i++) {
      out.push({ key: uid(), kind: "red", teamId: a.team_id, playerId: a.player_id, assistPlayerId: "", minute: "", extra: "" });
    }
  }
  return out;
}

function fromSaved(events: MatchEventRow[]): EventDraft[] {
  return events.map((e) => ({
    key: String(e.id),
    kind: e.kind,
    teamId: e.team_id,
    playerId: e.player_id ?? "",
    assistPlayerId: e.assist_player_id ?? "",
    minute: e.minute == null ? "" : String(e.minute),
    extra: e.extra_minute == null ? "" : String(e.extra_minute),
  }));
}

function goalSlotsFor(events: EventDraft[], teamId: number) {
  return events.filter((e) => GOAL_KINDS.includes(e.kind) && e.teamId === teamId);
}

function syncGoalSlots(events: EventDraft[], homeId: number, awayId: number, hg: number, ag: number) {
  const keep = events.filter((e) => !GOAL_KINDS.includes(e.kind));
  function fit(teamId: number, want: number) {
    const mine = goalSlotsFor(events, teamId);
    if (mine.length === want) return mine;
    if (mine.length < want) {
      return [...mine, ...Array.from({ length: want - mine.length }, () => emptyGoal(teamId))];
    }
    const assigned = mine.filter((e) => e.playerId !== "");
    const blank = mine.filter((e) => e.playerId === "");
    return [...assigned, ...blank].slice(0, want);
  }
  return [...keep, ...fit(homeId, hg), ...fit(awayId, ag)];
}

function PlayerPick({
  players,
  value,
  onChange,
  label = "Jugador",
}: {
  players: PlayerRow[];
  value: number | "";
  onChange: (id: number | "") => void;
  label?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}>
      <option value="">{label}</option>
      {players.map((p) => (
        <option key={p.id} value={p.id}>
          {p.full_name}
        </option>
      ))}
    </select>
  );
}

function minuteLabel(e: EventDraft) {
  if (!e.minute) return "—";
  return e.extra ? `${e.minute}+${e.extra}'` : `${e.minute}'`;
}

function kindLabel(kind: EventKind) {
  if (kind === "penalty") return "Penal";
  if (kind === "own_goal") return "Autogol";
  if (kind === "yellow") return "Amarilla";
  if (kind === "second_yellow") return "Doble amarilla";
  if (kind === "red") return "Roja";
  return "Gol";
}

export function MatchDesk({ matchId }: { matchId: number }) {
  const { openPlayer } = useAdminData();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [homeName, setHomeName] = useState("");
  const [awayName, setAwayName] = useState("");
  const [homeLogo, setHomeLogo] = useState<string | null>(null);
  const [awayLogo, setAwayLogo] = useState<string | null>(null);
  const [homeId, setHomeId] = useState(0);
  const [awayId, setAwayId] = useState(0);
  const [matchday, setMatchday] = useState<number | null>(null);
  const [homeGoals, setHomeGoals] = useState("0");
  const [awayGoals, setAwayGoals] = useState("0");
  const [status, setStatus] = useState<MatchStatus>("played");
  const [kickoff, setKickoff] = useState("");
  const [pitch, setPitch] = useState("");
  const [notes, setNotes] = useState("");
  const [referee, setReferee] = useState("");
  const [walkover, setWalkover] = useState("none");
  const [motm, setMotm] = useState<number | "">("");
  const [homePlayers, setHomePlayers] = useState<PlayerRow[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<PlayerRow[]>([]);
  const [lineup, setLineup] = useState<{ playerId: number; teamId: number; isHome: boolean }[]>([]);
  const [events, setEvents] = useState<EventDraft[]>([]);
  const [newName, setNewName] = useState("");
  const [newTeam, setNewTeam] = useState<"home" | "away">("home");

  const loadedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const inflightRef = useRef(false);
  const queuedRef = useRef(false);
  const lastSavedRef = useRef("");
  const payloadRef = useRef<Parameters<typeof saveMatchDesk>[0] | null>(null);

  const hg = Number(homeGoals) || 0;
  const ag = Number(awayGoals) || 0;
  const goalEvents = events.filter((e) => GOAL_KINDS.includes(e.kind));
  const cardEvents = events.filter((e) => CARD_KINDS.includes(e.kind));
  const allPlayers = [...homePlayers, ...awayPlayers];

  const payload = useMemo(
    () => ({
      matchId,
      homeGoals: status === "played" ? hg : null,
      awayGoals: status === "played" ? ag : null,
      status,
      kickoffTime: kickoff || null,
      pitch: pitch || null,
      notes: notes || null,
      referee: referee || null,
      walkover,
      motmPlayerId: motm === "" ? null : Number(motm),
      lineup,
      replaceEvents: true,
      events: events.map((e) => ({
        kind: e.kind,
        teamId: e.teamId,
        playerId: e.playerId === "" ? null : Number(e.playerId),
        assistPlayerId: e.assistPlayerId === "" ? null : Number(e.assistPlayerId),
        minute: asNum(e.minute),
        extraMinute: asNum(e.extra),
        notes: null,
      })),
    }),
    [matchId, hg, ag, status, kickoff, pitch, notes, referee, walkover, motm, lineup, events],
  );

  payloadRef.current = payload;

  const flushSave = useCallback(async (reason: "auto" | "tab" | "manual" | "leave" = "auto") => {
    if (!loadedRef.current || !payloadRef.current) return;
    const snap = JSON.stringify(payloadRef.current);
    if (snap === lastSavedRef.current && reason !== "manual") return;
    if (inflightRef.current) {
      queuedRef.current = true;
      return;
    }
    inflightRef.current = true;
    setSaveState("saving");
    setError(null);
    const res = await saveMatchDesk(payloadRef.current);
    inflightRef.current = false;
    if (!res.ok) {
      setSaveState("error");
      setError(res.error);
      if (queuedRef.current) {
        queuedRef.current = false;
        window.setTimeout(() => void flushSave(reason), 900);
      }
      return;
    }
    lastSavedRef.current = snap;
    setSaveState("saved");
    setSavedAt(Date.now());
    if (queuedRef.current) {
      queuedRef.current = false;
      await flushSave("auto");
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (!loadedRef.current) return;
    setSaveState((cur) => (cur === "saving" ? cur : "idle"));
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void flushSave("auto");
    }, 700);
  }, [flushSave]);

  useEffect(() => {
    void (async () => {
      const res = await getMatchWorkspace(matchId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const d = res.data as {
        match: {
          home_team_id: number;
          away_team_id: number;
          home_goals: number | null;
          away_goals: number | null;
          status: MatchStatus;
          kickoff_time: string | null;
          pitch: string | null;
          notes: string | null;
          referee: string | null;
          walkover: string | null;
          motm_player_id: number | null;
          home_logo: string | null;
          away_logo: string | null;
          matchdays: { number: number } | { number: number }[] | null;
          home: { name: string } | { name: string }[] | null;
          away: { name: string } | { name: string }[] | null;
        };
        events: MatchEventRow[];
        appearances: AppearanceRow[];
        homePlayers: PlayerRow[];
        awayPlayers: PlayerRow[];
      };
      const home = Array.isArray(d.match.home) ? d.match.home[0] : d.match.home;
      const away = Array.isArray(d.match.away) ? d.match.away[0] : d.match.away;
      const md = Array.isArray(d.match.matchdays) ? d.match.matchdays[0] : d.match.matchdays;
      setHomeName(home?.name ?? "Local");
      setAwayName(away?.name ?? "Visita");
      setHomeLogo(d.match.home_logo);
      setAwayLogo(d.match.away_logo);
      setHomeId(d.match.home_team_id);
      setAwayId(d.match.away_team_id);
      setMatchday(md?.number ?? null);
      setHomeGoals(d.match.home_goals == null ? "0" : String(d.match.home_goals));
      setAwayGoals(d.match.away_goals == null ? "0" : String(d.match.away_goals));
      setStatus(d.match.status === "played" || d.match.status === "pending" ? d.match.status : "scheduled");
      setKickoff(d.match.kickoff_time?.slice(0, 5) ?? "");
      setPitch(d.match.pitch ?? "");
      setNotes(d.match.notes ?? "");
      setReferee(d.match.referee ?? "");
      setWalkover(d.match.walkover ?? "none");
      setMotm(d.match.motm_player_id ?? "");
      setHomePlayers(d.homePlayers);
      setAwayPlayers(d.awayPlayers);
      setLineup(
        d.appearances.map((a) => ({
          playerId: a.player_id,
          teamId: a.team_id,
          isHome: a.is_home,
        })),
      );
      setEvents(d.events.length ? fromSaved(d.events) : reconstruct(d.appearances));
      setStep(0);
      setLoaded(true);
      setSaveState("saved");
    })();
  }, [matchId]);

  useEffect(() => {
    if (!loaded) return;
    lastSavedRef.current = JSON.stringify(payloadRef.current);
    loadedRef.current = true;
  }, [loaded]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushSave("leave");
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      void flushSave("leave");
    };
  }, [flushSave]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(Math.min(3, step + 1));
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(Math.max(0, step - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  function go(next: number) {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    void flushSave("tab");
    setStep(next);
  }

  function bump(side: "home" | "away", delta: number) {
    const cur = side === "home" ? hg : ag;
    const next = Math.max(0, Math.min(20, cur + delta));
    const nextHome = side === "home" ? next : hg;
    const nextAway = side === "away" ? next : ag;
    if (side === "home") setHomeGoals(String(nextHome));
    else setAwayGoals(String(nextAway));
    setEvents((prev) => syncGoalSlots(prev, homeId, awayId, nextHome, nextAway));
    setStatus("played");
    scheduleSave();
  }

  function setScore(side: "home" | "away", raw: string) {
    const next = Number(clampScore(raw));
    const nextHome = side === "home" ? next : hg;
    const nextAway = side === "away" ? next : ag;
    if (side === "home") setHomeGoals(String(nextHome));
    else setAwayGoals(String(nextAway));
    setEvents((prev) => syncGoalSlots(prev, homeId, awayId, nextHome, nextAway));
    setStatus("played");
    scheduleSave();
  }

  function changeStatus(next: MatchStatus) {
    setStatus(next);
    if (next !== "scheduled") {
      setEvents((prev) => syncGoalSlots(prev, homeId, awayId, hg, ag));
    }
    scheduleSave();
  }

  function updateEvent(key: string, patch: Partial<EventDraft>) {
    setEvents((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
    scheduleSave();
  }

  function addCard(teamId: number) {
    setEvents((prev) => [
      ...prev,
      { key: uid(), kind: "yellow", teamId, playerId: "", assistPlayerId: "", minute: "", extra: "" },
    ]);
    scheduleSave();
  }

  function addGoal(teamId: number) {
    if (teamId === homeId) setScore("home", String(hg + 1));
    else setScore("away", String(ag + 1));
  }

  function removeEvent(key: string) {
    const target = events.find((e) => e.key === key);
    setEvents((prev) => {
      const next = prev.filter((e) => e.key !== key);
      if (target && GOAL_KINDS.includes(target.kind)) {
        const nextHome = goalSlotsFor(next, homeId).length;
        const nextAway = goalSlotsFor(next, awayId).length;
        setHomeGoals(String(nextHome));
        setAwayGoals(String(nextAway));
      }
      return next;
    });
    scheduleSave();
  }

  function toggleLineup(player: PlayerRow, isHome: boolean) {
    setLineup((prev) => {
      if (prev.some((l) => l.playerId === player.id)) return prev.filter((l) => l.playerId !== player.id);
      return [...prev, { playerId: player.id, teamId: player.team_id, isHome }];
    });
    scheduleSave();
  }

  async function addQuickPlayer() {
    const teamId = newTeam === "home" ? homeId : awayId;
    const res = await savePlayer({ full_name: newName.trim(), team_id: teamId });
    if (!res.ok || !res.data) {
      setError(res.ok ? "No se pudo crear" : res.error);
      return;
    }
    const row: PlayerRow = {
      id: res.data.id,
      full_name: newName.trim(),
      team_id: teamId,
      source_index: 0,
    };
    if (newTeam === "home") setHomePlayers((p) => [...p, row].sort((a, b) => a.full_name.localeCompare(b.full_name, "es")));
    else setAwayPlayers((p) => [...p, row].sort((a, b) => a.full_name.localeCompare(b.full_name, "es")));
    setNewName("");
    scheduleSave();
  }

  const timeline = useMemo(() => {
    return [...events]
      .filter((e) => GOAL_KINDS.includes(e.kind) || CARD_KINDS.includes(e.kind))
      .sort((a, b) => (Number(a.minute) || 99) - (Number(b.minute) || 99) || (Number(a.extra) || 0) - (Number(b.extra) || 0))
      .slice(0, 12);
  }, [events]);

  const syncLabel =
    saveState === "saving"
      ? "Guardando"
      : saveState === "error"
        ? "Reintentar"
        : saveState === "saved"
          ? savedAt
            ? "En la web"
            : "Al día"
          : "Sin guardar";

  if (!loaded) return <p className="adm-load">Cargando partido…</p>;

  const sides = [
    { name: homeName, id: homeId, players: homePlayers, logo: homeLogo, goals: hg },
    { name: awayName, id: awayId, players: awayPlayers, logo: awayLogo, goals: ag },
  ];

  return (
    <div className="md">
      <div className="md-board">
        <div className="md-board-top">
          <p className="md-kicker">
            Fecha {matchday ?? "—"} · {kickoff || "hora por definir"}
            {pitch ? ` · cancha ${pitch}` : ""}
          </p>
          <button
            className={`md-sync ${saveState === "saving" ? "saving" : saveState === "saved" ? "saved" : saveState === "error" ? "err" : ""} ${status === "pending" ? "live" : ""}`}
            type="button"
            title="Sitio"
            onClick={() => void flushSave("manual")}
          >
            <i />
            {syncLabel}
          </button>
        </div>
        <div className="md-scoreboard">
          <div className="md-side">
            <img src={homeLogo || "/img/logo-lifexi.png"} alt="" width={52} height={52} />
            <strong>{homeName}</strong>
            <div className="md-dial">
              <button type="button" aria-label="Menos" onClick={() => bump("home", -1)}>
                −
              </button>
              <b>{hg}</b>
              <button type="button" aria-label="Más" onClick={() => bump("home", 1)}>
                +
              </button>
            </div>
          </div>
          <div className="md-mid">
            <span className={`md-pill ${status === "played" ? "ft" : status === "pending" ? "live" : "wait"}`}>
              {status === "played" ? "Final" : status === "pending" ? "Pendiente" : "Por jugar"}
            </span>
            <em>—</em>
          </div>
          <div className="md-side">
            <img src={awayLogo || "/img/logo-lifexi.png"} alt="" width={52} height={52} />
            <strong>{awayName}</strong>
            <div className="md-dial">
              <button type="button" aria-label="Menos" onClick={() => bump("away", -1)}>
                −
              </button>
              <b>{ag}</b>
              <button type="button" aria-label="Más" onClick={() => bump("away", 1)}>
                +
              </button>
            </div>
          </div>
        </div>
        <div className="md-status" role="group" aria-label="Estado">
          {(
            [
              ["scheduled", "Por jugar"],
              ["pending", "Pendiente"],
              ["played", "Final"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={status === id ? "on" : undefined} onClick={() => changeStatus(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="md-tabs" role="tablist">
        {TABS.map((label, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={i === step}
            className={i === step ? "on" : undefined}
            onClick={() => go(i)}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="adm-alert">
          {error}{" "}
          <button className="adm-btn ghost" type="button" onClick={() => void flushSave("manual")}>
            Reintentar
          </button>
        </p>
      ) : null}

      {step === 0 ? (
        <section className="adm-card md-panel">
          <div className="md-meta">
            <label>
              Hora
              <input value={kickoff} onChange={(e) => { setKickoff(e.target.value); scheduleSave(); }} placeholder="11:00" />
            </label>
            <label>
              Cancha
              <input value={pitch} onChange={(e) => { setPitch(e.target.value); scheduleSave(); }} />
            </label>
            <label>
              Marcador
              <span className="adm-row">
                <input inputMode="numeric" value={homeGoals} onChange={(e) => setScore("home", e.target.value)} />
                <input inputMode="numeric" value={awayGoals} onChange={(e) => setScore("away", e.target.value)} />
              </span>
            </label>
          </div>
          {timeline.length ? (
            <div>
              <p className="adm-k">Relato</p>
              <div className="md-timeline">
                {timeline.map((e) => (
                  <div
                    className={`md-tl${typeof e.playerId === "number" ? " pd-row" : ""}`}
                    key={e.key}
                    role={typeof e.playerId === "number" ? "button" : undefined}
                    tabIndex={typeof e.playerId === "number" ? 0 : undefined}
                    onClick={() => typeof e.playerId === "number" && openPlayer(e.playerId, allPlayers.map((p) => p.id))}
                    onKeyDown={(event) => {
                      if (typeof e.playerId !== "number") return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openPlayer(e.playerId, allPlayers.map((p) => p.id));
                      }
                    }}
                  >
                    <b>{minuteLabel(e)}</b>
                    <span className={`md-dot ${e.kind}`} />
                    <span>
                      {kindLabel(e.kind)} · {(allPlayers.find((p) => p.id === e.playerId)?.full_name ?? "Por asignar")} ·{" "}
                      {e.teamId === homeId ? homeName : awayName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="md-empty">+ y − cargan el marcador al instante. Las pestañas se pueden abrir en cualquier orden.</p>
          )}
        </section>
      ) : null}

      {step === 1 ? (
        <section className="adm-card md-panel">
          <div className="md-grid">
            {sides.map((side) => (
              <div className="md-col" key={side.id}>
                <h2>{side.name}</h2>
                {goalSlotsFor(events, side.id).length === 0 ? <p className="md-empty">Sin goles</p> : null}
                {goalSlotsFor(events, side.id).map((e, i) => (
                  <div className={`md-event goal`} key={e.key}>
                    <select value={e.kind} onChange={(ev) => updateEvent(e.key, { kind: ev.target.value as EventKind })}>
                      <option value="goal">Gol {i + 1}</option>
                      <option value="penalty">Penal</option>
                      <option value="own_goal">Autogol</option>
                    </select>
                    <PlayerPick
                      players={e.kind === "own_goal" ? (e.teamId === homeId ? awayPlayers : homePlayers) : side.players}
                      value={e.playerId}
                      onChange={(playerId) => updateEvent(e.key, { playerId })}
                    />
                    <input placeholder="Min" value={e.minute} onChange={(ev) => updateEvent(e.key, { minute: ev.target.value.replace(/\D/g, "") })} />
                    <input placeholder="+" value={e.extra} onChange={(ev) => updateEvent(e.key, { extra: ev.target.value.replace(/\D/g, "") })} />
                    <button className="adm-btn ghost" type="button" title="Quitar" onClick={() => removeEvent(e.key)}>
                      ×
                    </button>
                    {e.kind !== "own_goal" ? (
                      <PlayerPick
                        players={side.players.filter((p) => p.id !== e.playerId)}
                        value={e.assistPlayerId}
                        onChange={(assistPlayerId) => updateEvent(e.key, { assistPlayerId })}
                        label="Asistencia"
                      />
                    ) : null}
                  </div>
                ))}
                <button className="adm-btn ghost" type="button" onClick={() => addGoal(side.id)}>
                  + Gol
                </button>
              </div>
            ))}
          </div>
          <div className="adm-form two">
            <label>
              Alta rápida
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre" />
            </label>
            <label>
              Equipo
              <span className="adm-row">
                <select value={newTeam} onChange={(e) => setNewTeam(e.target.value as "home" | "away")}>
                  <option value="home">{homeName}</option>
                  <option value="away">{awayName}</option>
                </select>
                <button className="adm-btn ghost" type="button" onClick={() => void addQuickPlayer()} disabled={!newName.trim()}>
                  Agregar
                </button>
              </span>
            </label>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="adm-card md-panel">
          <div className="md-grid">
            {sides.map((side) => (
              <div className="md-col" key={side.id}>
                <h2>{side.name}</h2>
                {cardEvents.filter((e) => e.teamId === side.id).length === 0 ? <p className="md-empty">Sin tarjetas</p> : null}
                {cardEvents
                  .filter((e) => e.teamId === side.id)
                  .map((e) => (
                    <div className={`md-event ${e.kind}`} key={e.key}>
                      <select value={e.kind} onChange={(ev) => updateEvent(e.key, { kind: ev.target.value as EventKind })}>
                        <option value="yellow">Amarilla</option>
                        <option value="second_yellow">Doble amarilla</option>
                        <option value="red">Roja</option>
                      </select>
                      <PlayerPick players={side.players} value={e.playerId} onChange={(playerId) => updateEvent(e.key, { playerId })} />
                      <input placeholder="Min" value={e.minute} onChange={(ev) => updateEvent(e.key, { minute: ev.target.value.replace(/\D/g, "") })} />
                      <input placeholder="+" value={e.extra} onChange={(ev) => updateEvent(e.key, { extra: ev.target.value.replace(/\D/g, "") })} />
                      <button className="adm-btn ghost" type="button" title="Quitar" onClick={() => removeEvent(e.key)}>
                        ×
                      </button>
                    </div>
                  ))}
                <button className="adm-btn ghost" type="button" onClick={() => addCard(side.id)}>
                  + Tarjeta
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="adm-card md-panel">
          <h2>Cierre</h2>
          <div className="adm-form two">
            <label>
              Estrella
              <select
                value={motm}
                onChange={(e) => {
                  setMotm(e.target.value ? Number(e.target.value) : "");
                  scheduleSave();
                }}
              >
                <option value="">Sin elegir</option>
                {allPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Árbitro
              <input value={referee} onChange={(e) => { setReferee(e.target.value); scheduleSave(); }} />
            </label>
            <label>
              W.O.
              <select value={walkover} onChange={(e) => { setWalkover(e.target.value); scheduleSave(); }}>
                <option value="none">No</option>
                <option value="home">Local gana</option>
                <option value="away">Visita gana</option>
                <option value="half_home">Medio W.O. local</option>
                <option value="half_away">Medio W.O. visita</option>
              </select>
            </label>
            <label>
              Notas
              <textarea value={notes} onChange={(e) => { setNotes(e.target.value); scheduleSave(); }} />
            </label>
          </div>
          <div className="md-grid">
            {[
              { title: homeName, players: homePlayers, home: true },
              { title: awayName, players: awayPlayers, home: false },
            ].map((side) => (
              <div key={side.title}>
                <p className="adm-k">{side.title}</p>
                <div className="md-squad">
                  {side.players.map((p) => (
                    <label key={p.id}>
                      <input
                        type="checkbox"
                        checked={lineup.some((l) => l.playerId === p.id)}
                        onChange={() => toggleLineup(p, side.home)}
                      />
                      {p.full_name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="adm-k">
            {goalEvents.length} goles · {cardEvents.length} tarjetas · {lineup.length} en planilla
          </p>
        </section>
      ) : null}

      <div className="md-pager">
        {step > 0 ? (
          <button className="adm-iconbtn" type="button" title="Anterior" aria-label="Anterior" onClick={() => go(step - 1)}>
            <IconChevL />
          </button>
        ) : (
          <span />
        )}
        <span>
          {step + 1} / {TABS.length}
        </span>
        {step < 3 ? (
          <button className="adm-btn" type="button" onClick={() => go(step + 1)}>
            Siguiente
            <IconChevR />
          </button>
        ) : (
          <Link className="adm-btn ghost" href="/admin/partidos">
            Partidos
          </Link>
        )}
      </div>
    </div>
  );
}
