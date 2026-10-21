"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { savePlayer } from "@/app/admin/actions";
import { getPlayerDossier, savePlayerProfile, uploadPlayerPhoto } from "@/app/admin/player-dossier-action";
import { IconChevL, IconChevR, IconClose, IconCopy, IconPlus } from "@/components/admin/icons";
import type { EventKind, PlayerDossier, PlayerShot } from "@/lib/admin/types";
import "@/app/admin/player-dossier.css";

const TABS = [
  { id: "actual", label: "Actual" },
  { id: "fotos", label: "Fotos" },
  { id: "partidos", label: "Partidos" },
  { id: "disciplina", label: "Disciplina" },
  { id: "club", label: "Club" },
  { id: "ficha", label: "Ficha" },
] as const;

const POSITIONS = ["Arquero", "Defensa", "Mediocampo", "Delantero"];

type Tab = (typeof TABS)[number]["id"];
type Sync = "live" | "idle" | "saving" | "err";

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

function syncLabel(sync: Sync) {
  if (sync === "saving") return "Guardando";
  if (sync === "idle") return "Sin publicar";
  if (sync === "err") return "Reintentar";
  return "En la web";
}

export function PlayerCreateDialog({
  teams,
  onClose,
  onCreated,
}: {
  teams: { id: number; name: string }[];
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [nick, setNick] = useState("");
  const [photo, setPhoto] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (!node.open) node.showModal();
    nameRef.current?.focus();
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    node.addEventListener("cancel", onCancel);
    return () => node.removeEventListener("cancel", onCancel);
  }, [onClose]);

  async function create() {
    if (!name.trim() || !teamId) return;
    setBusy(true);
    setErr(null);
    const res = await savePlayer({ full_name: name.trim(), team_id: Number(teamId) });
    if (!res.ok || !res.data?.id) {
      setBusy(false);
      setErr(res.ok ? "No se pudo crear" : res.error);
      return;
    }
    const id = res.data.id;
    if (nick.trim() || photo.trim()) {
      await savePlayerProfile({
        playerId: id,
        nick: nick.trim(),
        photo: photo.trim() || null,
        photos: photo.trim() ? [{ src: photo.trim(), caption: "" }] : [],
      });
    }
    if (file) {
      const fd = new FormData();
      fd.set("playerId", String(id));
      fd.set("file", file);
      await uploadPlayerPhoto(fd);
    }
    onCreated(id);
  }

  return (
    <dialog
      ref={dialog}
      className="pd-dialog pd-create"
      aria-labelledby="pd-new"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="pd-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <header className="pd-head">
          <h2 id="pd-new">Nuevo jugador</h2>
          <button className="pd-icon" type="button" title="Cerrar" aria-label="Cerrar" onClick={onClose}>
            <IconClose />
          </button>
        </header>
        <div className="pd-body">
          {err ? <p className="adm-alert">{err}</p> : null}
          <label>
            Nombre
            <input ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Equipo
            <select value={teamId} onChange={(event) => setTeamId(event.target.value)} required>
              <option value="">Elegir</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Apodo
            <input value={nick} onChange={(event) => setNick(event.target.value)} />
          </label>
          <label>
            Foto (URL)
            <input type="url" value={photo} onChange={(event) => setPhoto(event.target.value)} placeholder="https://" />
          </label>
          <label className="pd-file">
            {file ? file.name : "Subir imagen"}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        <footer className="pd-dock">
          <button className="pd-create-go" type="submit" disabled={busy || !name.trim() || !teamId}>
            {busy ? "Creando" : "Crear"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

export function PlayerDossierModal({
  playerId,
  listIds,
  onClose,
  onOpen,
  onOpenTeam,
  onSaved,
}: {
  playerId: number;
  listIds: number[];
  onClose: () => void;
  onOpen: (id: number) => void;
  onOpenTeam?: (teamId: number) => void;
  onSaved?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const timer = useRef<number | null>(null);
  const [tab, setTab] = useState<Tab>("actual");
  const [data, setData] = useState<PlayerDossier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState(0);
  const [nick, setNick] = useState("");
  const [bio, setBio] = useState("");
  const [number, setNumber] = useState("");
  const [position, setPosition] = useState("");
  const [photo, setPhoto] = useState("");
  const [photos, setPhotos] = useState<PlayerShot[]>([]);
  const [sync, setSync] = useState<Sync>("live");
  const [err, setErr] = useState<string | null>(null);
  const idx = listIds.indexOf(playerId);
  const prev = idx > 0 ? listIds[idx - 1] : null;
  const next = idx >= 0 && idx < listIds.length - 1 ? listIds[idx + 1] : null;
  const draft = useRef({ playerId, name, teamId, nick, bio, number, position, photo, photos });
  draft.current = { playerId, name, teamId, nick, bio, number, position, photo, photos };

  function apply(dossier: PlayerDossier) {
    setData(dossier);
    setName(dossier.player.full_name);
    setTeamId(dossier.player.team_id);
    setNick(dossier.player.nick);
    setBio(dossier.player.bio);
    setNumber(dossier.player.number);
    setPosition(dossier.player.position);
    setPhoto(dossier.player.photo ?? "");
    setPhotos(dossier.player.photos);
  }

  async function reload(id = playerId) {
    const res = await getPlayerDossier(id);
    if (!res.ok || !res.data) return res;
    apply(res.data);
    return res;
  }

  async function flush() {
    const cur = draft.current;
    if (!cur.name.trim()) return;
    setSync("saving");
    const a = await savePlayer({ id: cur.playerId, full_name: cur.name.trim(), team_id: cur.teamId });
    if (!a.ok) {
      setSync("err");
      setErr(a.error);
      return;
    }
    const b = await savePlayerProfile({
      playerId: cur.playerId,
      nick: cur.nick,
      bio: cur.bio,
      number: cur.number,
      position: cur.position,
      photo: cur.photo.trim() || null,
      photos: cur.photos,
    });
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
      void flush();
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
    setSync("live");
    setErr(null);
    void getPlayerDossier(playerId)
      .then((res) => {
        if (!live) return;
        if (!res.ok || !res.data) {
          setError(res.ok ? "No se pudo cargar" : res.error);
          setData(null);
        } else apply(res.data);
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
  }, [playerId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (timer.current) window.clearTimeout(timer.current);
        void flush();
        return;
      }
      const t = event.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (event.key >= "1" && event.key <= "6") {
        const nextTab = TABS[Number(event.key) - 1];
        if (nextTab) setTab(nextTab.id);
        return;
      }
      if (event.key === "ArrowLeft" && prev) onOpen(prev);
      if (event.key === "ArrowRight" && next) onOpen(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    function onBefore(event: BeforeUnloadEvent) {
      if (sync === "idle" || sync === "saving") {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [sync]);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    function onPaste(event: ClipboardEvent) {
      const files = [...(event.clipboardData?.files ?? [])].filter((item) => item.type.startsWith("image/"));
      if (!files.length || !data) return;
      event.preventDefault();
      setTab("fotos");
      void (async () => {
        for (const item of files.slice(0, 24 - photos.length)) {
          const fd = new FormData();
          fd.set("playerId", String(data.player.id));
          fd.set("file", item);
          await run(() => uploadPlayerPhoto(fd));
        }
      })();
    }
    node.addEventListener("paste", onPaste);
    return () => node.removeEventListener("paste", onPaste);
  });

  const p = data?.player;
  const team = data?.team;
  const st = data?.stats;
  const season = data?.season;
  const portrait = photo || p?.photo || null;

  return (
    <dialog
      ref={dialog}
      className="pd-dialog"
      aria-labelledby="pd-name"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          if (timer.current) window.clearTimeout(timer.current);
          void flush();
          onClose();
        }
      }}
    >
      <div className="pd-shell">
        <header className="pd-head">
          {portrait ? (
            <img
              className="pd-face"
              src={portrait}
              alt=""
              width={56}
              height={56}
              title="Fotos"
              onClick={() => setTab("fotos")}
            />
          ) : team?.logo ? (
            <img className="pd-logo" src={team.logo} alt="" width={56} height={56} />
          ) : (
            <span className="pd-logo" />
          )}
          <div className="pd-id">
            <h2 id="pd-name">
              {number ? <span className="pd-num">{number}</span> : null}
              {name || p?.full_name || "Jugador"}
            </h2>
            <p>
              {nick ? <span className="pd-chip now">{nick}</span> : null}
              {onOpenTeam && team ? (
                <button type="button" className="enlace" onClick={() => onOpenTeam(team.id)}>
                  {team.name}
                </button>
              ) : (
                <span>{team?.name ?? "—"}</span>
              )}
              {position ? <span className="pd-chip">{position}</span> : null}
              {season ? <span className="pd-chip">{season.name}</span> : null}
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
              onClick={() => void navigator.clipboard.writeText(name || p?.full_name || "")}
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
                void flush();
                onClose();
              }}
            >
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
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
              {item.label}
              {item.id === "fotos" ? ` ${photos.length}` : ""}
              {item.id === "partidos" && data ? ` ${data.matches.length}` : ""}
            </button>
          ))}
        </div>

        <div className="pd-body">
          {busy ? <p className="pd-load">Cargando</p> : null}
          {error ? <p className="adm-alert">{error}</p> : null}
          {!busy && data && tab === "actual" ? (
            <Actual
              data={data}
              nick={nick}
              bio={bio}
              number={number}
              position={position}
              photo={photo}
              photos={photos}
              onNick={(value) => {
                setNick(value);
                schedule();
              }}
              onBio={(value) => {
                setBio(value);
                schedule();
              }}
              onNumber={(value) => {
                setNumber(value.replace(/\D/g, "").slice(0, 2));
                schedule();
              }}
              onPosition={(value) => {
                setPosition(value);
                schedule();
              }}
              onPhoto={(value) => {
                setPhoto(value);
                schedule();
              }}
            />
          ) : null}
          {!busy && data && tab === "fotos" ? (
            <Fotos
              photo={photo}
              photos={photos}
              onPhoto={(value) => {
                setPhoto(value);
                schedule();
              }}
              onPhotos={(next) => {
                setPhotos(next);
                schedule();
              }}
              onUpload={(files) =>
                void (async () => {
                  for (const file of files) {
                    const fd = new FormData();
                    fd.set("playerId", String(data.player.id));
                    fd.set("file", file);
                    const ok = await run(() => uploadPlayerPhoto(fd));
                    if (!ok) break;
                  }
                })()
              }
            />
          ) : null}
          {!busy && data && tab === "partidos" ? <Matches data={data} /> : null}
          {!busy && data && tab === "disciplina" ? <Discipline data={data} /> : null}
          {!busy && data && tab === "club" ? <Club data={data} onOpen={onOpen} onOpenTeam={onOpenTeam} /> : null}
          {!busy && data && tab === "ficha" ? (
            <Ficha
              name={name}
              teamId={teamId}
              teams={data.teams}
              onName={(value) => {
                setName(value);
                schedule();
              }}
              onTeam={(value) => {
                setTeamId(value);
                schedule();
              }}
            />
          ) : null}
        </div>

        <footer className="pd-dock">
          <button
            className={`pd-sync ${sync}`}
            type="button"
            title={err ?? syncLabel(sync)}
            onClick={() => {
              if (sync === "err" || sync === "idle") void flush();
            }}
          >
            <i />
            {syncLabel(sync)}
          </button>
          <span className="pd-dock-note">{err ?? "Los cambios salen en el perfil público"}</span>
        </footer>
      </div>
    </dialog>
  );
}

function Actual({
  data,
  nick,
  bio,
  number,
  position,
  photo,
  photos,
  onNick,
  onBio,
  onNumber,
  onPosition,
  onPhoto,
}: {
  data: PlayerDossier;
  nick: string;
  bio: string;
  number: string;
  position: string;
  photo: string;
  photos: PlayerShot[];
  onNick: (value: string) => void;
  onBio: (value: string) => void;
  onNumber: (value: string) => void;
  onPosition: (value: string) => void;
  onPhoto: (value: string) => void;
}) {
  const { stats, season, stints, team } = data;
  const maxG = Math.max(1, ...stats.goals_by_matchday);
  return (
    <div className="pd-grid">
      <section className="pd-card pd-edit">
        <h3>En la web</h3>
        <div className="pd-two-fields">
          <label>
            Apodo
            <input value={nick} maxLength={24} onChange={(event) => onNick(event.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <label>
            Camiseta
            <input value={number} inputMode="numeric" maxLength={2} onChange={(event) => onNumber(event.target.value)} />
          </label>
        </div>
        <div className="pd-pos">
          {POSITIONS.map((item) => (
            <button key={item} type="button" className={position === item ? "on" : ""} onClick={() => onPosition(position === item ? "" : item)}>
              {item}
            </button>
          ))}
        </div>
        <label>
          Texto del perfil
          <textarea rows={3} maxLength={280} value={bio} onChange={(event) => onBio(event.target.value)} />
          <small>{bio.length}/280</small>
        </label>
        {photos.length ? (
          <div className="pd-covers">
            {photos.map((shot) => (
              <button key={shot.src} type="button" className={shot.src === photo ? "on" : ""} title="Perfil" onClick={() => onPhoto(shot.src)}>
                <img src={shot.src} alt="" />
              </button>
            ))}
          </div>
        ) : null}
      </section>
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
      <section className="pd-card" style={{ gridColumn: "1 / -1" }}>
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

function Fotos({
  photo,
  photos,
  onPhoto,
  onPhotos,
  onUpload,
}: {
  photo: string;
  photos: PlayerShot[];
  onPhoto: (value: string) => void;
  onPhotos: (value: PlayerShot[]) => void;
  onUpload: (files: File[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [over, setOver] = useState(false);
  const room = Math.max(0, 24 - photos.length);

  function take(files: FileList | File[] | null) {
    if (!files || !room) return;
    const list = [...files].filter((file) => file.type.startsWith("image/")).slice(0, room);
    if (list.length) onUpload(list);
  }

  function addFromUrl() {
    const src = url.trim();
    if (!src) return;
    if (photos.some((shot) => shot.src === src)) {
      setUrl("");
      return;
    }
    if (!room) return;
    const next = [...photos, { src, caption: caption.trim() }];
    onPhotos(next);
    if (!photo) onPhoto(src);
    setUrl("");
    setCaption("");
  }

  function move(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= photos.length) return;
    const next = photos.slice();
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item);
    onPhotos(next);
  }

  return (
    <div>
      <form
        className="pd-add"
        onSubmit={(event) => {
          event.preventDefault();
          addFromUrl();
        }}
      >
        <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="URL de la foto" aria-label="URL de la foto" />
        <input type="text" value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Pie" aria-label="Pie de foto" maxLength={80} />
        <button type="submit" disabled={!url.trim() || !room}>
          Sumar
        </button>
      </form>
      <label
        className={over ? "pd-drop on" : "pd-drop"}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          take(event.dataTransfer.files);
        }}
      >
        <IconPlus />
        {room ? "Subir o pegar imagen" : "Tope de 24 fotos"}
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={!room}
          onChange={(event) => {
            take(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      {photos.length === 0 && !photo ? (
        <p className="pd-empty">Sin fotos. Pegá una URL, un archivo o una imagen del portapapeles.</p>
      ) : (
        <div className="pd-gal">
          {photos.map((shot, i) => (
            <figure key={`${shot.src}-${i}`} className={shot.src === photo ? "on" : undefined}>
              <img
                src={shot.src}
                alt={shot.caption || ""}
                onError={(event) => {
                  event.currentTarget.style.opacity = "0.25";
                }}
                onClick={() => window.open(shot.src, "_blank", "noopener")}
              />
              {shot.src === photo ? <span className="pd-badge">Perfil</span> : null}
              <figcaption>
                <input
                  type="text"
                  value={shot.caption}
                  placeholder="Pie"
                  maxLength={80}
                  onChange={(event) => {
                    const next = photos.map((row, n) => (n === i ? { ...row, caption: event.target.value } : row));
                    onPhotos(next);
                  }}
                />
                <div className="pd-shot-actions">
                  <button type="button" disabled={i === 0} title="Antes" onClick={() => move(i, -1)}>
                    ←
                  </button>
                  <button type="button" disabled={i === photos.length - 1} title="Después" onClick={() => move(i, 1)}>
                    →
                  </button>
                  <button type="button" disabled={shot.src === photo} onClick={() => onPhoto(shot.src)}>
                    Perfil
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      const next = photos.filter((_, n) => n !== i);
                      onPhotos(next);
                      if (photo === shot.src) onPhoto(next[0]?.src ?? "");
                    }}
                  >
                    Quitar
                  </button>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

function Ficha({
  name,
  teamId,
  teams,
  onName,
  onTeam,
}: {
  name: string;
  teamId: number;
  teams: { id: number; name: string }[];
  onName: (value: string) => void;
  onTeam: (value: number) => void;
}) {
  const current = teams.find((t) => t.id === teamId)?.name ?? "";
  return (
    <div className="pd-edit" style={{ maxWidth: "32rem" }}>
      <label>
        Nombre
        <input value={name} maxLength={48} autoComplete="off" spellCheck={false} onChange={(event) => onName(event.target.value)} />
      </label>
      <label>
        Equipo
        <select value={teamId} onChange={(event) => onTeam(Number(event.target.value))}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <p className="pd-hint">La ficha queda en {current || "el plantel elegido"} y sale en la web al guardar.</p>
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
              {m.is_motm ? " · ★" : ""}
            </small>
          </div>
          <div className="side">
            {m.result ? <span className={`pd-chip ${m.result === "W" ? "win" : m.result === "L" ? "loss" : "draw"}`}>{m.result}</span> : null}
            {m.events.length ? (
              <span className="pd-evs">
                {m.events.map((ev, i) => (
                  <small key={i}>
                    {minute(ev)} {kindLabel(ev.kind, ev.as_assist)}
                  </small>
                ))}
              </span>
            ) : null}
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
                <span>{s.voided ? "Anulada" : s.sanction}</span>
                <span>{s.detail}</span>
                <span>{s.starts_matchday ? `F${s.starts_matchday}` : ""}</span>
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
