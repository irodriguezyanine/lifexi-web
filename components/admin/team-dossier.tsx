"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveTeam } from "@/app/admin/actions";
import { getTeamDossier } from "@/app/admin/team-dossier-action";
import { IconChevL, IconChevR, IconClose, IconCopy, IconEdit } from "@/components/admin/icons";
import type { TeamDossier, TeamDossierPlayer, TeamDossierTitle } from "@/lib/admin/types";
import "@/app/admin/player-dossier.css";
import "@/app/admin/team-dossier.css";

const TABS = [
  { id: "actual", label: "Actual" },
  { id: "plantel", label: "Plantel" },
  { id: "fotos", label: "Fotos" },
  { id: "campeonatos", label: "Campeonatos" },
  { id: "campana", label: "Campaña" },
  { id: "ficha", label: "Ficha" },
] as const;

type Tab = (typeof TABS)[number]["id"];
type SortKey = "full_name" | "matches_played" | "goals" | "yellows" | "reds" | "motm";

function fmtDate(value: string | null) {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  return d && m ? `${d}.${m}.${y}` : value;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function roleChip(role: TeamDossierTitle["role"]) {
  if (role === "champion") return <span className="pd-chip win">Campeón</span>;
  if (role === "runner") return <span className="pd-chip">Subcampeón</span>;
  if (role === "dq") return <span className="pd-chip loss">Desc.</span>;
  return <span className="pd-chip now">En curso</span>;
}

export function TeamDossierModal({
  teamId,
  listIds,
  onClose,
  onOpen,
  onOpenPlayer,
  onSaved,
}: {
  teamId: number;
  listIds: number[];
  onClose: () => void;
  onOpen: (id: number) => void;
  onOpenPlayer: (id: number) => void;
  onSaved?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("actual");
  const [data, setData] = useState<TeamDossier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [q, setQ] = useState("");
  const [onlyPlayed, setOnlyPlayed] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "full_name", asc: true });
  const [titleId, setTitleId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [founding, setFounding] = useState(false);
  const [dissolved, setDissolved] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const idx = listIds.indexOf(teamId);
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
    setQ("");
    setMsg(null);
    void getTeamDossier(teamId)
      .then((res) => {
        if (!live) return;
        if (!res.ok) {
          setError(res.error);
          setData(null);
        } else {
          setData(res.data);
          setName(res.data.team.name);
          setSlug(res.data.team.slug);
          setFounding(res.data.team.is_founding_team);
          setDissolved(res.data.team.is_dissolved);
          const first = res.data.titles.find((row) => row.role === "champion" && (row.photo || row.thumb));
          setTitleId(first?.id ?? res.data.titles[0]?.id ?? null);
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
  }, [teamId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const t = event.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (event.key === "ArrowLeft" && prev) onOpen(prev);
      if (event.key === "ArrowRight" && next) onOpen(next);
      if (event.key === "/" && tab === "plantel") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, onOpen, tab]);

  const shown = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const rows = data.roster.filter((row) => {
      if (onlyPlayed && row.matches_played === 0) return false;
      if (needle && !row.full_name.toLowerCase().includes(needle) && !row.otherClubs.some((c) => c.team_name.toLowerCase().includes(needle))) {
        return false;
      }
      return true;
    });
    const dir = sort.asc ? 1 : -1;
    return rows.slice().sort((a, b) => {
      if (sort.key === "full_name") return a.full_name.localeCompare(b.full_name, "es") * dir;
      return ((a[sort.key] as number) - (b[sort.key] as number)) * dir || a.full_name.localeCompare(b.full_name, "es");
    });
  }, [data, q, onlyPlayed, sort]);

  const titlesWithPhoto = data?.titles.filter((row) => row.role === "champion") ?? [];
  const selectedTitle = data?.titles.find((row) => row.id === titleId) ?? titlesWithPhoto[0] ?? null;
  const t = data?.team;
  const tb = data?.table;

  function toggleSort(key: SortKey) {
    setSort((cur) => (cur.key === key ? { key, asc: !cur.asc } : { key, asc: key === "full_name" }));
  }

  return (
    <dialog
      ref={dialog}
      className="td-dialog"
      aria-labelledby="td-name"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="td-shell">
        <div className="td-hero">
          {t?.squad_photos[0] ? <img className="td-banner" src={t.squad_photos[0].src} alt="" /> : null}
          <header className="td-head">
            {t?.logo ? <img className="td-logo" src={t.logo} alt="" width={72} height={72} /> : <span className="td-logo" />}
            <div className="td-id">
              <h2 id="td-name">{t?.name ?? "Equipo"}</h2>
              <p>
                {tb?.pos ? <span className="pd-chip now">{tb.pos}º</span> : null}
                {data?.season ? <span className="pd-chip">{data.season.name}</span> : null}
                {t?.is_founding_team ? <span className="pd-chip">Fundador</span> : null}
                {t?.is_dissolved ? <span className="pd-chip loss">Disuelto</span> : null}
                {t ? <span className="pd-chip">{t.slug}</span> : null}
              </p>
            </div>
            <div className="td-tools">
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
                onClick={() => t && void navigator.clipboard.writeText(t.name)}
              >
                <IconCopy />
              </button>
              <button className="pd-icon" type="button" title="Editar" aria-label="Editar" onClick={() => setTab("ficha")}>
                <IconEdit />
              </button>
              <button className="pd-icon" type="button" title="Cerrar" aria-label="Cerrar" onClick={onClose}>
                <IconClose />
              </button>
            </div>
          </header>
        </div>

        {tb ? (
          <div className="td-kpis">
            <div className="pd-kpi">
              <b>{tb.pts}</b>
              <span>Pts</span>
            </div>
            <div className="pd-kpi">
              <b>{tb.pj}</b>
              <span>PJ</span>
            </div>
            <div className="pd-kpi">
              <b>
                {tb.pg}-{tb.pe}-{tb.pp}
              </b>
              <span>PG-PE-PP</span>
            </div>
            <div className="pd-kpi">
              <b>
                {tb.gf}:{tb.gc}
              </b>
              <span>GF:GC</span>
            </div>
            <div className="pd-kpi">
              <b>{tb.dg > 0 ? `+${tb.dg}` : tb.dg}</b>
              <span>DG</span>
            </div>
            <div className="pd-kpi">
              <b>{tb.fp}</b>
              <span>FP</span>
            </div>
            <div className="pd-kpi">
              <b>{data?.club.titles ?? 0}</b>
              <span>Títulos</span>
            </div>
            <div className="pd-kpi">
              <b>{data?.roster.length ?? 0}</b>
              <span>Plantel</span>
            </div>
            <div className="pd-kpi">
              <b>{data?.roster.reduce((sum, row) => sum + row.goals, 0) ?? 0}</b>
              <span>Goles</span>
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
              {item.id === "plantel" && data ? ` ${data.roster.length}` : ""}
              {item.id === "campeonatos" && data ? ` ${data.club.titles}` : ""}
            </button>
          ))}
        </div>

        <div className="td-body">
          {busy ? <p className="pd-load">Cargando</p> : null}
          {error ? <p className="adm-alert">{error}</p> : null}
          {!busy && data && tab === "actual" ? <Actual data={data} onOpenPlayer={onOpenPlayer} /> : null}
          {!busy && data && tab === "plantel" ? (
            <Plantel
              shown={shown}
              total={data.roster.length}
              q={q}
              onlyPlayed={onlyPlayed}
              sort={sort}
              searchRef={searchRef}
              onQ={setQ}
              onOnly={setOnlyPlayed}
              onSort={toggleSort}
              onOpenPlayer={onOpenPlayer}
              onOpenTeam={onOpen}
            />
          ) : null}
          {!busy && data && tab === "fotos" ? <Fotos data={data} /> : null}
          {!busy && data && tab === "campeonatos" ? (
            <Campeonatos titles={titlesWithPhoto.length ? titlesWithPhoto : data.titles} selected={selectedTitle} onSelect={setTitleId} />
          ) : null}
          {!busy && data && tab === "campana" ? <Campana data={data} /> : null}
          {!busy && data && tab === "ficha" ? (
            <Ficha
              name={name}
              slug={slug}
              founding={founding}
              dissolved={dissolved}
              pending={pending}
              msg={msg}
              onName={(value) => {
                setName(value);
                if (slug === data.team.slug || slug === slugify(name)) setSlug(slugify(value));
              }}
              onSlug={setSlug}
              onFounding={setFounding}
              onDissolved={setDissolved}
              onSave={() =>
                start(async () => {
                  const res = await saveTeam({
                    id: data.team.id,
                    name,
                    slug: slug || slugify(name),
                    is_dissolved: dissolved,
                    is_founding_team: founding,
                  });
                  if (!res.ok) setMsg(res.error);
                  else {
                    setMsg(null);
                    onSaved?.();
                    const again = await getTeamDossier(data.team.id);
                    if (again.ok) setData(again.data);
                  }
                })
              }
            />
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

function Actual({ data, onOpenPlayer }: { data: TeamDossier; onOpenPlayer: (id: number) => void }) {
  const played = data.matches.filter((row) => row.result);
  const top = data.roster.filter((row) => row.goals > 0).slice().sort((a, b) => b.goals - a.goals || a.full_name.localeCompare(b.full_name, "es")).slice(0, 5);
  const linked = data.roster.filter((row) => row.otherClubs.length > 0);
  return (
    <div className="td-two">
      <section className="pd-card">
        <h3>Campeonato</h3>
        <div className="pd-meta">
          <div>
            <span>Torneo</span>
            <b>{data.season.name}</b>
          </div>
          <div>
            <span>Sede</span>
            <b>{data.season.venue ?? "—"}</b>
          </div>
          <div>
            <span>Lugar</span>
            <b>{data.table.pos ? `${data.table.pos}º` : "—"}</b>
          </div>
          <div>
            <span>Puntos</span>
            <b>{data.table.pts}</b>
          </div>
          <div>
            <span>Último título</span>
            <b>{data.club.last_title ?? "—"}</b>
          </div>
          <div>
            <span>Finales</span>
            <b>
              {data.club.finals_won}/{data.club.finals_played}
            </b>
          </div>
        </div>
        <div className="td-wdl" aria-hidden="true" style={{ marginTop: "0.85rem" }}>
          {played.map((row) => (
            <i key={row.match_id} className={row.result ?? undefined} title={`F${row.matchday_number} ${row.result}`} />
          ))}
        </div>
      </section>
      <section className="pd-card">
        <h3>Goleadores</h3>
        {top.length === 0 ? (
          <p className="pd-empty">Sin goles</p>
        ) : (
          top.map((row) => (
            <button key={row.id} className="pd-stint" type="button" onClick={() => onOpenPlayer(row.id)}>
              <span>{row.full_name}</span>
              <b>{row.goals} G</b>
            </button>
          ))
        )}
      </section>
      {data.team.squad_photos[0] ? (
        <section className="pd-card" style={{ gridColumn: "1 / -1" }}>
          <h3>Plantel</h3>
          <img className="pd-photo" src={data.team.squad_photos[0].src} alt="" style={{ maxHeight: 280 }} />
        </section>
      ) : null}
      {linked.length ? (
        <section className="pd-card" style={{ gridColumn: "1 / -1" }}>
          <h3>También en otros clubes</h3>
          {linked.map((row) => (
            <div key={row.id} className="pd-stint">
              <button type="button" className="enlace" onClick={() => onOpenPlayer(row.id)}>
                {row.full_name}
              </button>
              <b>{row.otherClubs.map((c) => c.team_name).join(" · ")}</b>
            </div>
          ))}
        </section>
      ) : null}
      {data.alumni.length ? (
        <section className="pd-card" style={{ gridColumn: "1 / -1" }}>
          <h3>Pasaron por este club</h3>
          {data.alumni.map((row) => (
            <button key={row.id} className="pd-stint" type="button" onClick={() => onOpenPlayer(row.id)}>
              <span>{row.full_name}</span>
              <b>
                {row.matches_played} PJ · {row.goals} G
              </b>
            </button>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function Plantel({
  shown,
  total,
  q,
  onlyPlayed,
  sort,
  searchRef,
  onQ,
  onOnly,
  onSort,
  onOpenPlayer,
  onOpenTeam,
}: {
  shown: TeamDossierPlayer[];
  total: number;
  q: string;
  onlyPlayed: boolean;
  sort: { key: SortKey; asc: boolean };
  searchRef: React.RefObject<HTMLInputElement | null>;
  onQ: (value: string) => void;
  onOnly: (value: boolean) => void;
  onSort: (key: SortKey) => void;
  onOpenPlayer: (id: number) => void;
  onOpenTeam: (id: number) => void;
}) {
  const heads: { key: SortKey; label: string; num?: boolean }[] = [
    { key: "full_name", label: "Jugador" },
    { key: "matches_played", label: "PJ", num: true },
    { key: "goals", label: "G", num: true },
    { key: "yellows", label: "TA", num: true },
    { key: "reds", label: "TR", num: true },
    { key: "motm", label: "★", num: true },
  ];
  return (
    <div>
      <div className="td-plantel-top">
        <input
          ref={searchRef}
          type="search"
          value={q}
          onChange={(event) => onQ(event.target.value)}
          placeholder="Buscar"
          aria-label="Buscar jugador"
        />
        <label className="td-check">
          <input type="checkbox" checked={onlyPlayed} onChange={(event) => onOnly(event.target.checked)} />
          Con partidos
        </label>
        <span className="td-count">
          {shown.length}/{total}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="pd-empty">Sin jugadores</p>
      ) : (
        <table className="td-table">
          <thead>
            <tr>
              {heads.map((h) => (
                <th
                  key={h.key}
                  className={h.num ? "num" : undefined}
                  aria-sort={sort.key === h.key ? (sort.asc ? "ascending" : "descending") : "none"}
                  onClick={() => onSort(h.key)}
                >
                  {h.label}
                  {sort.key === h.key ? (sort.asc ? " ▲" : " ▼") : ""}
                </th>
              ))}
              <th>Otros</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr
                key={row.id}
                tabIndex={0}
                onClick={() => onOpenPlayer(row.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenPlayer(row.id);
                  }
                }}
              >
                <td className="td-name">{row.full_name}</td>
                <td className="num">{row.matches_played}</td>
                <td className="num">{row.goals}</td>
                <td className="num">{row.yellows}</td>
                <td className="num">{row.reds}</td>
                <td className="num">{row.motm}</td>
                <td>
                  {row.otherClubs.length ? (
                    <div className="td-clubs">
                      {row.otherClubs.map((c) => (
                        <button
                          key={c.player_id}
                          type="button"
                          title={c.team_name}
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenTeam(c.team_id);
                          }}
                        >
                          {c.team_name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Fotos({ data }: { data: TeamDossier }) {
  const shots = [
    data.team.logo ? { src: data.team.logo, caption: "Escudo" } : null,
    ...data.team.squad_photos.map((row, i) => ({ src: row.src, caption: row.caption || `Plantel ${i + 1}` })),
    ...data.titles.filter((row) => row.photo || row.thumb).map((row) => ({ src: row.photo || row.thumb || "", caption: row.label })),
  ].filter((row): row is { src: string; caption: string } => Boolean(row?.src));
  if (!shots.length) return <p className="pd-empty">Sin fotos</p>;
  return (
    <div className="td-gal">
      {shots.map((row) => (
        <figure key={row.src + row.caption}>
          <img src={row.src} alt="" />
          <figcaption>{row.caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function Campeonatos({
  titles,
  selected,
  onSelect,
}: {
  titles: TeamDossierTitle[];
  selected: TeamDossierTitle | null;
  onSelect: (id: number) => void;
}) {
  if (!titles.length) return <p className="pd-empty">Sin campeonatos</p>;
  const current = selected ?? titles[0];
  return (
    <div className="td-camp">
      <div className="td-camp-tabs" role="tablist" aria-label="Campeonatos">
        {titles.map((row) => (
          <button
            key={row.id}
            type="button"
            role="tab"
            aria-selected={current?.id === row.id}
            onClick={() => onSelect(row.id)}
          >
            {row.thumb || row.photo ? <img src={row.thumb || row.photo || ""} alt="" /> : <span className="td-ph" />}
            <span>
              <b>{row.label}</b>
              <small>{row.role === "champion" ? "Campeón" : row.role === "runner" ? "Subcampeón" : row.kind}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="td-camp-view">
        {current.photo || current.thumb ? <img src={current.photo || current.thumb || ""} alt="" /> : <p className="pd-empty">Sin foto</p>}
        <h3>{current.label}</h3>
        <p className="pd-empty" style={{ marginTop: 0 }}>
          {current.official_number ? `#${current.official_number} · ` : ""}
          {current.venue ?? "Sin sede"}
          {current.champion ? ` · ${current.champion}` : ""}
          {current.runner_up ? ` vs ${current.runner_up}` : ""}
        </p>
        {roleChip(current.role)}
      </div>
    </div>
  );
}

function Campana({ data }: { data: TeamDossier }) {
  if (!data.matches.length) return <p className="pd-empty">Sin partidos</p>;
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
              {m.motm_name ? ` · ★ ${m.motm_name}` : ""}
            </small>
          </div>
          <div className="side">
            {m.result ? <span className={`pd-chip ${m.result === "W" ? "win" : m.result === "L" ? "loss" : "draw"}`}>{m.result}</span> : null}
          </div>
        </Link>
      ))}
    </div>
  );
}

function Ficha({
  name,
  slug,
  founding,
  dissolved,
  pending,
  msg,
  onName,
  onSlug,
  onFounding,
  onDissolved,
  onSave,
}: {
  name: string;
  slug: string;
  founding: boolean;
  dissolved: boolean;
  pending: boolean;
  msg: string | null;
  onName: (value: string) => void;
  onSlug: (value: string) => void;
  onFounding: (value: boolean) => void;
  onDissolved: (value: boolean) => void;
  onSave: () => void;
}) {
  return (
    <div className="td-form">
      {msg ? <p className="adm-alert">{msg}</p> : null}
      <label>
        Nombre
        <input type="text" value={name} onChange={(event) => onName(event.target.value)} />
      </label>
      <label>
        Slug
        <input type="text" value={slug} onChange={(event) => onSlug(event.target.value)} />
      </label>
      <label className="tm-flag">
        <input type="checkbox" checked={founding} onChange={(event) => onFounding(event.target.checked)} />
        <span className="tm-switch" />
        Fundador
      </label>
      <label className="tm-flag">
        <input type="checkbox" checked={dissolved} onChange={(event) => onDissolved(event.target.checked)} />
        <span className="tm-switch" />
        Disuelto
      </label>
      <button className="adm-btn" type="button" disabled={pending || !name.trim()} onClick={onSave}>
        {pending ? "Guardando" : "Guardar"}
      </button>
    </div>
  );
}
