"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { getMatchWorkspace, saveMatchDesk, savePlayer } from "@/app/admin/actions";
import type { AppearanceRow, EventKind, MatchEventRow, PlayerRow } from "@/lib/admin/types";

type EventDraft = {
  key: string;
  kind: EventKind;
  teamId: number;
  playerId: number | "";
  assistPlayerId: number | "";
  minute: string;
  extra: string;
};

const GOAL_KINDS: EventKind[] = ["goal", "penalty", "own_goal"];
const CARD_KINDS: EventKind[] = ["yellow", "second_yellow", "red"];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function asNum(v: string) {
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function reconstruct(apps: AppearanceRow[]): EventDraft[] {
  const out: EventDraft[] = [];
  for (const a of apps) {
    for (let i = 0; i < a.goals; i++) {
      out.push({ key: uid(), kind: "goal", teamId: a.team_id, playerId: a.player_id, assistPlayerId: "", minute: "", extra: "" });
    }
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

function PlayerPick({
  players,
  value,
  onChange,
}: {
  players: PlayerRow[];
  value: number | "";
  onChange: (id: number | "") => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}>
      <option value="">Jugador</option>
      {players.map((p) => (
        <option key={p.id} value={p.id}>
          {p.full_name}
        </option>
      ))}
    </select>
  );
}

export function MatchDesk({ matchId }: { matchId: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [homeName, setHomeName] = useState("");
  const [awayName, setAwayName] = useState("");
  const [homeId, setHomeId] = useState(0);
  const [awayId, setAwayId] = useState(0);
  const [matchday, setMatchday] = useState<number | null>(null);
  const [homeGoals, setHomeGoals] = useState("0");
  const [awayGoals, setAwayGoals] = useState("0");
  const [status, setStatus] = useState<"played" | "scheduled" | "pending">("played");
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
          status: "played" | "scheduled" | "pending";
          kickoff_time: string | null;
          pitch: string | null;
          notes: string | null;
          referee: string | null;
          walkover: string | null;
          motm_player_id: number | null;
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
      setHomeId(d.match.home_team_id);
      setAwayId(d.match.away_team_id);
      setMatchday(md?.number ?? null);
      setHomeGoals(d.match.home_goals == null ? "0" : String(d.match.home_goals));
      setAwayGoals(d.match.away_goals == null ? "0" : String(d.match.away_goals));
      setStatus(d.match.status === "played" ? "played" : d.match.status);
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
      if (d.match.status !== "played") setStep(0);
      else setStep(3);
      setLoaded(true);
    })();
  }, [matchId]);

  const hg = Number(homeGoals) || 0;
  const ag = Number(awayGoals) || 0;

  const goalEvents = events.filter((e) => GOAL_KINDS.includes(e.kind));
  const cardEvents = events.filter((e) => CARD_KINDS.includes(e.kind));

  const computed = useMemo(() => {
    let home = 0;
    let away = 0;
    for (const e of events) {
      if (e.kind === "goal" || e.kind === "penalty") {
        if (e.teamId === homeId) home += 1;
        if (e.teamId === awayId) away += 1;
      }
      if (e.kind === "own_goal") {
        if (e.teamId === homeId) away += 1;
        if (e.teamId === awayId) home += 1;
      }
    }
    return { home, away };
  }, [events, homeId, awayId]);

  function applyScoreToGoals() {
    setStatus("played");
    setEvents((prev) => {
      const keep = prev.filter((e) => e.kind === "own_goal" || !GOAL_KINDS.includes(e.kind));
      const make = (teamId: number, count: number) =>
        Array.from({ length: count }, () => ({
          key: uid(),
          kind: "goal" as EventKind,
          teamId,
          playerId: "" as const,
          assistPlayerId: "" as const,
          minute: "",
          extra: "",
        }));
      return [...keep, ...make(homeId, Number(homeGoals) || 0), ...make(awayId, Number(awayGoals) || 0)];
    });
    setStep(1);
  }

  function updateEvent(key: string, patch: Partial<EventDraft>) {
    setEvents((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }

  function addCard(teamId: number) {
    setEvents((prev) => [
      ...prev,
      { key: uid(), kind: "yellow", teamId, playerId: "", assistPlayerId: "", minute: "", extra: "" },
    ]);
  }

  function removeEvent(key: string) {
    setEvents((prev) => prev.filter((e) => e.key !== key));
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
  }

  function save() {
    setError(null);
    setOk(null);
    start(async () => {
      const res = await saveMatchDesk({
        matchId,
        homeGoals: status === "played" ? hg : null,
        awayGoals: status === "played" ? ag : null,
        status,
        kickoffTime: kickoff || null,
        pitch: pitch || null,
        notes: notes || null,
        referee: referee || null,
        walkover: walkover,
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
      });
      if (!res.ok) setError(res.error);
      else setOk("Guardado");
    });
  }

  if (!loaded) return <p className="adm-load">Cargando partido…</p>;

  const allPlayers = [...homePlayers, ...awayPlayers];
  const steps = ["Marcador", "Goles", "Tarjetas", "Cierre"];

  return (
    <div>
      <div className="adm-top">
        <div>
          <h1>
            {homeName} — {awayName}
          </h1>
          <p>
            Fecha {matchday ?? "—"} · {kickoff || "hora por definir"}
            {pitch ? ` · cancha ${pitch}` : ""}
          </p>
        </div>
        <Link className="adm-btn ghost" href="/admin/partidos">
          Partidos
        </Link>
      </div>

      <div className="adm-steps">
        {steps.map((label, i) => (
          <span key={label} className={i === step ? "on" : undefined}>
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {error ? <p className="adm-alert">{error}</p> : null}
      {ok ? <p className="adm-alert adm-ok">{ok}</p> : null}

      {step === 0 ? (
        <section className="adm-card">
          <div className="adm-score">
            <div className="club">
              <strong>{homeName}</strong>
              <input inputMode="numeric" value={homeGoals} onChange={(e) => setHomeGoals(e.target.value.replace(/\D/g, ""))} />
            </div>
            <em>—</em>
            <div className="club">
              <strong>{awayName}</strong>
              <input inputMode="numeric" value={awayGoals} onChange={(e) => setAwayGoals(e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>
          <div className="adm-form three" style={{ marginTop: "1rem" }}>
            <label>
              Estado
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="played">Jugado</option>
                <option value="pending">Pendiente</option>
                <option value="scheduled">Por jugar</option>
              </select>
            </label>
            <label>
              Hora
              <input value={kickoff} onChange={(e) => setKickoff(e.target.value)} placeholder="11:00" />
            </label>
            <label>
              Cancha
              <input value={pitch} onChange={(e) => setPitch(e.target.value)} />
            </label>
          </div>
          <div className="adm-actions">
            <button className="adm-btn" type="button" onClick={applyScoreToGoals}>
              Cargar goles
            </button>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="adm-card">
          <h2>¿De quién fueron los goles y en qué minuto?</h2>
          {[
            { name: homeName, id: homeId, players: homePlayers },
            { name: awayName, id: awayId, players: awayPlayers },
          ].map((side) => (
            <div key={side.id} style={{ marginBottom: "1rem" }}>
              <p className="adm-k">{side.name}</p>
              {events
                .filter((e) => GOAL_KINDS.includes(e.kind) && e.teamId === side.id)
                .map((e, i) => (
                  <div className="adm-event" key={e.key}>
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
                    <button className="adm-btn ghost" type="button" onClick={() => removeEvent(e.key)}>
                      Quitar
                    </button>
                  </div>
                ))}
            </div>
          ))}
          <p className="adm-k">Suma {computed.home}-{computed.away} · marcador {hg}-{ag}</p>
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
          <div className="adm-actions">
            <button className="adm-btn ghost" type="button" onClick={() => setStep(0)}>
              Atrás
            </button>
            <button className="adm-btn" type="button" onClick={() => setStep(2)}>
              Tarjetas
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="adm-card">
          <h2>¿Hubo tarjetas? ¿En qué minuto?</h2>
          {[
            { name: homeName, id: homeId, players: homePlayers },
            { name: awayName, id: awayId, players: awayPlayers },
          ].map((side) => (
            <div key={side.id} style={{ marginBottom: "1rem" }}>
              <p className="adm-k">{side.name}</p>
              {cardEvents
                .filter((e) => e.teamId === side.id)
                .map((e) => (
                  <div className="adm-event" key={e.key}>
                    <select value={e.kind} onChange={(ev) => updateEvent(e.key, { kind: ev.target.value as EventKind })}>
                      <option value="yellow">Amarilla</option>
                      <option value="second_yellow">Doble amarilla</option>
                      <option value="red">Roja</option>
                    </select>
                    <PlayerPick players={side.players} value={e.playerId} onChange={(playerId) => updateEvent(e.key, { playerId })} />
                    <input placeholder="Min" value={e.minute} onChange={(ev) => updateEvent(e.key, { minute: ev.target.value.replace(/\D/g, "") })} />
                    <input placeholder="+" value={e.extra} onChange={(ev) => updateEvent(e.key, { extra: ev.target.value.replace(/\D/g, "") })} />
                    <button className="adm-btn ghost" type="button" onClick={() => removeEvent(e.key)}>
                      Quitar
                    </button>
                  </div>
                ))}
              <button className="adm-btn ghost" type="button" onClick={() => addCard(side.id)}>
                + Tarjeta
              </button>
            </div>
          ))}
          <div className="adm-actions">
            <button className="adm-btn ghost" type="button" onClick={() => setStep(1)}>
              Atrás
            </button>
            <button className="adm-btn" type="button" onClick={() => setStep(3)}>
              Cierre
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="adm-card">
          <h2>Cierre del partido</h2>
          <div className="adm-form two">
            <label>
              Estrella
              <select value={motm} onChange={(e) => setMotm(e.target.value ? Number(e.target.value) : "")}>
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
              <input value={referee} onChange={(e) => setReferee(e.target.value)} />
            </label>
            <label>
              W.O.
              <select value={walkover} onChange={(e) => setWalkover(e.target.value)}>
                <option value="none">No</option>
                <option value="home">Local gana</option>
                <option value="away">Visita gana</option>
                <option value="half_home">Medio W.O. local</option>
                <option value="half_away">Medio W.O. visita</option>
              </select>
            </label>
            <label>
              Alineación en planilla
              <select
                multiple
                value={lineup.filter((l) => l.isHome).map((l) => String(l.playerId))}
                onChange={(e) => {
                  const home = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
                  const away = lineup.filter((l) => !l.isHome);
                  setLineup([
                    ...home.map((playerId) => ({ playerId, teamId: homeId, isHome: true })),
                    ...away,
                  ]);
                }}
                size={8}
              >
                {homePlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Alineación visita
              <select
                multiple
                value={lineup.filter((l) => !l.isHome).map((l) => String(l.playerId))}
                onChange={(e) => {
                  const away = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
                  const home = lineup.filter((l) => l.isHome);
                  setLineup([
                    ...home,
                    ...away.map((playerId) => ({ playerId, teamId: awayId, isHome: false })),
                  ]);
                }}
                size={8}
              >
                {awayPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Notas
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
          <p className="adm-k">
            {goalEvents.length} goles · {cardEvents.length} tarjetas · {lineup.length} en planilla
          </p>
          <div className="adm-actions">
            <button className="adm-btn ghost" type="button" onClick={() => setStep(0)}>
              Editar todo
            </button>
            <button className="adm-btn" type="button" onClick={save} disabled={pending}>
              {pending ? "Guardando…" : "Guardar partido"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
