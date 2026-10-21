"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getPlayerDossier } from "@/app/admin/player-dossier-action";
import { IconChevL, IconChevR, IconClose, IconCopy, IconEdit } from "@/components/admin/icons";
import type { EventKind, PlayerDossier } from "@/lib/admin/types";
import "@/app/admin/player-dossier.css";

const TABS = [
  { id: "actual", label: "Actual" },
  { id: "partidos", label: "Partidos" },
  { id: "disciplina", label: "Disciplina" },
  { id: "club", label: "Club" },
] as const;

type Tab = (typeof TABS)[number]["id"];

function minute(ev: { minute: number | null; extra_minute: number | null }) {
  if (ev.minute == null) return "";
  return ev.extra_minute ? `${ev.minute}+${ev.extra_minute}′` : `${ev.minute}′`;
}

function kindLabel(kind: EventKind, asAssist: boolean) {
  if (asAssist) return "Asistencia";
  if (kind === "goal") return "Gol";
  if (kind === "own_goal") return "Autogol";
  if (kind === "penalty") return "Penal";
  if (kind === "penalty_missed") return "Penal errado";
  if (kind === "yellow") return "TA";
  if (kind === "second_yellow") return "2ª TA";
  if (kind === "red") return "TR";
  return "Asistencia";
}

function fmtDate(value: string | null) {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  return d && m ? `${d}.${m}.${y}` : value;
}

function roleLabel(role: PlayerDossier["tournaments"][number]["clubRole"]) {
  if (role === "current") return "En curso";
  if (role === "champion") return "Campeón";
  if (role === "runner") return "Subcampeón";
  if (role === "dq") return "Desc.";
  return null;
}

export function PlayerDossierModal({
  playerId,
  listIds,
  onClose,
  onOpen,
  onEdit,
  onOpenTeam,
}: {
  playerId: number;
  listIds: number[];
  onClose: () => void;
  onOpen: (id: number) => void;
  onEdit?: () => void;
  onOpenTeam?: (teamId: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>("actual");
  const [data, setData] = useState<PlayerDossier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const idx = listIds.indexOf(playerId);
  const prev = idx > 0 ? listIds[idx - 1] : null;
  const next = idx >= 0 && idx < listIds.length - 1 ? listIds[idx + 1] : null;

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (!node.open) node.showModal();
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    node.addEventListener("cancel", onCancel);
    return () => node.removeEventListener("cancel", onCancel);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    setBusy(true);
    setError(null);
    setTab("actual");
    void getPlayerDossier(playerId)
      .then((res) => {
        if (!live) return;
        if (!res.ok) {
          setError(res.error);
          setData(null);
        } else {
          setData(res.data);
        }
        setBusy(false);
      })
      .catch(() => {
        if (!live) return;
        setError("No se pudo cargar");
        setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [playerId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft" && prev) onOpen(prev);
      if (event.key === "ArrowRight" && next) onOpen(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, onOpen]);

  const p = data?.player;
  const team = data?.team;
  const st = data?.stats;
  const season = data?.season;

  return (
    <dialog
      ref={dialog}
      className="pd-dialog"
      aria-labelledby="pd-name"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="pd-shell">
        <header className="pd-head">
          {team?.logo ? <img className="pd-logo" src={team.logo} alt="" width={56} height={56} /> : <span className="pd-logo" />}
          <div className="pd-id">
            <h2 id="pd-name">{p?.full_name ?? "Jugador"}</h2>
            <p>
              {onOpenTeam && team ? (
                <button type="button" className="enlace" onClick={() => onOpenTeam(team.id)}>
                  {team.name}
                </button>
              ) : (
                <span>{team?.name ?? "—"}</span>
              )}
              {season ? <span className="pd-chip now">{season.name}</span> : null}
              {p != null ? <span className="pd-chip">#{p.source_index}</span> : null}
              {team?.is_founding_team ? <span className="pd-chip">Fundador</span> : null}
              {team?.is_dissolved ? <span className="pd-chip loss">Disuelto</span> : null}
            </p>
          </div>
          <div className="pd-tools">
            <button className="pd-icon" type="button" title="Anterior" aria-label="Anterior" disabled={!prev} onClick={() => prev && onOpen(prev)}>
              <IconChevL />
            </button>
            <button className="pd-icon" type="button" title="Siguiente" aria-label="Siguiente" disabled={!next} onClick={() => next && onOpen(next)}>
              <IconChevR />
            </button>
            <button
              className="pd-icon"
              type="button"
              title="Copiar"
              aria-label="Copiar"
              onClick={() => p && void navigator.clipboard.writeText(p.full_name)}
            >
              <IconCopy />
            </button>
            {onEdit ? (
              <button className="pd-icon" type="button" title="Editar" aria-label="Editar" onClick={onEdit}>
                <IconEdit />
              </button>
            ) : null}
            <button className="pd-icon" type="button" title="Cerrar" aria-label="Cerrar" onClick={onClose}>
              <IconClose />
            </button>
          </div>
        </header>

        {st ? (
          <div className="pd-kpis">
            <div className="pd-kpi">
              <b>{st.matches_played}</b>
              <span>PJ</span>
            </div>
            <div className="pd-kpi">
              <b>{st.goals}</b>
              <span>Goles</span>
            </div>
            <div className="pd-kpi">
              <b>{st.assists}</b>
              <span>Asist.</span>
            </div>
            <div className="pd-kpi warn">
              <b>{st.yellows}</b>
              <span>TA</span>
            </div>
            <div className="pd-kpi hot">
              <b>{st.reds}</b>
              <span>TR</span>
            </div>
            <div className="pd-kpi">
              <b>{st.motm}</b>
              <span>MOTM</span>
            </div>
            <div className="pd-kpi">
              <b>{st.fp}</b>
              <span>FP</span>
            </div>
            <div className="pd-kpi">
              <b>
                {st.wins}-{st.draws}-{st.losses}
              </b>
              <span>PG-PE-PP</span>
            </div>
          </div>
        ) : null}

        <div className="pd-tabs" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="pd-body">
          {busy ? <p className="pd-load">Cargando</p> : null}
          {error ? <p className="adm-alert">{error}</p> : null}
          {!busy && data && tab === "actual" ? <Actual data={data} /> : null}
          {!busy && data && tab === "partidos" ? <Matches data={data} /> : null}
          {!busy && data && tab === "disciplina" ? <Discipline data={data} /> : null}
          {!busy && data && tab === "club" ? <Club data={data} onOpen={onOpen} onOpenTeam={onOpenTeam} /> : null}
        </div>
      </div>
    </dialog>
  );
}

function Actual({ data }: { data: PlayerDossier }) {
  const { stats, season, stints, team } = data;
  const maxG = Math.max(1, ...stats.goals_by_matchday);
  return (
    <div className="pd-grid">
      <section className="pd-card">
        <h3>Campeonato actual</h3>
        <div className="pd-meta">
          <div>
            <span>Torneo</span>
            <b>{season.name}</b>
          </div>
          <div>
            <span>Sede</span>
            <b>{season.venue ?? "—"}</b>
          </div>
          <div>
            <span>Estado</span>
            <b>{season.status === "in_progress" ? "En curso" : season.status}</b>
          </div>
          <div>
            <span>Equipo</span>
            <b>{team.name}</b>
          </div>
          <div>
            <span>Lugar del club</span>
            <b>{stats.team_table_place ? `${stats.team_table_place}º` : "—"}</b>
          </div>
          <div>
            <span>Goleador liga</span>
            <b>{stats.league_goal_rank ? `${stats.league_goal_rank}º` : "—"}</b>
          </div>
          <div>
            <span>Goleador club</span>
            <b>{stats.team_goal_rank ? `${stats.team_goal_rank}º` : "—"}</b>
          </div>
          <div>
            <span>Primera / última</span>
            <b>
              {fmtDate(stats.first_appearance)} · {fmtDate(stats.last_appearance)}
            </b>
          </div>
          <div>
            <span>Racha PJ</span>
            <b>{stats.streak}</b>
          </div>
        </div>
      </section>
      <section className="pd-card">
        <h3>Goles por fecha</h3>
        <div className="pd-spark" aria-hidden="true">
          {stats.goals_by_matchday.map((g, i) => (
            <i
              key={i}
              className={data.matches.some((m) => m.matchday_number === i + 1) ? "on" : undefined}
              data-g={g}
              style={{ height: `${Math.max(g > 0 ? 10 : 4, (g / maxG) * 52)}px` }}
              title={`F${i + 1} ${g}`}
            />
          ))}
        </div>
        <div className="pd-meta" style={{ marginTop: "0.8rem" }}>
          <div>
            <span>1ª rueda</span>
            <b>
              {stats.round1.pj} PJ · {stats.round1.goals} G
            </b>
          </div>
          <div>
            <span>2ª rueda</span>
            <b>
              {stats.round2.pj} PJ · {stats.round2.goals} G
            </b>
          </div>
          <div>
            <span>Penales</span>
            <b>
              {stats.penalties} / {stats.missed_penalties} err.
            </b>
          </div>
          <div>
            <span>Autogoles</span>
            <b>{stats.own_goals}</b>
          </div>
        </div>
      </section>
      <section className="pd-card" style={{ gridColumn: "1 / -1" }}>
        <h3>Planillas</h3>
        {stints.length === 0 ? (
          <p className="pd-empty">Sin torneos</p>
        ) : (
          stints.map((s) => (
            <div key={s.player_id} className={s.current ? "pd-stint on" : "pd-stint"}>
              <span>
                {s.season_name}
                {s.current ? " · actual" : ""}
              </span>
              <b>
                {s.matches_played} PJ · {s.goals} G · {s.motm} ★
              </b>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function Matches({ data }: { data: PlayerDossier }) {
  if (data.matches.length === 0) return <p className="pd-empty">Sin partidos</p>;
  return (
    <div className="pd-log">
      {data.matches.map((m) => (
        <Link key={m.match_id} className="pd-match" href={`/admin/partidos/${m.match_id}`}>
          <div>
            <b>F{m.matchday_number}</b>
            <small>{fmtDate(m.played_on)}</small>
          </div>
          <div>
            <strong>
              {m.is_home ? "Local" : "Visita"} · {m.opponent}
            </strong>
            <small>
              {m.status === "played" ? `${m.home_goals}-${m.away_goals}` : m.status}
              {m.kickoff_time ? ` · ${m.kickoff_time.slice(0, 5)}` : ""}
              {m.pitch ? ` · ${m.pitch}` : ""}
            </small>
            {m.events.length ? (
              <div className="pd-ev">
                {m.events.map((ev, i) => (
                  <span key={i}>
                    {minute(ev)} {kindLabel(ev.kind, ev.as_assist)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="side">
            {m.result ? <span className={`pd-chip ${m.result === "W" ? "win" : m.result === "L" ? "loss" : "draw"}`}>{m.result}</span> : null}
            <small>
              {m.goals} G · {m.yellows} TA · {m.reds} TR
              {m.is_motm ? " · ★" : ""}
            </small>
          </div>
        </Link>
      ))}
    </div>
  );
}

function Discipline({ data }: { data: PlayerDossier }) {
  return (
    <div className="pd-grid">
      <section className="pd-card">
        <h3>Tarjetas</h3>
        <div className="pd-meta">
          <div>
            <span>Amarillas</span>
            <b>{data.stats.yellows}</b>
          </div>
          <div>
            <span>2ª amarilla</span>
            <b>{data.stats.second_yellows}</b>
          </div>
          <div>
            <span>Rojas</span>
            <b>{data.stats.reds}</b>
          </div>
          <div>
            <span>Fair Play</span>
            <b>{data.stats.fp}</b>
          </div>
          <div>
            <span>TA p/ sanción</span>
            <b>
              {data.stats.yellows_to_ban} / {data.season.yellows_for_suspension}
            </b>
          </div>
        </div>
      </section>
      <section className="pd-card">
        <h3>Sanciones</h3>
        {data.sanctions.length === 0 ? (
          <p className="pd-empty">Sin sanciones publicadas</p>
        ) : (
          <ul className="pd-time">
            {data.sanctions.map((s) => (
              <li key={s.id}>
                <span>{s.sanction}</span>
                <span>{s.detail}</span>
                <span />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Club({
  data,
  onOpen,
  onOpenTeam,
}: {
  data: PlayerDossier;
  onOpen: (id: number) => void;
  onOpenTeam?: (teamId: number) => void;
}) {
  return (
    <div className="pd-grid">
      <section className="pd-card">
        <h3>Clubes</h3>
        {data.clubs.length === 0 ? (
          <p className="pd-empty">Sin clubes</p>
        ) : (
          data.clubs.map((c) => (
            <button
              key={`${c.team_id}-${c.player_id}`}
              className={c.current ? "pd-stint on" : "pd-stint"}
              type="button"
              onClick={() => {
                if (c.related) onOpen(c.player_id);
                else onOpenTeam?.(c.team_id);
              }}
            >
              <span>
                {c.team_name}
                {c.current ? " · actual" : ""}
                {c.related ? " · otra ficha" : ""}
              </span>
              <b>
                {c.matches_played} PJ · {c.goals} G
              </b>
            </button>
          ))
        )}
      </section>
      <section className="pd-card">
        <h3>Palmarés del club</h3>
        <div className="pd-meta">
          <div>
            <span>Títulos</span>
            <b>{data.club.titles}</b>
          </div>
          <div>
            <span>Subcampeonatos</span>
            <b>{data.club.runner_ups}</b>
          </div>
          <div>
            <span>Último título</span>
            <b>{data.club.last_title ?? "—"}</b>
          </div>
        </div>
        {data.team.squad_photo ? <img className="pd-photo" src={data.team.squad_photo} alt="" /> : null}
      </section>
      <section className="pd-card">
        <h3>Homónimos</h3>
        {data.homonyms.length === 0 ? (
          <p className="pd-empty">Ninguno</p>
        ) : (
          <div className="pd-homs">
            {data.homonyms.map((h) => (
              <a
                key={h.id}
                href={`/admin/jugadores?id=${h.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  onOpen(h.id);
                }}
              >
                <span>{h.team}</span>
                <b>#{h.id}</b>
              </a>
            ))}
          </div>
        )}
      </section>
      <section className="pd-card" style={{ gridColumn: "1 / -1" }}>
        <h3>Campeonatos</h3>
        <ul className="pd-time">
          {data.tournaments.map((t) => {
            const role = roleLabel(t.clubRole);
            return (
              <li key={t.id}>
                <span>{t.official_number ? `#${t.official_number}` : t.kind}</span>
                <span>
                  {t.photo ? <img src={t.photo} alt="" width={36} height={24} style={{ objectFit: "cover", borderRadius: 4, marginRight: 8, verticalAlign: "middle" }} /> : null}
                  {t.label}
                  {t.venue ? ` · ${t.venue}` : ""}
                </span>
                <span>
                  {role ? <span className={`pd-chip ${t.isCurrent ? "now" : t.clubRole === "champion" ? "win" : ""}`}>{role}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
