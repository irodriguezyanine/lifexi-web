"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  addFixture,
  deleteSanction,
  saveHistoryEntry,
  saveMatchday,
  saveMediaCaption,
  savePlayer,
  saveSanction,
  saveSeason,
  saveSiteContent,
  saveTeam,
  saveTournament,
} from "@/app/admin/actions";
import { useAdminData } from "@/components/admin/store";

function teamName(teams: { id: number; name: string }[], id: number) {
  return teams.find((t) => t.id === id)?.name ?? `#${id}`;
}

export function MatchesPanel() {
  const { data, loading, error } = useAdminData();
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.match_id}>
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
                <td>
                  <Link href={`/admin/partidos/${m.match_id}`}>
                    {m.status === "played" ? "Editar" : "Completar"}
                  </Link>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.id}>
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
                  <td>
                    <Link href={`/admin/partidos?fecha=${d.number}`}>Ver</Link>
                  </td>
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

export function TeamsPanel() {
  const { data, loading, error, reload } = useAdminData();
  const [id, setId] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [dissolved, setDissolved] = useState(false);
  const [founding, setFounding] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;
  const selected = typeof id === "number" ? data.teams.find((t) => t.id === id) : null;
  const roster = typeof id === "number" ? data.players.filter((p) => p.team_id === id) : [];

  return (
    <>
      <Header title="Equipos" note="Ficha, plantel y altas." />
      {msg ? <p className="adm-alert">{msg}</p> : null}
      <div className="adm-split">
        <section className="adm-card adm-list">
          <button
            type="button"
            onClick={() => {
              setId("new");
              setName("");
              setSlug("");
              setDissolved(false);
              setFounding(false);
            }}
          >
            + Equipo
          </button>
          {data.teams.map((t) => (
            <button
              key={t.id}
              type="button"
              className={id === t.id ? "on" : undefined}
              onClick={() => {
                setId(t.id);
                setName(t.name);
                setSlug(t.slug);
                setDissolved(t.is_dissolved);
                setFounding(t.is_founding_team);
              }}
            >
              {t.name}
            </button>
          ))}
        </section>
        <section className="adm-card">
          {id == null ? (
            <p className="adm-empty">Elegí un equipo</p>
          ) : (
            <>
              <div className="adm-form">
                <label>
                  Nombre
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label>
                  Slug
                  <input value={slug} onChange={(e) => setSlug(e.target.value)} />
                </label>
                <label>
                  <span>
                    <input type="checkbox" checked={founding} onChange={(e) => setFounding(e.target.checked)} /> Fundador
                  </span>
                </label>
                <label>
                  <span>
                    <input type="checkbox" checked={dissolved} onChange={(e) => setDissolved(e.target.checked)} /> Disuelto
                  </span>
                </label>
                <button
                  className="adm-btn"
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await saveTeam({
                        id: typeof id === "number" ? id : undefined,
                        name,
                        slug: slug || name.toLowerCase().replace(/\s+/g, "-"),
                        is_dissolved: dissolved,
                        is_founding_team: founding,
                      });
                      if (!res.ok) setMsg(res.error);
                      else {
                        if (res.data) setId(res.data.id);
                        void reload();
                      }
                    })
                  }
                >
                  Guardar
                </button>
              </div>
              {selected ? (
                <>
                  <h2>Plantel ({roster.length})</h2>
                  <table className="adm-table">
                    <tbody>
                      {roster.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <Link href={`/admin/jugadores?id=${p.id}`}>{p.full_name}</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
            </>
          )}
        </section>
      </div>
    </>
  );
}

export function PlayersPanel() {
  const { data, loading, error, reload } = useAdminData();
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("all");
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
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
      <Header title="Jugadores" note="Planteles del torneo. Los homónimos son fichas distintas." />
      {msg ? <p className="adm-alert">{msg}</p> : null}
      <div className="adm-toolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" style={{ maxWidth: 240 }} />
        <select value={team} onChange={(e) => setTeam(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="all">Todos</option>
          {data.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="adm-grid">
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const s = stats.find((x) => x.player_id === p.id);
                return (
                  <tr key={p.id}>
                    <td>{p.full_name}</td>
                    <td>{teamName(data.teams, p.team_id)}</td>
                    <td>{s?.matches_played ?? 0}</td>
                    <td>{s?.goals ?? 0}</td>
                    <td>{s?.yellows ?? 0}</td>
                    <td>{s?.reds ?? 0}</td>
                    <td>
                      <button
                        className="adm-btn ghost"
                        type="button"
                        onClick={() => {
                          setEditId(p.id);
                          setName(p.full_name);
                          setTeamId(String(p.team_id));
                        }}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section className="adm-card">
          <h2>{editId ? "Editar" : "Alta"}</h2>
          <div className="adm-form">
            <label>
              Nombre
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Equipo
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">Elegir</option>
                {data.teams.map((t) => (
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
                  const res = await savePlayer({
                    id: editId ?? undefined,
                    full_name: name,
                    team_id: Number(teamId),
                  });
                  if (!res.ok) setMsg(res.error);
                  else {
                    setEditId(null);
                    setName("");
                    void reload();
                  }
                })
              }
            >
              Guardar
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

export function ScorersPanel() {
  const { data, loading, error } = useAdminData();
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;
  const stats = [...(data.stats as { player_id: number; full_name: string; team_name: string; goals: number; yellows: number; reds: number; motm: number; matches_played: number }[])]
    .filter((s) => s.goals > 0)
    .sort((a, b) => b.goals - a.goals || a.full_name.localeCompare(b.full_name, "es"));
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
              <tr key={s.player_id}>
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

export function TablePanel() {
  const { data, loading, error } = useAdminData();
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;
  const rows = data.standings as {
    pos: number;
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
            {rows.map((r) => (
              <tr key={r.team_name}>
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
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function FairPlayPanel() {
  const { data, loading, error } = useAdminData();
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;
  const rows = [...(data.standings as { team_name: string; ta: number; tr: number; fp: number }[])].sort(
    (a, b) => b.fp - a.fp || a.team_name.localeCompare(b.team_name, "es"),
  );
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
            {rows.map((r) => (
              <tr key={r.team_name}>
                <td>{r.team_name}</td>
                <td>{r.ta}</td>
                <td>{r.tr}</td>
                <td>{r.fp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function SanctionsPanel() {
  const { data, loading, error, reload } = useAdminData();
  const [player, setPlayer] = useState("");
  const [detail, setDetail] = useState("");
  const [sanction, setSanction] = useState("");
  const [pending, start] = useTransition();
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;
  const rows = data.sanctions as {
    id: number;
    detail: string;
    sanction: string;
    players: { full_name: string } | { full_name: string }[] | null;
  }[];
  return (
    <>
      <Header title="Sanciones" note="Publicadas tal cual las ve la liga." />
      <div className="adm-grid">
        <section className="adm-card">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Jugador</th>
                <th>Detalle</th>
                <th>Sanción</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = Array.isArray(r.players) ? r.players[0] : r.players;
                return (
                  <tr key={r.id}>
                    <td>{p?.full_name}</td>
                    <td>{r.detail}</td>
                    <td>{r.sanction}</td>
                    <td>
                      <button
                        className="adm-btn ghost"
                        type="button"
                        onClick={() =>
                          start(async () => {
                            await deleteSanction(r.id);
                            void reload();
                          })
                        }
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section className="adm-card">
          <h2>Nueva</h2>
          <div className="adm-form">
            <label>
              Jugador
              <select value={player} onChange={(e) => setPlayer(e.target.value)}>
                <option value="">Elegir</option>
                {data.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} · {teamName(data.teams, p.team_id)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Detalle
              <input value={detail} onChange={(e) => setDetail(e.target.value)} />
            </label>
            <label>
              Sanción
              <input value={sanction} onChange={(e) => setSanction(e.target.value)} />
            </label>
            <button
              className="adm-btn"
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await saveSanction({ player_id: Number(player), detail, sanction });
                  setDetail("");
                  setSanction("");
                  void reload();
                })
              }
            >
              Publicar
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

export function ChampionsPanel() {
  const { data, loading, error, reload } = useAdminData();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("oficial");
  const [champ, setChamp] = useState("");
  const [sub, setSub] = useState("");
  const [pending, start] = useTransition();
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;
  const rows = data.tournaments as {
    id: number;
    official_number: number | null;
    label: string;
    kind: string;
    champion_team_id: number | null;
    runner_up_team_id: number | null;
    venue: string | null;
    notes: string | null;
    runner_up_asterisk: boolean;
    disqualified_team_id: number | null;
    counts_as_final: boolean;
  }[];
  return (
    <>
      <Header title="Campeones" note="Historial Junior, palmarés y finales se derivan de acá." />
      <section className="adm-card" style={{ overflow: "auto", maxHeight: "52vh" }}>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Nº</th>
              <th>Torneo</th>
              <th>Campeón</th>
              <th>Sub</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.official_number ?? "—"}</td>
                <td>{r.label}</td>
                <td>{r.champion_team_id ? teamName(data.teams, r.champion_team_id) : "—"}</td>
                <td>{r.runner_up_team_id ? teamName(data.teams, r.runner_up_team_id) : "—"}</td>
                <td>
                  <button
                    className="adm-btn ghost"
                    type="button"
                    onClick={() => {
                      setLabel(r.label);
                      setKind(r.kind);
                      setChamp(r.champion_team_id ? String(r.champion_team_id) : "");
                      setSub(r.runner_up_team_id ? String(r.runner_up_team_id) : "");
                    }}
                  >
                    Cargar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="adm-card" style={{ marginTop: "0.85rem" }}>
        <h2>Alta / edición por etiqueta</h2>
        <div className="adm-form three">
          <label>
            Torneo
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label>
            Tipo
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="oficial">oficial</option>
              <option value="suspendido">suspendido</option>
              <option value="nooficial">nooficial</option>
              <option value="encurso">encurso</option>
            </select>
          </label>
          <label>
            Campeón
            <select value={champ} onChange={(e) => setChamp(e.target.value)}>
              <option value="">—</option>
              {data.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Subcampeón
            <select value={sub} onChange={(e) => setSub(e.target.value)}>
              <option value="">—</option>
              {data.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="adm-actions">
          <button
            className="adm-btn"
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const existing = rows.find((r) => r.label === label);
                await saveTournament({
                  id: existing?.id,
                  official_number: existing?.official_number ?? null,
                  label,
                  venue: existing?.venue ?? null,
                  notes: existing?.notes ?? null,
                  kind,
                  champion_team_id: champ ? Number(champ) : null,
                  runner_up_team_id: sub ? Number(sub) : null,
                  runner_up_asterisk: existing?.runner_up_asterisk ?? false,
                  disqualified_team_id: existing?.disqualified_team_id ?? null,
                  counts_as_final: kind === "oficial",
                });
                void reload();
              })
            }
          >
            Guardar torneo
          </button>
        </div>
      </section>
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

export function HomePanel() {
  const { data, loading, error, reload } = useAdminData();
  const [pending, start] = useTransition();
  if (loading) return <p className="adm-load">Cargando…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;
  const rows = data.content as { id: number; slug: string; area: string; title: string | null; body: string | null; is_visible: boolean }[];
  return (
    <>
      <Header title="Portada" note="Textos, pestañas y avisos del home." />
      {rows.map((r) => (
        <section className="adm-card" key={r.id} style={{ marginBottom: "0.7rem" }}>
          <div className="adm-form two">
            <label>
              {r.slug}
              <input
                defaultValue={r.title ?? ""}
                onBlur={(e) =>
                  start(async () => {
                    await saveSiteContent({
                      id: r.id,
                      title: e.target.value,
                      body: r.body,
                      is_visible: r.is_visible,
                    });
                    void reload();
                  })
                }
              />
            </label>
            <label>
              Visible
              <select
                defaultValue={r.is_visible ? "1" : "0"}
                onChange={(e) =>
                  start(async () => {
                    await saveSiteContent({
                      id: r.id,
                      title: r.title,
                      body: r.body,
                      is_visible: e.target.value === "1",
                    });
                    void reload();
                  })
                }
              >
                <option value="1">Sí</option>
                <option value="0">No</option>
              </select>
            </label>
            <label>
              Texto
              <textarea
                defaultValue={r.body ?? ""}
                onBlur={(e) =>
                  start(async () => {
                    await saveSiteContent({
                      id: r.id,
                      title: r.title,
                      body: e.target.value,
                      is_visible: r.is_visible,
                    });
                    void reload();
                  })
                }
              />
            </label>
          </div>
        </section>
      ))}
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
