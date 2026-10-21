"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { savePlayer, saveTeam } from "@/app/admin/actions";
import {
  deleteTeamMedia,
  getTeamDossier,
  saveTeamCaption,
  saveTeamMedia,
  saveTeamProfile,
  saveTeamTitle,
  setSquadCover,
} from "@/app/admin/team-dossier-action";
import { IconChevL, IconChevR, IconClose, IconCopy } from "@/components/admin/icons";
import type { TeamDossier, TeamDossierPlayer, TeamDossierTitle, TeamMediaShot } from "@/lib/admin/types";
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
type Sync = "live" | "idle" | "saving" | "err";

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

function syncLabel(sync: Sync) {
  if (sync === "saving") return "Guardando";
  if (sync === "idle") return "Sin publicar";
  if (sync === "err") return "Reintentar";
  return "En la web";
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
  const timer = useRef<number | null>(null);
  const slugLocked = useRef(false);
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
  const [shortName, setShortName] = useState("");
  const [bio, setBio] = useState("");
  const [campaign, setCampaign] = useState("");
  const [founding, setFounding] = useState(false);
  const [dissolved, setDissolved] = useState(false);
  const [sync, setSync] = useState<Sync>("live");
  const [err, setErr] = useState<string | null>(null);
  const idx = listIds.indexOf(teamId);
  const prev = idx > 0 ? listIds[idx - 1] : null;
  const next = idx >= 0 && idx < listIds.length - 1 ? listIds[idx + 1] : null;
  const identity = useRef({ teamId, name, slug, shortName, bio, campaign, founding, dissolved });
  identity.current = { teamId, name, slug, shortName, bio, campaign, founding, dissolved };

  async function reload(id = teamId) {
    const res = await getTeamDossier(id);
    if (!res.ok || !res.data) return res;
    const dossier = res.data;
    setData(dossier);
    setName(dossier.team.name);
    setSlug(dossier.team.slug);
    setShortName(dossier.team.short_name ?? "");
    setBio(dossier.team.bio);
    setCampaign(dossier.team.campaign);
    setFounding(dossier.team.is_founding_team);
    setDissolved(dossier.team.is_dissolved);
    slugLocked.current = false;
    const first = dossier.titles.find((row) => row.role === "champion" && (row.photo || row.thumb));
    setTitleId((cur) => cur ?? first?.id ?? dossier.titles[0]?.id ?? null);
    return res;
  }

  async function flushIdentity() {
    const cur = identity.current;
    if (!cur.name.trim()) return;
    setSync("saving");
    const a = await saveTeam({
      id: cur.teamId,
      name: cur.name.trim(),
      slug: cur.slug.trim() || slugify(cur.name),
      short_name: cur.shortName.trim() || cur.name.trim(),
      is_dissolved: cur.dissolved,
      is_founding_team: cur.founding,
    });
    if (!a.ok) {
      setSync("err");
      setErr(a.error);
      return;
    }
    const b = await saveTeamProfile({ teamId: cur.teamId, bio: cur.bio, campaign: cur.campaign });
    if (!b.ok) {
      setSync("err");
      setErr(b.error);
      return;
    }
    setSync("live");
    setErr(null);
    onSaved?.();
  }

  function schedule() {
    setSync("idle");
    setErr(null);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void flushIdentity();
    }, 650);
  }

  async function run(task: () => Promise<{ ok: boolean; error?: string }>) {
    setSync("saving");
    const res = await task();
    if (!res.ok) {
      setSync("err");
      setErr(res.error ?? "No se pudo guardar");
      return false;
    }
    setSync("live");
    setErr(null);
    onSaved?.();
    await reload();
    return true;
  }

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
    setSync("live");
    setErr(null);
    setTitleId(null);
    void getTeamDossier(teamId)
      .then((res) => {
        if (!live) return;
        if (!res.ok || !res.data) {
          setError(res.ok ? "No se pudo cargar" : res.error);
          setData(null);
        } else {
          setData(res.data);
          setName(res.data.team.name);
          setSlug(res.data.team.slug);
          setShortName(res.data.team.short_name ?? "");
          setBio(res.data.team.bio);
          setCampaign(res.data.team.campaign);
          setFounding(res.data.team.is_founding_team);
          setDissolved(res.data.team.is_dissolved);
          slugLocked.current = false;
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
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [teamId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (timer.current) window.clearTimeout(timer.current);
        void flushIdentity();
        return;
      }
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
  });

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
  const selectedTitle = data?.titles.find((row) => row.id === titleId) ?? titlesWithPhoto[0] ?? data?.titles[0] ?? null;
  const t = data?.team;
  const tb = data?.table;
  const cover = t?.squad_photos[0];

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
          {cover ? <img className="td-banner" src={cover.src} alt="" /> : null}
          <header className="td-head">
            {t?.logo ? <img className="td-logo" src={t.logo} alt="" width={72} height={72} /> : <span className="td-logo" />}
            <div className="td-id">
              <h2 id="td-name">{name || t?.name || "Equipo"}</h2>
              <p>
                {tb?.pos ? <span className="pd-chip now">{tb.pos}º</span> : null}
                {data?.season ? <span className="pd-chip">{data.season.name}</span> : null}
                {founding ? <span className="pd-chip">Fundador</span> : null}
                {dissolved ? <span className="pd-chip loss">Disuelto</span> : null}
                {shortName && shortName !== name ? <span className="pd-chip">{shortName}</span> : null}
                {slug ? <span className="pd-chip">{slug}</span> : null}
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
                onClick={() => void navigator.clipboard.writeText(name || t?.name || "")}
              >
                <IconCopy />
              </button>
              <button
                className="pd-icon"
                type="button"
                title="Cerrar"
                aria-label="Cerrar"
                onClick={() => {
                  if (timer.current) window.clearTimeout(timer.current);
                  void flushIdentity();
                  onClose();
                }}
              >
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
              {item.id === "fotos" && data ? ` ${data.team.squad_photos.length}` : ""}
              {item.id === "campeonatos" && data ? ` ${data.club.titles}` : ""}
            </button>
          ))}
        </div>

        <div className="td-body">
          {busy ? <p className="pd-load">Cargando</p> : null}
          {error ? <p className="adm-alert">{error}</p> : null}
          {!busy && data && tab === "actual" ? (
            <Actual
              data={data}
              bio={bio}
              shortName={shortName}
              logoPath={data.team.logo_path ?? ""}
              founding={founding}
              dissolved={dissolved}
              onBio={(value) => {
                setBio(value);
                schedule();
              }}
              onShort={(value) => {
                setShortName(value);
                schedule();
              }}
              onFounding={(value) => {
                setFounding(value);
                schedule();
              }}
              onDissolved={(value) => {
                setDissolved(value);
                schedule();
              }}
              onLogo={(path) =>
                void run(() =>
                  saveTeamMedia({
                    id: data.team.logo_id ?? undefined,
                    team_id: data.team.id,
                    kind: "team_logo",
                    object_path: path,
                  }),
                )
              }
              onCover={(mediaId) => void run(() => setSquadCover({ teamId: data.team.id, mediaId }))}
              onOpenPlayer={onOpenPlayer}
            />
          ) : null}
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
              onRename={(id, full_name) =>
                void run(() => savePlayer({ id, full_name, team_id: data.team.id }))
              }
              onAdd={(full_name) => void run(() => savePlayer({ full_name, team_id: data.team.id }))}
            />
          ) : null}
          {!busy && data && tab === "fotos" ? (
            <Fotos
              data={data}
              onCaption={(id, caption) => void run(() => saveTeamCaption({ id, caption }))}
              onCover={(mediaId) => void run(() => setSquadCover({ teamId: data.team.id, mediaId }))}
              onAdd={(path, caption) =>
                void run(() =>
                  saveTeamMedia({
                    team_id: data.team.id,
                    kind: "squad_photo",
                    object_path: path,
                    caption,
                    cover: data.team.squad_photos.length === 0,
                  }),
                )
              }
              onDelete={(id) => void run(() => deleteTeamMedia({ id }))}
            />
          ) : null}
          {!busy && data && tab === "campeonatos" ? (
            <Campeonatos
              titles={titlesWithPhoto.length ? titlesWithPhoto : data.titles}
              selected={selectedTitle}
              onSelect={setTitleId}
              onSave={(patch) => void run(() => saveTeamTitle({ ...patch, team_id: data.team.id }))}
            />
          ) : null}
          {!busy && data && tab === "campana" ? (
            <Campana
              data={data}
              campaign={campaign}
              onCampaign={(value) => {
                setCampaign(value);
                schedule();
              }}
            />
          ) : null}
          {!busy && data && tab === "ficha" ? (
            <Ficha
              name={name}
              slug={slug}
              shortName={shortName}
              founding={founding}
              dissolved={dissolved}
              onName={(value) => {
                setName(value);
                if (!slugLocked.current) setSlug(slugify(value));
                schedule();
              }}
              onSlug={(value) => {
                slugLocked.current = true;
                setSlug(value);
                schedule();
              }}
              onShort={(value) => {
                setShortName(value);
                schedule();
              }}
              onFounding={(value) => {
                setFounding(value);
                schedule();
              }}
              onDissolved={(value) => {
                setDissolved(value);
                schedule();
              }}
            />
          ) : null}
        </div>

        <footer className="td-dock">
          <button
            className={`td-sync ${sync}`}
            type="button"
            title={err ?? syncLabel(sync)}
            onClick={() => {
              if (sync === "err" || sync === "idle") void flushIdentity();
            }}
          >
            <i />
            {syncLabel(sync)}
          </button>
          <span className="td-dock-note">{err ?? "Los cambios salen en el perfil público"}</span>
        </footer>
      </div>
    </dialog>
  );
}

function Flag({ on, label, onToggle }: { on: boolean; label: string; onToggle: (value: boolean) => void }) {
  return (
    <button className={`td-seg ${on ? "on" : ""}`} type="button" aria-pressed={on} onClick={() => onToggle(!on)}>
      {label}
    </button>
  );
}

function Actual({
  data,
  bio,
  shortName,
  logoPath,
  founding,
  dissolved,
  onBio,
  onShort,
  onFounding,
  onDissolved,
  onLogo,
  onCover,
  onOpenPlayer,
}: {
  data: TeamDossier;
  bio: string;
  shortName: string;
  logoPath: string;
  founding: boolean;
  dissolved: boolean;
  onBio: (value: string) => void;
  onShort: (value: string) => void;
  onFounding: (value: boolean) => void;
  onDissolved: (value: boolean) => void;
  onLogo: (path: string) => void;
  onCover: (mediaId: number) => void;
  onOpenPlayer: (id: number) => void;
}) {
  const [logoDraft, setLogoDraft] = useState(logoPath);
  useEffect(() => {
    setLogoDraft(logoPath);
  }, [logoPath]);
  const played = data.matches.filter((row) => row.result);
  const top = data.roster
    .filter((row) => row.goals > 0)
    .slice()
    .sort((a, b) => b.goals - a.goals || a.full_name.localeCompare(b.full_name, "es"))
    .slice(0, 5);
  return (
    <div className="td-two">
      <section className="pd-card td-edit">
        <h3>En la web</h3>
        <label>
          Nombre corto
          <input type="text" value={shortName} maxLength={24} onChange={(event) => onShort(event.target.value)} />
        </label>
        <label>
          Texto del perfil
          <textarea value={bio} rows={4} maxLength={420} onChange={(event) => onBio(event.target.value)} />
          <small>{bio.length}/420</small>
        </label>
        <label>
          Escudo (URL)
          <input
            type="url"
            value={logoDraft}
            onChange={(event) => setLogoDraft(event.target.value)}
            onBlur={() => {
              if (logoDraft.trim() && logoDraft.trim() !== logoPath) onLogo(logoDraft.trim());
            }}
          />
        </label>
        <div className="td-flags">
          <Flag on={founding} label="Fundador" onToggle={onFounding} />
          <Flag on={dissolved} label="Disuelto" onToggle={onDissolved} />
        </div>
      </section>
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
      <section className="pd-card">
        <h3>Portada</h3>
        {data.team.squad_photos.length === 0 ? (
          <p className="pd-empty">Sin fotos. Cárgalas en Fotos.</p>
        ) : (
          <div className="td-covers">
            {data.team.squad_photos.map((row, i) => (
              <button
                key={row.id}
                type="button"
                className={i === 0 ? "on" : undefined}
                title={i === 0 ? "Portada" : "Usar de portada"}
                onClick={() => onCover(row.id)}
              >
                <img src={row.src} alt="" />
              </button>
            ))}
          </div>
        )}
      </section>
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
  onRename,
  onAdd,
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
  onRename: (id: number, name: string) => void;
  onAdd: (name: string) => void;
}) {
  const [draft, setDraft] = useState("");
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
      <form
        className="td-add"
        onSubmit={(event) => {
          event.preventDefault();
          const value = draft.trim();
          if (!value) return;
          onAdd(value);
          setDraft("");
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Nuevo jugador"
          aria-label="Nuevo jugador"
        />
        <button type="submit" disabled={!draft.trim()}>
          Sumar
        </button>
      </form>
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
              <tr key={row.id}>
                <td className="td-name">
                  <input
                    key={row.full_name}
                    className="td-inline"
                    defaultValue={row.full_name}
                    aria-label={row.full_name}
                    onClick={(event) => event.stopPropagation()}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value && value !== row.full_name) onRename(row.id, value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        (event.target as HTMLInputElement).blur();
                      }
                    }}
                  />
                  <button type="button" className="td-open" title="Ficha" onClick={() => onOpenPlayer(row.id)}>
                    Ficha
                  </button>
                </td>
                <td className="num">{row.matches_played}</td>
                <td className="num">{row.goals}</td>
                <td className="num">{row.yellows}</td>
                <td className="num">{row.reds}</td>
                <td className="num">{row.motm}</td>
                <td>
                  {row.otherClubs.length ? (
                    <div className="td-clubs">
                      {row.otherClubs.map((c) => (
                        <button key={c.player_id} type="button" title={c.team_name} onClick={() => onOpenTeam(c.team_id)}>
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

function ShotCard({
  shot,
  cover,
  onCaption,
  onCover,
  onDelete,
}: {
  shot: TeamMediaShot;
  cover: boolean;
  onCaption: (id: number, caption: string | null) => void;
  onCover: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const [caption, setCaption] = useState(shot.caption ?? "");
  useEffect(() => {
    setCaption(shot.caption ?? "");
  }, [shot.caption, shot.id]);
  return (
    <figure className={cover ? "on" : undefined}>
      <img src={shot.src} alt="" />
      {cover ? <span className="td-badge">Portada</span> : null}
      <figcaption>
        <input
          type="text"
          value={caption}
          placeholder="Pie"
          onChange={(event) => setCaption(event.target.value)}
          onBlur={() => {
            const next = caption.trim() || null;
            if (next !== (shot.caption ?? null)) onCaption(shot.id, next);
          }}
        />
        <div className="td-shot-actions">
          <button type="button" disabled={cover} onClick={() => onCover(shot.id)}>
            Portada
          </button>
          <button
            type="button"
            className="danger"
            title="Quitar"
            onClick={() => {
              if (window.confirm("¿Quitar esta foto?")) onDelete(shot.id);
            }}
          >
            Quitar
          </button>
        </div>
      </figcaption>
    </figure>
  );
}

function Fotos({
  data,
  onCaption,
  onCover,
  onAdd,
  onDelete,
}: {
  data: TeamDossier;
  onCaption: (id: number, caption: string | null) => void;
  onCover: (mediaId: number) => void;
  onAdd: (path: string, caption: string | null) => void;
  onDelete: (id: number) => void;
}) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  return (
    <div>
      <form
        className="td-add"
        onSubmit={(event) => {
          event.preventDefault();
          if (!url.trim()) return;
          onAdd(url.trim(), caption.trim() || null);
          setUrl("");
          setCaption("");
        }}
      >
        <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="URL de la foto" aria-label="URL de la foto" />
        <input type="text" value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Pie" aria-label="Pie de foto" />
        <button type="submit" disabled={!url.trim()}>
          Sumar
        </button>
      </form>
      {data.team.squad_photos.length === 0 ? (
        <p className="pd-empty">Sin fotos de plantel</p>
      ) : (
        <div className="td-gal">
          {data.team.squad_photos.map((row, i) => (
            <ShotCard key={row.id} shot={row} cover={i === 0} onCaption={onCaption} onCover={onCover} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function Campeonatos({
  titles,
  selected,
  onSelect,
  onSave,
}: {
  titles: TeamDossierTitle[];
  selected: TeamDossierTitle | null;
  onSelect: (id: number) => void;
  onSave: (patch: { id: number; venue?: string | null; notes?: string | null; photo_path?: string | null; photo_id?: number | null }) => void;
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
      <TitleEditor key={current.id} current={current} onSave={onSave} />
    </div>
  );
}

function TitleEditor({
  current,
  onSave,
}: {
  current: TeamDossierTitle;
  onSave: (patch: { id: number; venue?: string | null; notes?: string | null; photo_path?: string | null; photo_id?: number | null }) => void;
}) {
  const [venue, setVenue] = useState(current.venue ?? "");
  const [notes, setNotes] = useState(current.notes ?? "");
  const [photo, setPhoto] = useState(current.photo_path ?? "");
  useEffect(() => {
    setVenue(current.venue ?? "");
    setNotes(current.notes ?? "");
    setPhoto(current.photo_path ?? "");
  }, [current]);
  return (
    <div className="td-camp-view">
      {current.photo || current.thumb ? <img src={current.photo || current.thumb || ""} alt="" /> : <p className="pd-empty">Sin foto</p>}
      <h3>{current.label}</h3>
      <p className="pd-empty" style={{ marginTop: 0 }}>
        {current.official_number ? `#${current.official_number} · ` : ""}
        {current.champion ?? ""}
        {current.runner_up ? ` vs ${current.runner_up}` : ""}
      </p>
      {roleChip(current.role)}
      <div className="td-edit" style={{ marginTop: "0.9rem" }}>
        <label>
          Sede
          <input
            type="text"
            value={venue}
            onChange={(event) => setVenue(event.target.value)}
            onBlur={() => {
              if ((venue.trim() || null) !== (current.venue ?? null)) onSave({ id: current.id, venue: venue.trim() || null });
            }}
          />
        </label>
        <label>
          Nota
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => {
              if ((notes.trim() || null) !== (current.notes ?? null)) onSave({ id: current.id, notes: notes.trim() || null });
            }}
          />
        </label>
        <label>
          Foto (URL)
          <input
            type="url"
            value={photo}
            onChange={(event) => setPhoto(event.target.value)}
            onBlur={() => {
              if ((photo.trim() || "") !== (current.photo_path ?? "")) {
                onSave({ id: current.id, photo_path: photo.trim(), photo_id: current.photo_id });
              }
            }}
          />
        </label>
      </div>
    </div>
  );
}

function Campana({ data, campaign, onCampaign }: { data: TeamDossier; campaign: string; onCampaign: (value: string) => void }) {
  return (
    <div>
      <section className="pd-card td-edit" style={{ marginBottom: "0.85rem" }}>
        <h3>Nota de campaña</h3>
        <textarea rows={3} maxLength={280} value={campaign} onChange={(event) => onCampaign(event.target.value)} />
        <small>{campaign.length}/280</small>
      </section>
      {data.matches.length === 0 ? (
        <p className="pd-empty">Sin partidos</p>
      ) : (
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
      )}
    </div>
  );
}

function Ficha({
  name,
  slug,
  shortName,
  founding,
  dissolved,
  onName,
  onSlug,
  onShort,
  onFounding,
  onDissolved,
}: {
  name: string;
  slug: string;
  shortName: string;
  founding: boolean;
  dissolved: boolean;
  onName: (value: string) => void;
  onSlug: (value: string) => void;
  onShort: (value: string) => void;
  onFounding: (value: boolean) => void;
  onDissolved: (value: boolean) => void;
}) {
  return (
    <div className="td-form">
      <label>
        Nombre
        <input type="text" value={name} onChange={(event) => onName(event.target.value)} />
      </label>
      <label>
        Nombre corto
        <input type="text" value={shortName} maxLength={24} onChange={(event) => onShort(event.target.value)} />
      </label>
      <label>
        Slug
        <input type="text" value={slug} onChange={(event) => onSlug(event.target.value)} />
      </label>
      <div className="td-flags">
        <Flag on={founding} label="Fundador" onToggle={onFounding} />
        <Flag on={dissolved} label="Disuelto" onToggle={onDissolved} />
      </div>
    </div>
  );
}
