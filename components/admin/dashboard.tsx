"use client";

import Link from "next/link";
import { useAdminData } from "@/components/admin/store";

function statusOf(row: Record<string, unknown>) {
  return String(row.status ?? "");
}

export function Dashboard() {
  const { data, loading, error } = useAdminData();
  if (loading) return <p className="adm-load">Cargando escritorio…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;

  const calendar = data.calendar as {
    match_id: number;
    matchday_number: number;
    home_team: string;
    away_team: string;
    home_goals: number | null;
    away_goals: number | null;
    status: string;
    kickoff_time: string | null;
    played_on: string | null;
  }[];
  const played = calendar.filter((m) => m.status === "played");
  const open = calendar.filter((m) => m.status !== "played");
  const goals = played.reduce((s, m) => s + (m.home_goals ?? 0) + (m.away_goals ?? 0), 0);
  const standings = data.standings as { pos: number; team_name: string; pts: number; pj: number; dg: number }[];
  const inbox = open.slice(0, 8);

  return (
    <>
      <div className="adm-top">
        <div>
          <h1>Escritorio</h1>
          <p>Apertura 2026 · operación de la fecha</p>
        </div>
        <Link className="adm-btn" href="/admin/partidos">
          Completar resultado
        </Link>
      </div>
      <div className="adm-kpis">
        <div className="adm-kpi">
          <span>Jugados</span>
          <b>{played.length}</b>
        </div>
        <div className="adm-kpi">
          <span>Por cargar</span>
          <b>{open.length}</b>
        </div>
        <div className="adm-kpi">
          <span>Goles</span>
          <b>{goals}</b>
        </div>
        <div className="adm-kpi">
          <span>Equipos</span>
          <b>{data.teams.length}</b>
        </div>
        <div className="adm-kpi">
          <span>Jugadores</span>
          <b>{data.players.length}</b>
        </div>
        <div className="adm-kpi">
          <span>Sanciones</span>
          <b>{data.sanctions.length}</b>
        </div>
      </div>
      <div className="adm-grid">
        <section className="adm-card">
          <h2>Bandeja de partidos</h2>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Partido</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {inbox.map((m) => (
                <tr key={m.match_id}>
                  <td>{m.matchday_number}</td>
                  <td>
                    {m.home_team} — {m.away_team}
                  </td>
                  <td>
                    <span className={`adm-pill ${statusOf(m)}`}>{m.status}</span>
                  </td>
                  <td>
                    <Link href={`/admin/partidos/${m.match_id}`}>Cargar</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="adm-card">
          <h2>Tabla</h2>
          <table className="adm-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Equipo</th>
                <th>Pts</th>
                <th>PJ</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((r) => (
                <tr key={r.team_name}>
                  <td>{r.pos}</td>
                  <td>{r.team_name}</td>
                  <td>{r.pts}</td>
                  <td>{r.pj}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
