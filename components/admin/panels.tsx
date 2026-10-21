"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  addFixture,
  saveHistoryEntry,
  saveMatchday,
  saveMediaCaption,
  saveSeason,
  saveSiteContent,
  saveTeam,
} from "@/app/admin/actions";
import { ensureChampionPhotos } from "@/app/admin/champion-dossier-action";
import { ChampionCreateDialog, ChampionDossierModal } from "@/components/admin/champion-dossier";
import { PlayerCreateDialog, PlayerDossierModal } from "@/components/admin/player-dossier";
import { IconPlus } from "@/components/admin/icons";
import { TeamDossierModal } from "@/components/admin/team-dossier";
import { bindPlayerRow, bindRow, useAdminData } from "@/components/admin/store";
import { kindLabel } from "@/lib/admin/champion-fotos";
import type { ChampionKind, ChampionTeamOpt, TeamRow } from "@/lib/admin/types";
import "@/app/admin/champion-dossier.css";

function teamName(teams: { id: number; name: string }[], id: number) {
  return teams.find((t) => t.id === id)?.name ?? `#${id}`;
}

export function MatchesPanel() {
  const { data, loading, error } = useAdminData();
  const router = useRouter();
  const params = useSearchParams();
  const fecha = params.get("fecha");
  const [q, setQ] = useState("");
  const [st, setSt] = useState("all");
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;
  const rows = (data.calendar as {
    match_id: number;
    matchday_number: number;
    home_team: string;
    away_team: string;
    home_goals: number | null;
    away_goals: number | null;
    status: string;
    kickoff_time: string | null;
    played_on: string | null;
  }[]).filter((m) => {
    const hay = `${m.home_team} ${m.away_team} ${m.matchday_number}`.toLowerCase();
    if (q && !hay.includes(q.toLowerCase())) return false;
    if (st !== "all" && m.status !== st) return false;
    if (fecha && String(m.matchday_number) !== fecha) return false;
    return true;
  });
  return (
    <>
      <Header title="Partidos" note="Carga y edición de cada cruce, jugado o no." />
      <div className="adm-toolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" style={{ maxWidth: 260 }} />
        <select value={st} onChange={(e) => setSt(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="all">Todos</option>
          <option value="played">Jugados</option>
          <option value="pending">Pendientes</option>
          <option value="scheduled">Por jugar</option>
        </select>
      </div>
      <section className="adm-card">
        <table className="adm-table">
          <thead>
            <tr>
              <th>F</th>
              <th>Día</th>
              <th>Hora</th>
              <th>Partido</th>
              <th>Marcador</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr
                key={m.match_id}
                {...bindRow(() => router.push(`/admin/partidos/${m.match_id}`), {
                  label: `${m.home_team} — ${m.away_team}`,
                })}
              >
                <td>{m.matchday_number}</td>
                <td>{m.played_on ?? "—"}</td>
                <td>{m.kickoff_time?.slice(0, 5) ?? "—"}</td>
                <td>
                  {m.home_team} — {m.away_team}
                </td>
                <td>{m.status === "played" ? `${m.home_goals}-${m.away_goals}` : "—"}</td>
                <td>
                  <span className={`adm-pill ${m.status}`}>{m.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function DatesPanel() {
  const { data, loading, error, reload } = useAdminData();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [playedOn, setPlayedOn] = useState("");
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [mdId, setMdId] = useState("");
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;
  const days = data.matchdays;
  const teams = data.teams;

  return (
    <>
      <Header title="Fechas" note="Calendario completo, incluidas las que faltan." />
      {msg ? <p className="adm-alert">{msg}</p> : null}
      <div className="adm-grid">
        <section className="adm-card">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Día</th>
                <th>Rueda</th>
                <th>Sitio</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr
                  key={d.id}
                  {...bindRow(() => router.push(`/admin/partidos?fecha=${d.number}`), {
                    label: `Fecha ${d.number}`,
                  })}
                >
                  <td>{d.number}</td>
                  <td>
                    <input
                      type="date"
                      defaultValue={d.played_on ?? ""}
                      onBlur={(e) =>
                        start(async () => {
                          const res = await saveMatchday({
                            id: d.id,
                            number: d.number,
                            played_on: e.target.value || null,
                            league_site_number: d.league_site_number,
                            round_number: d.round_number,
                          });
                          if (!res.ok) setMsg(res.error);
                          else void reload();
                        })
                      }
                    />
                  </td>
                  <td>{d.round_number}</td>
                  <td>{d.league_site_number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="adm-card">
          <h2>Nueva fecha</h2>
          <div className="adm-form">
            <label>
              Número
              <input value={number} onChange={(e) => setNumber(e.target.value)} />
            </label>
            <label>
              Día
              <input type="date" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} />
            </label>
            <button
              className="adm-btn"
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const n = Number(number);
                  const res = await saveMatchday({
                    number: n,
                    played_on: playedOn || null,
                    league_site_number: n,
                    round_number: n < 10 ? 1 : 2,
                  });
                  if (!res.ok) setMsg(res.error);
                  else {
                    setNumber("");
                    void reload();
                  }
                })
              }
            >
              Crear fecha
            </button>
          </div>
          <h2 className="adm-k">Agregar partido</h2>
          <div className="adm-form">
            <label>
              Fecha
              <select value={mdId} onChange={(e) => setMdId(e.target.value)}>
                <option value="">Elegir</option>
                {days.map((d) => (
                  <option key={d.id} value={d.id}>
                    Fecha {d.number}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Local
              <select value={home} onChange={(e) => setHome(e.target.value)}>
                <option value="">Elegir</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Visita
              <select value={away} onChange={(e) => setAway(e.target.value)}>
                <option value="">Elegir</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="adm-btn"
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await addFixture({
                    matchdayId: Number(mdId),
                    homeTeamId: Number(home),
                    awayTeamId: Number(away),
                    kickoffTime: null,
                    pitch: null,
                  });
                  if (!res.ok) setMsg(res.error);
                  else void reload();
                })
              }
            >
              Crear partido
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function mediaSrc(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("/")) return path;
  return `/${path}`;
}

export function TeamsPanel() {
  const { data, loading, error, reload } = useAdminData();
  const [id, setId] = useState<number | "new" | null>(null);
  const [q, setQ] = useState("");
  const [rosterQ, setRosterQ] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugLocked, setSlugLocked] = useState(false);
  const [dissolved, setDissolved] = useState(false);
  const [founding, setFounding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [openTeam, setOpenTeam] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;

  const logos = new Map(
    (data.media as { kind: string; object_path: string; team_id: number | null }[])
      .filter((row) => row.kind === "team_logo" && row.team_id)
      .map((row) => [row.team_id as number, mediaSrc(row.object_path)]),
  );
  const stats = data.stats as { player_id: number; matches_played: number; goals: number }[];
  const teams = data.teams.filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase()));
  const selected = typeof id === "number" ? data.teams.find((t) => t.id === id) : null;
  const roster = typeof id === "number" ? data.players.filter((p) => p.team_id === id) : [];
  const shown = roster.filter((p) => !rosterQ || p.full_name.toLowerCase().includes(rosterQ.toLowerCase()));
  const logo = selected ? logos.get(selected.id) : null;

  function pick(t: TeamRow, open = true) {
    setId(t.id);
    setName(t.name);
    setSlug(t.slug);
    setSlugLocked(true);
    setDissolved(t.is_dissolved);
    setFounding(t.is_founding_team);
    setRosterQ("");
    setMsg(null);
    if (open) setOpenTeam(t.id);
  }

  return (
    <>
      <Header title="Equipos" note="Ficha, plantel y altas." />
      {msg ? <p className="adm-alert">{msg}</p> : null}
      <div className="tm">
        <section className="adm-card tm-list">
          <div className="tm-list-head">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar equipo" />
            <button
              className="tm-add"
              type="button"
              title="Alta"
              aria-label="Alta"
              onClick={() => {
                setId("new");
                setName("");
                setSlug("");
                setSlugLocked(false);
                setDissolved(false);
                setFounding(false);
                setRosterQ("");
              }}
            >
              +
            </button>
          </div>
          <div className="tm-scroll">
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tm-item${id === t.id ? " on" : ""}${t.is_dissolved ? " dim" : ""}`}
                onClick={() => pick(t)}
              >
                {logos.get(t.id) ? <img src={logos.get(t.id) ?? ""} alt="" width={28} height={28} /> : <span className="tm-item-dot" />}
                <span className="tm-name">{t.name}</span>
                {t.is_founding_team ? <small>F</small> : null}
              </button>
            ))}
          </div>
          <p className="tm-count">{teams.length}</p>
        </section>

        <div className="tm-main">
          {id == null ? (
            <section className="adm-card tm-empty">Elegí un equipo</section>
          ) : (
            <>
              <section className="adm-card tm-ficha">
                <div className="tm-head">
                  {logo ? <img src={logo} alt="" width={52} height={52} /> : null}
                  <div>
                    <h2>{id === "new" ? "Alta" : name || "Equipo"}</h2>
                    <p>{id === "new" ? "Club nuevo" : `${roster.length} jugadores`}</p>
                  </div>
                </div>
                <div className="tm-fields">
                  <label>
                    Nombre
                    <input
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (!slugLocked) setSlug(slugify(e.target.value));
                      }}
                    />
                  </label>
                  <label>
                    Slug
                    <input
                      value={slug}
                      onChange={(e) => {
                        setSlugLocked(true);
                        setSlug(e.target.value);
                      }}
                    />
                  </label>
                </div>
                <div className="tm-flags">
                  <label className="tm-flag">
                    <input type="checkbox" checked={founding} onChange={(e) => setFounding(e.target.checked)} />
                    <span className="tm-switch" />
                    Fundador
                  </label>
                  <label className="tm-flag">
                    <input type="checkbox" checked={dissolved} onChange={(e) => setDissolved(e.target.checked)} />
                    <span className="tm-switch" />
                    Disuelto
                  </label>
                </div>
                <div className="tm-actions">
                  <button
                    className="adm-btn"
                    type="button"
                    disabled={pending || !name.trim()}
                    onClick={() =>
                      start(async () => {
                        const res = await saveTeam({
                          id: typeof id === "number" ? id : undefined,
                          name,
                          slug: slug || slugify(name),
                          is_dissolved: dissolved,
                          is_founding_team: founding,
                        });
                        if (!res.ok) setMsg(res.error);
                        else {
                          if (res.data) setId(res.data.id);
                          setSlugLocked(true);
                          void reload();
                        }
                      })
                    }
                  >
                    {pending ? "Guardando" : "Guardar"}
                  </button>
                </div>
              </section>
              {selected ? (
                <section className="adm-card tm-plantel">
                  <div className="tm-plantel-top">
                    <h2>Plantel · {roster.length}</h2>
                    <input value={rosterQ} onChange={(e) => setRosterQ(e.target.value)} placeholder="Buscar" aria-label="Buscar jugador" />
                  </div>
                  {shown.length === 0 ? (
                    <p className="pd-empty">Sin jugadores</p>
                  ) : (
                    <table className="adm-table">
                      <thead>
                        <tr>
                          <th>Jugador</th>
                          <th>PJ</th>
                          <th>G</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((p) => {
                          const s = stats.find((row) => row.player_id === p.id);
                          return (
                            <tr
                              key={p.id}
                              className={openId === p.id ? "pd-row on" : "pd-row"}
                              tabIndex={0}
                              onClick={() => setOpenId(p.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setOpenId(p.id);
                                }
                              }}
                            >
                              <td>{p.full_name}</td>
                              <td>{s?.matches_played ?? 0}</td>
                              <td>{s?.goals ?? 0}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
      {openTeam != null ? (
        <TeamDossierModal
          teamId={openTeam}
          listIds={data.teams.map((t) => t.id)}
          onClose={() => setOpenTeam(null)}
          onOpen={(nextId) => {
            const t = data.teams.find((row) => row.id === nextId);
            if (t) pick(t, true);
          }}
          onOpenPlayer={setOpenId}
          onSaved={() => void reload()}
        />
      ) : null}
      {openId != null ? (
        <PlayerDossierModal
          playerId={openId}
          listIds={data.players.filter((p) => p.team_id === (openTeam ?? (typeof id === "number" ? id : -1))).map((p) => p.id)}
          onClose={() => setOpenId(null)}
          onOpen={setOpenId}
          onOpenTeam={(teamId) => {
            const t = data.teams.find((row) => row.id === teamId);
            if (t) pick(t, true);
          }}
        />
      ) : null}
    </>
  );
}

export function PlayersPanel() {
  const { data, loading, error, reload } = useAdminData();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("all");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(() => {
    const raw = params.get("id");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  const [openTeam, setOpenTeam] = useState<number | null>(null);

  function openPlayer(id: number) {
    setOpenId(id);
    router.replace(`/admin/jugadores?id=${id}`, { scroll: false });
  }
  function closePlayer() {
    setOpenId(null);
    router.replace("/admin/jugadores", { scroll: false });
  }
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;
  const stats = data.stats as {
    player_id: number;
    matches_played: number;
    goals: number;
    yellows: number;
    reds: number;
    motm: number;
  }[];
  const rows = data.players.filter((p) => {
    if (team !== "all" && String(p.team_id) !== team) return false;
    if (q && !p.full_name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  return (
    <>
      <Header title="Jugadores" note={`${rows.length} fichas`} />
      <div className="adm-toolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar" style={{ maxWidth: 240 }} />
        <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Equipo" style={{ maxWidth: 220 }}>
          <option value="all">Todos</option>
          {data.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="pd-plus" type="button" title="Nuevo" aria-label="Nuevo" onClick={() => setCreating(true)}>
          <IconPlus />
        </button>
      </div>
      <section className="adm-card" style={{ overflow: "auto", maxHeight: "70vh" }}>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Equipo</th>
              <th>PJ</th>
              <th>G</th>
              <th>TA</th>
              <th>TR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const s = stats.find((x) => x.player_id === p.id);
              return (
                <tr
                  key={p.id}
                  className={openId === p.id ? "pd-row on" : "pd-row"}
                  tabIndex={0}
                  onClick={() => openPlayer(p.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPlayer(p.id);
                    }
                  }}
                >
                  <td>{p.full_name}</td>
                  <td>{teamName(data.teams, p.team_id)}</td>
                  <td>{s?.matches_played ?? 0}</td>
                  <td>{s?.goals ?? 0}</td>
                  <td>{s?.yellows ?? 0}</td>
                  <td>{s?.reds ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {creating ? (
        <PlayerCreateDialog
          teams={data.teams}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            void reload();
            openPlayer(id);
          }}
        />
      ) : null}
      {openTeam != null ? (
        <TeamDossierModal
          teamId={openTeam}
          listIds={data.teams.map((t) => t.id)}
          onClose={() => setOpenTeam(null)}
          onOpen={setOpenTeam}
          onOpenPlayer={openPlayer}
          onSaved={() => void reload()}
        />
      ) : null}
      {openId != null ? (
        <PlayerDossierModal
          playerId={openId}
          listIds={rows.map((p) => p.id)}
          onClose={closePlayer}
          onOpenTeam={setOpenTeam}
          onOpen={openPlayer}
          onSaved={() => void reload()}
        />
      ) : null}
    </>
  );
}

export function ScorersPanel() {
  const { data, loading, error, openPlayer } = useAdminData();
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;
  const stats = [...(data.stats as { player_id: number; full_name: string; team_name: string; goals: number; yellows: number; reds: number; motm: number; matches_played: number }[])]
    .filter((s) => s.goals > 0)
    .sort((a, b) => b.goals - a.goals || a.full_name.localeCompare(b.full_name, "es"));
  const ids = stats.map((s) => s.player_id);
  return (
    <>
      <Header title="Goleadores" note="Se recalcula desde goles cargados en cada partido." />
      <section className="adm-card">
        <table className="adm-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Jugador</th>
              <th>Equipo</th>
              <th>G</th>
              <th>PJ</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr key={s.player_id} {...bindPlayerRow(s.player_id, ids, openPlayer)}>
                <td>{i + 1}</td>
                <td>{s.full_name}</td>
                <td>{s.team_name}</td>
                <td>{s.goals}</td>
                <td>{s.matches_played}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function standingTeamId(
  teams: { id: number; name: string }[],
  row: { team_id?: number; team_name: string },
) {
  if (typeof row.team_id === "number") return row.team_id;
  return teams.find((t) => t.name === row.team_name)?.id ?? null;
}

export function TablePanel() {
  const { data, loading, error, openTeam } = useAdminData();
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;
  const rows = data.standings as {
    pos: number;
    team_id?: number;
    team_name: string;
    pj: number;
    pg: number;
    pe: number;
    pp: number;
    gf: number;
    gc: number;
    dg: number;
    fp: number;
    pts: number;
  }[];
  const ids = data.teams.map((t) => t.id);
  return (
    <>
      <Header title="Tabla" note="Puntos, DG, fair play y resultado directo. No se edita a mano." />
      <section className="adm-card">
        <table className="adm-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Equipo</th>
              <th>PJ</th>
              <th>PG</th>
              <th>PE</th>
              <th>PP</th>
              <th>GF</th>
              <th>GC</th>
              <th>DG</th>
              <th>FP</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const id = standingTeamId(data.teams, r);
              return (
                <tr
                  key={r.team_name}
                  {...(id != null
                    ? bindRow(() => openTeam(id, ids), { label: r.team_name })
                    : {})}
                >
                  <td>{r.pos}</td>
                  <td>{r.team_name}</td>
                  <td>{r.pj}</td>
                  <td>{r.pg}</td>
                  <td>{r.pe}</td>
                  <td>{r.pp}</td>
                  <td>{r.gf}</td>
                  <td>{r.gc}</td>
                  <td>{r.dg}</td>
                  <td>{r.fp}</td>
                  <td>{r.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function FairPlayPanel() {
  const { data, loading, error, openTeam } = useAdminData();
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;
  const rows = [
    ...(data.standings as { team_id?: number; team_name: string; ta: number; tr: number; fp: number }[]),
  ].sort((a, b) => b.fp - a.fp || a.team_name.localeCompare(b.team_name, "es"));
  const ids = data.teams.map((t) => t.id);
  return (
    <>
      <Header title="Fair Play" note="−1 amarilla, −4 roja. Doble amarilla = solo roja." />
      <section className="adm-card">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Equipo</th>
              <th>TA</th>
              <th>TR</th>
              <th>FP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const id = standingTeamId(data.teams, r);
              return (
                <tr
                  key={r.team_name}
                  {...(id != null
                    ? bindRow(() => openTeam(id, ids), { label: r.team_name })
                    : {})}
                >
                  <td>{r.team_name}</td>
                  <td>{r.ta}</td>
                  <td>{r.tr}</td>
                  <td>{r.fp}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function ChampionsPanel() {
  const { data, loading, error, reload } = useAdminData();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  useEffect(() => {
    void ensureChampionPhotos().then((res) => {
      if (res.ok && (res.data?.inserted ?? 0) > 0) void reload();
    });
  }, [reload]);
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;
  const rows = data.tournaments as {
    id: number;
    official_number: number | null;
    label: string;
    kind: string;
    venue: string | null;
    champion_team_id: number | null;
    runner_up_team_id: number | null;
    unofficial_winner_name?: string | null;
  }[];
  const thumbs = new Map(
    (data.media as { kind: string; object_path: string; historical_tournament_id: number | null; sort_key: string | null }[])
      .filter((row) => row.historical_tournament_id && (row.kind === "champion_thumb" || row.kind === "champion_photo"))
      .sort((a, b) => (a.sort_key ?? "5").localeCompare(b.sort_key ?? "5"))
      .map((row) => [row.historical_tournament_id as number, mediaSrc(row.object_path)]),
  );
  const shown = rows.filter((r) => {
    if (kind !== "all" && r.kind !== kind) return false;
    if (!q) return true;
    const hay = `${r.label} ${r.official_number ?? ""} ${r.champion_team_id ? teamName(data.teams, r.champion_team_id) : ""} ${r.runner_up_team_id ? teamName(data.teams, r.runner_up_team_id) : ""} ${r.unofficial_winner_name ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });
  const ids = shown.map((r) => r.id);
  const teams = data.teams as ChampionTeamOpt[];
  return (
    <>
      <Header title="Campeones" note={`${rows.length} torneos`} />
      <div className="adm-toolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar" style={{ maxWidth: 240 }} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo" style={{ maxWidth: 180 }}>
          <option value="all">Todos</option>
          <option value="oficial">Oficial</option>
          <option value="nooficial">No oficial</option>
          <option value="suspendido">Suspendido</option>
          <option value="encurso">En curso</option>
        </select>
        <button className="pd-plus" type="button" title="Nuevo" aria-label="Nuevo" onClick={() => setCreating(true)}>
          <IconPlus />
        </button>
      </div>
      <section className="adm-card" style={{ overflow: "auto", maxHeight: "70vh" }}>
        <table className="adm-table">
          <thead>
            <tr>
              <th></th>
              <th>Nº</th>
              <th>Torneo</th>
              <th>Campeón</th>
              <th>Sub</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const pic = thumbs.get(r.id);
              const champ = r.champion_team_id ? teamName(data.teams, r.champion_team_id) : r.unofficial_winner_name || "—";
              return (
                <tr
                  key={r.id}
                  {...bindRow(() => setOpenId(r.id), { selected: openId === r.id, label: r.label })}
                >
                  <td>{pic ? <img className="ch-row-pic" src={pic} alt="" /> : null}</td>
                  <td>{r.official_number ?? "—"}</td>
                  <td>
                    {r.label}
                    {r.kind !== "oficial" ? (
                      <>
                        {" "}
                        <span className={`pd-chip${r.kind === "encurso" ? " now" : ""}`}>{kindLabel(r.kind as ChampionKind)}</span>
                      </>
                    ) : null}
                  </td>
                  <td>{champ}</td>
                  <td>{r.runner_up_team_id ? teamName(data.teams, r.runner_up_team_id) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {creating ? (
        <ChampionCreateDialog
          teams={teams}
          tournaments={rows}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            void reload();
            setOpenId(id);
          }}
        />
      ) : null}
      {openId != null ? (
        <ChampionDossierModal
          tournamentId={openId}
          listIds={ids}
          onClose={() => setOpenId(null)}
          onOpen={setOpenId}
          onSaved={() => void reload()}
        />
      ) : null}
    </>
  );
}

export function HistoryPanel() {
  const { data, loading, error, reload } = useAdminData();
  const [pending, start] = useTransition();
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;
  const rows = data.history as { id: number; body: string; is_lead: boolean; sort_order: number }[];
  return (
    <>
      <Header title="Historia" note="Párrafos de la pestaña pública." />
      {rows.map((r) => (
        <section className="adm-card" key={r.id} style={{ marginBottom: "0.75rem" }}>
          <label>
            {r.is_lead ? "Entrada" : `Párrafo ${r.sort_order}`}
            <textarea
              defaultValue={r.body}
              onBlur={(e) =>
                start(async () => {
                  await saveHistoryEntry({
                    id: r.id,
                    body: e.target.value,
                    is_lead: r.is_lead,
                    sort_order: r.sort_order,
                  });
                  void reload();
                })
              }
            />
          </label>
        </section>
      ))}
      <button
        className="adm-btn"
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await saveHistoryEntry({
              body: "",
              is_lead: false,
              sort_order: rows.length + 1,
            });
            void reload();
          })
        }
      >
        Agregar párrafo
      </button>
    </>
  );
}

const HOME_OCULTOS = new Set(["sanctions_ledger", "team_profiles", "player_profiles"]);
const HOME_GRUPOS = ["Home", "Pestañas", "Pie", "Otros"] as const;
const HOME_META: Record<string, { grupo: (typeof HOME_GRUPOS)[number]; etiqueta: string; titulo: string; cuerpo?: string }> = {
  construction_banner: { grupo: "Home", etiqueta: "Aviso", titulo: "Texto del aviso" },
  home_subtitle: { grupo: "Home", etiqueta: "Encabezado", titulo: "Subtítulo bajo LIFEXI", cuerpo: "Línea de la portada" },
  tab_fechas: { grupo: "Pestañas", etiqueta: "Fechas", titulo: "Nombre" },
  tab_equipos: { grupo: "Pestañas", etiqueta: "Equipos", titulo: "Nombre" },
  tab_lideres: { grupo: "Pestañas", etiqueta: "Goleadores y tarjetas", titulo: "Nombre" },
  tab_fair: { grupo: "Pestañas", etiqueta: "Fair Play", titulo: "Nombre" },
  tab_sim: { grupo: "Pestañas", etiqueta: "Simulador", titulo: "Nombre" },
  tab_camp: { grupo: "Pestañas", etiqueta: "Campeones", titulo: "Nombre" },
  tab_hist: { grupo: "Pestañas", etiqueta: "Historia", titulo: "Nombre" },
  footer_source: { grupo: "Pie", etiqueta: "Fuente", titulo: "Título", cuerpo: "Texto" },
  footer_table_rules: { grupo: "Pie", etiqueta: "Reglas de tabla", titulo: "Título", cuerpo: "Texto" },
  footer_fair_play: { grupo: "Pie", etiqueta: "Reglas Fair Play", titulo: "Título", cuerpo: "Texto" },
  sanctions_note: { grupo: "Pie", etiqueta: "Nota de sanciones", titulo: "Título", cuerpo: "Texto" },
};

export function HomePanel() {
  const { data, loading, error, reload } = useAdminData();
  const [pending, start] = useTransition();
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;
  const rows = (data.content as { id: number; slug: string; area: string; title: string | null; body: string | null; is_visible: boolean }[]).filter(
    (r) => !HOME_OCULTOS.has(r.slug),
  );
  function saveRow(
    r: { id: number; title: string | null; body: string | null; is_visible: boolean },
    patch: Partial<{ title: string | null; body: string | null; is_visible: boolean }>,
  ) {
    start(async () => {
      await saveSiteContent({
        id: r.id,
        title: patch.title !== undefined ? patch.title : r.title,
        body: patch.body !== undefined ? patch.body : r.body,
        is_visible: patch.is_visible !== undefined ? patch.is_visible : r.is_visible,
      });
      void reload();
    });
  }
  return (
    <>
      <Header title="Portada" note="La próxima fecha del torneo se arma sola. Acá se editan aviso, subtítulo, pestañas y pie." />
      {HOME_GRUPOS.map((grupo) => {
        const items = rows.filter((r) => (HOME_META[r.slug]?.grupo ?? "Otros") === grupo);
        if (!items.length) return null;
        return (
          <div key={grupo} style={{ marginBottom: "1.1rem" }}>
            <p className="adm-kicker" style={{ margin: "0 0 0.45rem", color: "var(--muted, #8aa)", fontSize: "0.78rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {grupo}
            </p>
            {items.map((r) => {
              const meta = HOME_META[r.slug] ?? { grupo: "Otros" as const, etiqueta: r.slug, titulo: "Título", cuerpo: "Texto" };
              return (
                <section className="adm-card" key={r.id} style={{ marginBottom: "0.7rem" }}>
                  <div className="adm-form two">
                    <label>
                      {meta.etiqueta}
                      <input
                        defaultValue={r.title ?? ""}
                        disabled={pending}
                        onBlur={(e) => saveRow(r, { title: e.target.value })}
                      />
                    </label>
                    <label>
                      Visible
                      <select
                        defaultValue={r.is_visible ? "1" : "0"}
                        disabled={pending}
                        onChange={(e) => saveRow(r, { is_visible: e.target.value === "1" })}
                      >
                        <option value="1">Sí</option>
                        <option value="0">No</option>
                      </select>
                    </label>
                    {meta.cuerpo ? (
                      <label>
                        {meta.cuerpo}
                        <textarea
                          defaultValue={r.body ?? ""}
                          disabled={pending}
                          onBlur={(e) => saveRow(r, { body: e.target.value })}
                        />
                      </label>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

export function MediaPanel() {
  const { data, loading, error, reload } = useAdminData();
  const [kind, setKind] = useState("all");
  const kinds = useMemo(
    () => Array.from(new Set(((data?.media as { kind: string }[] | undefined) ?? []).map((m) => m.kind))),
    [data],
  );
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;
  const rows = (data.media as { id: number; kind: string; object_path: string; caption: string | null; width: number | null; height: number | null }[]).filter(
    (m) => kind === "all" || m.kind === kind,
  );
  return (
    <>
      <Header title="Medios" note="Rutas de logos, planteles, campeones y estrellas." />
      <div className="adm-toolbar">
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="all">Todos</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <section className="adm-card">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Archivo</th>
              <th>Leyenda</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>{m.kind}</td>
                <td>{m.object_path}</td>
                <td>
                  <input
                    defaultValue={m.caption ?? ""}
                    onBlur={(e) => {
                      void saveMediaCaption({ id: m.id, caption: e.target.value || null });
                      void reload();
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function SettingsPanel() {
  const { data, loading, error, reload } = useAdminData();
  const [pending, start] = useTransition();
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data?.season) return <p className="adm-alert">{error ?? "Sin temporada"}</p>;
  const s = data.season as {
    id: number;
    name: string;
    venue: string | null;
    published_through_matchday: number | null;
    second_round_from: number;
    total_matchdays: number;
  };
  return (
    <>
      <Header title="Ajustes" note="Temporada activa y publicación." />
      <section className="adm-card">
        <form
          className="adm-form two"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              await saveSeason({
                id: s.id,
                name: String(fd.get("name")),
                venue: String(fd.get("venue") || "") || null,
                published_through_matchday: Number(fd.get("published")) || null,
                second_round_from: Number(fd.get("rueda2")),
                total_matchdays: Number(fd.get("total")),
              });
              void reload();
            });
          }}
        >
          <label>
            Nombre
            <input name="name" defaultValue={s.name} />
          </label>
          <label>
            Sede
            <input name="venue" defaultValue={s.venue ?? ""} />
          </label>
          <label>
            Publicada hasta fecha
            <input name="published" defaultValue={s.published_through_matchday ?? ""} />
          </label>
          <label>
            Segunda rueda desde
            <input name="rueda2" defaultValue={s.second_round_from} />
          </label>
          <label>
            Total de fechas
            <input name="total" defaultValue={s.total_matchdays} />
          </label>
          <div className="adm-actions">
            <button className="adm-btn" type="submit" disabled={pending}>
              Guardar
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

function Header({ title, note }: { title: string; note: string }) {
  return (
    <div className="adm-top">
      <div>
        <h1>{title}</h1>
        <p>{note}</p>
      </div>
    </div>
  );
}
