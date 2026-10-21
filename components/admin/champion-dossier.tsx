"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { saveTournament } from "@/app/admin/actions";
import {
  deleteChampionMedia,
  getChampionDossier,
  saveChampionCaption,
  saveChampionMedia,
  setChampionCover,
  setChampionKind,
  uploadChampionPhoto,
} from "@/app/admin/champion-dossier-action";
import { IconChevL, IconChevR, IconClose, IconPlus } from "@/components/admin/icons";
import { kindLabel, KINDS } from "@/lib/admin/champion-fotos";
import type { ChampionDossier, ChampionKind, ChampionShot, ChampionTeamOpt } from "@/lib/admin/types";
import "@/app/admin/player-dossier.css";
import "@/app/admin/champion-dossier.css";

type Sync = "live" | "idle" | "saving" | "err";
type Tab = "ficha" | "fotos";
type Draft = {
  label: string;
  kind: ChampionKind;
  official_number: number | null;
  champion_team_id: number | null;
  runner_up_team_id: number | null;
  disqualified_team_id: number | null;
  venue: string;
  notes: string;
  runner_up_asterisk: boolean;
  counts_as_final: boolean;
  pitch_result: string;
  unofficial_winner_name: string;
  photo_note: string;
};

const YEAR = new Date().getFullYear();

function syncLabel(sync: Sync) {
  if (sync === "saving") return "Guardando";
  if (sync === "idle") return "Sin publicar";
  if (sync === "err") return "Reintentar";
  return "En la web";
}

function nextNumber(rows: { official_number: number | null }[]) {
  const max = rows.reduce((n, row) => Math.max(n, row.official_number ?? 0), 0);
  return max + 1;
}

function suffixLabel(label: string, tag: "Apertura" | "Clausura") {
  const base = label.replace(/\s+(Apertura|Clausura)$/i, "").trim() || String(YEAR);
  return `${base} ${tag}`;
}

function teamOf(teams: ChampionTeamOpt[], id: number | null) {
  return id ? (teams.find((t) => t.id === id)?.name ?? "") : "";
}

export function ChampionCreateDialog({
  teams,
  tournaments,
  onClose,
  onCreated,
}: {
  teams: ChampionTeamOpt[];
  tournaments: { id: number; official_number: number | null; label: string; venue: string | null; kind: string }[];
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const lastVenue = [...tournaments].reverse().find((row) => row.venue)?.venue ?? "";
  const suggested = nextNumber(tournaments);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<ChampionKind>("oficial");
  const [number, setNumber] = useState(String(suggested));
  const [champ, setChamp] = useState<number | null>(null);
  const [sub, setSub] = useState<number | null>(null);
  const [dq, setDq] = useState<number | null>(null);
  const [venue, setVenue] = useState(lastVenue);
  const [notes, setNotes] = useState("");
  const [asterisk, setAsterisk] = useState(false);
  const [final, setFinal] = useState(true);
  const [empate, setEmpate] = useState(false);
  const [winner, setWinner] = useState("");
  const [photoNote, setPhotoNote] = useState("");
  const [photo, setPhoto] = useState("");
  const [thumb, setThumb] = useState("");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = Boolean(
    label || champ || sub || notes || photo || file || winner || (venue && venue !== lastVenue) || number !== String(suggested),
  );
  const venues = useMemo(
    () => Array.from(new Set(tournaments.map((row) => row.venue).filter((v): v is string => Boolean(v)))),
    [tournaments],
  );
  const usedLabels = useMemo(() => new Set(tournaments.map((row) => row.label.toLowerCase())), [tournaments]);
  const usedNumbers = useMemo(
    () => new Set(tournaments.map((row) => row.official_number).filter((n): n is number => n != null)),
    [tournaments],
  );
  const hasCurrent = tournaments.some((row) => row.kind === "encurso");
  const showNumber = kind === "oficial" || kind === "encurso";
  const showTeams = kind === "oficial";
  const parsedNumber = number.trim() ? Number(number) : null;
  const dupLabel = Boolean(label.trim()) && usedLabels.has(label.trim().toLowerCase());
  const dupNumber = showNumber && parsedNumber != null && usedNumbers.has(parsedNumber);
  const sameTeams = Boolean(champ && sub && champ === sub);
  const needsChamp = kind === "oficial" && !champ;
  const currentBlock = kind === "encurso" && hasCurrent;
  const invalid =
    !label.trim() ||
    dupLabel ||
    dupNumber ||
    sameTeams ||
    needsChamp ||
    currentBlock ||
    (showNumber && parsedNumber != null && (!Number.isFinite(parsedNumber) || parsedNumber < 1));

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (!node.open) node.showModal();
    labelRef.current?.focus();
    const onCancel = (event: Event) => {
      event.preventDefault();
      askClose();
    };
    node.addEventListener("cancel", onCancel);
    return () => node.removeEventListener("cancel", onCancel);
  }, []);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    function onPaste(event: ClipboardEvent) {
      const item = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!item) return;
      event.preventDefault();
      takeFile(item);
    }
    node.addEventListener("paste", onPaste);
    return () => node.removeEventListener("paste", onPaste);
  }, []);

  function askClose() {
    if (dirtyRef.current && !window.confirm("¿Cerrar?")) return;
    onClose();
  }

  function takeFile(next: File | null) {
    if (!next) return;
    if (!next.type.startsWith("image/")) {
      setErr("El archivo no es una imagen");
      return;
    }
    if (next.size > 3_500_000) {
      setErr("La foto pasa de 3,5 MB");
      return;
    }
    setErr(null);
    setFile(next);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(next);
    });
  }

  function applyKind(next: ChampionKind) {
    setKind(next);
    if (next === "oficial") {
      setFinal(true);
      if (!number) setNumber(String(suggested));
    }
    if (next === "encurso") {
      setChamp(null);
      setSub(null);
      setDq(null);
      setFinal(false);
      if (!number) setNumber(String(suggested));
    }
    if (next === "suspendido" || next === "nooficial") {
      setNumber("");
      setChamp(null);
      setSub(null);
      setDq(null);
      setFinal(false);
      setEmpate(false);
    }
  }

  async function create() {
    if (invalid || busy) {
      if (!label.trim()) labelRef.current?.focus();
      return;
    }
    setBusy(true);
    setErr(null);
    const unofficial = kind === "nooficial" ? winner.trim() || teamOf(teams, champ) || null : null;
    const res = await saveTournament({
      official_number: showNumber && parsedNumber ? parsedNumber : null,
      label: label.trim(),
      venue: venue.trim() || null,
      notes: notes.trim() || null,
      kind,
      champion_team_id: showTeams ? champ : null,
      runner_up_team_id: showTeams ? sub : null,
      runner_up_asterisk: showTeams ? asterisk || Boolean(dq && !sub) : false,
      disqualified_team_id: showTeams ? dq : null,
      counts_as_final: kind === "oficial" ? final : false,
      pitch_result: empate ? "empate" : null,
      unofficial_winner_name: unofficial,
      photo_note: photoNote.trim() || caption.trim() || null,
    });
    if (!res.ok || !res.data?.id) {
      setBusy(false);
      setErr(res.ok ? "No se pudo crear" : res.error);
      return;
    }
    const id = res.data.id;
    if (photo.trim()) {
      await saveChampionMedia({
        historical_tournament_id: id,
        kind: "champion_photo",
        object_path: photo.trim(),
        caption: caption.trim() || null,
        cover: true,
      });
    }
    if (thumb.trim()) {
      await saveChampionMedia({
        historical_tournament_id: id,
        kind: "champion_thumb",
        object_path: thumb.trim(),
      });
    }
    if (file) {
      const fd = new FormData();
      fd.set("tournamentId", String(id));
      fd.set("file", file);
      fd.set("caption", caption.trim());
      await uploadChampionPhoto(fd);
    }
    onCreated(id);
  }

  return (
    <dialog
      ref={dialog}
      className="pd-dialog pd-create ch-create"
      aria-labelledby="ch-new"
      aria-describedby={err ? "ch-err" : undefined}
      onClick={(event) => {
        if (event.target === event.currentTarget) askClose();
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
          <h2 id="ch-new">Nuevo campeón</h2>
          <button className="pd-icon" type="button" title="Cerrar" aria-label="Cerrar" onClick={askClose}>
            <IconClose />
          </button>
        </header>
        <div className="pd-body">
          {err ? (
            <p id="ch-err" className="adm-alert" role="alert">
              {err}
            </p>
          ) : null}
          <div role="radiogroup" aria-label="Tipo" className="ch-kinds">
            {KINDS.map((item, index) => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={kind === item}
                className={kind === item ? "on" : undefined}
                onClick={() => applyKind(item)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                    event.preventDefault();
                    applyKind(KINDS[(index + 1) % KINDS.length]);
                  }
                  if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                    event.preventDefault();
                    applyKind(KINDS[(index + KINDS.length - 1) % KINDS.length]);
                  }
                }}
              >
                {kindLabel(item)}
              </button>
            ))}
          </div>
          {currentBlock ? <p className="ch-err">Ya hay un torneo en curso</p> : null}
          <div className="ch-grid">
            <label>
              Torneo
              <input
                ref={labelRef}
                value={label}
                maxLength={64}
                autoComplete="off"
                spellCheck={false}
                required
                aria-invalid={dupLabel}
                aria-describedby={dupLabel ? "ch-dup-label" : undefined}
                placeholder={`${YEAR}`}
                onChange={(event) => setLabel(event.target.value)}
              />
              <span className="ch-chips">
                <button type="button" title="Año" onClick={() => setLabel(String(YEAR))}>
                  {YEAR}
                </button>
                <button type="button" title="Apertura" onClick={() => setLabel(suffixLabel(label, "Apertura"))}>
                  Apertura
                </button>
                <button type="button" title="Clausura" onClick={() => setLabel(suffixLabel(label, "Clausura"))}>
                  Clausura
                </button>
              </span>
              {dupLabel ? (
                <span id="ch-dup-label" className="ch-err">
                  Esa etiqueta ya existe
                </span>
              ) : null}
            </label>
            {showNumber ? (
              <label>
                Nº oficial
                <input
                  type="number"
                  min={1}
                  max={999}
                  inputMode="numeric"
                  value={number}
                  aria-invalid={dupNumber}
                  aria-describedby={dupNumber ? "ch-dup-n" : undefined}
                  onChange={(event) => setNumber(event.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                />
                {dupNumber ? (
                  <span id="ch-dup-n" className="ch-err">
                    El nº {number} ya está usado
                  </span>
                ) : (
                  <span className="pd-hint">Siguiente: {suggested}</span>
                )}
              </label>
            ) : (
              <label>
                Nº oficial
                <input value="—" disabled />
              </label>
            )}
          </div>
          {showTeams ? (
            <>
              <div className="ch-grid">
                <TeamPicker
                  id="ch-champ"
                  label="Campeón"
                  teams={teams}
                  value={champ}
                  required
                  invalid={needsChamp || sameTeams}
                  onChange={setChamp}
                />
                <TeamPicker
                  id="ch-sub"
                  label="Subcampeón"
                  teams={teams}
                  value={sub}
                  invalid={sameTeams}
                  onChange={setSub}
                />
              </div>
              {sameTeams ? <p className="ch-err">Campeón y subcampeón no pueden ser el mismo</p> : null}
              <TeamPicker id="ch-dq" label="Descalificado" teams={teams} value={dq} onChange={(id) => {
                setDq(id);
                if (id && !sub) setAsterisk(true);
              }} />
            </>
          ) : null}
          {kind === "nooficial" ? (
            <div className="ch-grid">
              <label>
                Ganador
                <input value={winner} maxLength={48} onChange={(event) => setWinner(event.target.value)} />
              </label>
              <TeamPicker id="ch-win" label="Equipo" teams={teams} value={champ} onChange={(id) => {
                setChamp(id);
                if (id && !winner.trim()) setWinner(teamOf(teams, id));
              }} />
            </div>
          ) : null}
          <label>
            Sede
            <input
              value={venue}
              maxLength={80}
              list="ch-venues"
              onChange={(event) => setVenue(event.target.value)}
            />
            <datalist id="ch-venues">
              {venues.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>
          <label>
            Notas
            <textarea
              rows={3}
              maxLength={400}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <small>{notes.length}/400</small>
          </label>
          {showTeams ? (
            <div className="ch-flags">
              <label>
                <input type="checkbox" checked={asterisk} onChange={(event) => setAsterisk(event.target.checked)} />
                Sub *
              </label>
              <label>
                <input type="checkbox" checked={final} onChange={(event) => setFinal(event.target.checked)} />
                Final
              </label>
              <label>
                <input type="checkbox" checked={empate} onChange={(event) => setEmpate(event.target.checked)} />
                Empate
              </label>
            </div>
          ) : null}
          <label>
            Foto (URL)
            <input type="url" value={photo} placeholder="https://" onChange={(event) => setPhoto(event.target.value)} />
          </label>
          <label>
            Miniatura (URL)
            <input type="url" value={thumb} placeholder="https://" onChange={(event) => setThumb(event.target.value)} />
          </label>
          <label>
            Pie
            <input value={caption} maxLength={80} onChange={(event) => setCaption(event.target.value)} />
          </label>
          <label>
            Nota de foto
            <input value={photoNote} maxLength={80} onChange={(event) => setPhotoNote(event.target.value)} />
          </label>
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
              takeFile(event.dataTransfer.files[0] ?? null);
            }}
          >
            <IconPlus />
            Subir o pegar imagen
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                takeFile(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
          </label>
          {preview || photo ? (
            <div className="ch-preview">
              <img src={preview || photo} alt="" />
              <div>
                <b>{file?.name || "URL"}</b>
                <button
                  type="button"
                  title="Quitar"
                  onClick={() => {
                    setFile(null);
                    setPhoto("");
                    if (preview) URL.revokeObjectURL(preview);
                    setPreview(null);
                  }}
                >
                  Quitar
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <footer className="pd-dock">
          <button className="pd-create-go" type="submit" disabled={busy || invalid}>
            {busy ? "Creando" : "Crear"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

export function ChampionDossierModal({
  tournamentId,
  listIds,
  onClose,
  onOpen,
  onSaved,
}: {
  tournamentId: number;
  listIds: number[];
  onClose: () => void;
  onOpen: (id: number) => void;
  onSaved?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const timer = useRef<number | null>(null);
  const [tab, setTab] = useState<Tab>("ficha");
  const [data, setData] = useState<ChampionDossier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sync, setSync] = useState<Sync>("live");
  const [err, setErr] = useState<string | null>(null);
  const live = useRef<{ id: number; draft: Draft } | null>(null);
  live.current = data && draft ? { id: data.tournament.id, draft } : null;
  const idx = listIds.indexOf(tournamentId);
  const prev = idx > 0 ? listIds[idx - 1] : null;
  const next = idx >= 0 && idx < listIds.length - 1 ? listIds[idx + 1] : null;

  function fromDossier(dossier: ChampionDossier): Draft {
    const t = dossier.tournament;
    return {
      label: t.label,
      kind: t.kind,
      official_number: t.official_number,
      champion_team_id: t.champion_team_id,
      runner_up_team_id: t.runner_up_team_id,
      disqualified_team_id: t.disqualified_team_id,
      venue: t.venue ?? "",
      notes: t.notes ?? "",
      runner_up_asterisk: t.runner_up_asterisk,
      counts_as_final: t.counts_as_final,
      pitch_result: t.pitch_result ?? "",
      unofficial_winner_name: t.unofficial_winner_name ?? "",
      photo_note: t.photo_note ?? "",
    };
  }

  async function reload(id = tournamentId) {
    const res = await getChampionDossier(id);
    if (!res.ok || !res.data) return res;
    setData(res.data);
    setDraft(fromDossier(res.data));
    return res;
  }

  async function flush() {
    const cur = live.current;
    if (!cur) return;
    setSync("saving");
    const res = await saveTournament({
      id: cur.id,
      official_number: cur.draft.official_number,
      label: cur.draft.label,
      venue: cur.draft.venue || null,
      notes: cur.draft.notes || null,
      kind: cur.draft.kind,
      champion_team_id: cur.draft.champion_team_id,
      runner_up_team_id: cur.draft.runner_up_team_id,
      runner_up_asterisk: cur.draft.runner_up_asterisk,
      disqualified_team_id: cur.draft.disqualified_team_id,
      counts_as_final: cur.draft.counts_as_final,
      pitch_result: cur.draft.pitch_result || null,
      unofficial_winner_name: cur.draft.unofficial_winner_name || null,
      photo_note: cur.draft.photo_note || null,
    });
    if (!res.ok) {
      setSync("err");
      setErr(res.error);
      return;
    }
    setSync("live");
    setErr(null);
    onSaved?.();
  }

  function schedule(patch: Partial<Draft>) {
    setDraft((cur) => (cur ? { ...cur, ...patch } : cur));
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
      if (timer.current) window.clearTimeout(timer.current);
      void flush();
      onClose();
    };
    node.addEventListener("cancel", onCancel);
    return () => node.removeEventListener("cancel", onCancel);
  }, [onClose]);

  useEffect(() => {
    let on = true;
    setBusy(true);
    setError(null);
    setTab("ficha");
    setSync("live");
    setErr(null);
    void getChampionDossier(tournamentId).then((res) => {
      if (!on) return;
      if (!res.ok || !res.data) {
        setError(res.ok ? "No se pudo cargar" : res.error);
        setData(null);
        setDraft(null);
      } else {
        setData(res.data);
        setDraft(fromDossier(res.data));
      }
      setBusy(false);
    });
    return () => {
      on = false;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [tournamentId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const t = event.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (event.key === "1") setTab("ficha");
      if (event.key === "2") setTab("fotos");
      if (event.key === "ArrowLeft" && prev) onOpen(prev);
      if (event.key === "ArrowRight" && next) onOpen(next);
    }
    window.addEventListener("keydown", onKey as unknown as EventListener);
    return () => window.removeEventListener("keydown", onKey as unknown as EventListener);
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
    if (!node || !data) return;
    function onPaste(event: ClipboardEvent) {
      const files = [...(event.clipboardData?.files ?? [])].filter((item) => item.type.startsWith("image/"));
      if (!files.length || !data) return;
      event.preventDefault();
      setTab("fotos");
      void (async () => {
        for (const item of files.slice(0, 12)) {
          const fd = new FormData();
          fd.set("tournamentId", String(data.tournament.id));
          fd.set("file", item);
          await run(() => uploadChampionPhoto(fd));
        }
      })();
    }
    node.addEventListener("paste", onPaste);
    return () => node.removeEventListener("paste", onPaste);
  });

  const t = data?.tournament;
  const cover = data?.photos.find((row) => row.kind === "champion_photo" && row.sort_key === "0") ?? data?.photos.find((row) => row.kind === "champion_photo") ?? data?.photos[0];

  return (
    <dialog
      ref={dialog}
      className="pd-dialog"
      aria-labelledby="ch-name"
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
          {cover ? <img className="ch-face" src={cover.src} alt="" width={56} height={40} onClick={() => setTab("fotos")} /> : <span className="ch-face" />}
          <div className="pd-id">
            <h2 id="ch-name">{draft?.label || t?.label || "Campeonato"}</h2>
            <p>
              {draft ? kindLabel(draft.kind) : ""}
              {draft?.official_number ? ` · Nº ${draft.official_number}` : ""}
              {draft?.champion_team_id ? ` · ${teamOf(data?.teams ?? [], draft.champion_team_id)}` : ""}
            </p>
          </div>
          <div className="pd-tools">
            <button className="pd-icon" type="button" title="Anterior" aria-label="Anterior" disabled={prev == null} onClick={() => prev && onOpen(prev)}>
              <IconChevL />
            </button>
            <button className="pd-icon" type="button" title="Siguiente" aria-label="Siguiente" disabled={next == null} onClick={() => next && onOpen(next)}>
              <IconChevR />
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
        <div className="pd-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "ficha"} onClick={() => setTab("ficha")}>
            Ficha
          </button>
          <button type="button" role="tab" aria-selected={tab === "fotos"} onClick={() => setTab("fotos")}>
            Fotos
          </button>
        </div>
        <div className="pd-body">
          {busy ? <p className="pd-empty">Cargando</p> : null}
          {error ? <p className="adm-alert">{error}</p> : null}
          {!busy && data && draft && tab === "ficha" ? (
            <Ficha data={data} draft={draft} onPatch={schedule} />
          ) : null}
          {!busy && data && tab === "fotos" ? (
            <Fotos
              data={data}
              photoNote={draft?.photo_note ?? ""}
              onNote={(value) => schedule({ photo_note: value })}
              onCaption={(id, caption) => void run(() => saveChampionCaption({ id, caption }))}
              onCover={(mediaId) => void run(() => setChampionCover({ tournamentId: data.tournament.id, mediaId }))}
              onKind={(id, kind) => void run(() => setChampionKind({ id, kind }))}
              onDelete={(id) => {
                if (window.confirm("¿Quitar?")) void run(() => deleteChampionMedia({ id }));
              }}
              onAdd={(path, caption, kind) =>
                void run(() =>
                  saveChampionMedia({
                    historical_tournament_id: data.tournament.id,
                    kind,
                    object_path: path,
                    caption,
                    cover: kind === "champion_photo",
                  }),
                )
              }
              onUpload={(files, thumb) =>
                void (async () => {
                  for (const file of files) {
                    const fd = new FormData();
                    fd.set("tournamentId", String(data.tournament.id));
                    fd.set("file", file);
                    if (thumb) fd.set("thumb", "1");
                    const ok = await run(() => uploadChampionPhoto(fd));
                    if (!ok) break;
                  }
                })()
              }
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
          {err ? <span className="pd-dock-note">{err}</span> : null}
        </footer>
      </div>
    </dialog>
  );
}

function Ficha({
  data,
  draft,
  onPatch,
}: {
  data: ChampionDossier;
  draft: Draft;
  onPatch: (patch: Partial<Draft>) => void;
}) {
  const showNumber = draft.kind === "oficial" || draft.kind === "encurso";
  const showTeams = draft.kind === "oficial";
  const dupLabel = data.usedLabels.some((item) => item.toLowerCase() === draft.label.trim().toLowerCase());
  const dupNumber =
    showNumber && draft.official_number != null && data.usedNumbers.includes(draft.official_number);
  const currentBlock = draft.kind === "encurso" && data.currentId != null && data.currentId !== data.tournament.id;
  const same = Boolean(draft.champion_team_id && draft.champion_team_id === draft.runner_up_team_id);
  return (
    <div className="pd-edit">
      <div role="radiogroup" aria-label="Tipo" className="ch-kinds">
        {KINDS.map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={draft.kind === item}
            className={draft.kind === item ? "on" : undefined}
            onClick={() =>
              onPatch({
                kind: item,
                counts_as_final: item === "oficial",
                official_number: item === "suspendido" || item === "nooficial" ? null : draft.official_number,
              })
            }
          >
            {kindLabel(item)}
          </button>
        ))}
      </div>
      {currentBlock ? <p className="ch-err">Ya hay un torneo en curso</p> : null}
      <div className="ch-grid">
        <label>
          Torneo
          <input
            value={draft.label}
            maxLength={64}
            aria-invalid={dupLabel}
            onChange={(event) => onPatch({ label: event.target.value })}
          />
          {dupLabel ? <span className="ch-err">Esa etiqueta ya existe</span> : null}
        </label>
        {showNumber ? (
          <label>
            Nº oficial
            <input
              type="number"
              min={1}
              max={999}
              value={draft.official_number ?? ""}
              aria-invalid={dupNumber}
              onChange={(event) =>
                onPatch({ official_number: event.target.value ? Number(event.target.value) : null })
              }
            />
            {dupNumber ? <span className="ch-err">Nº usado</span> : null}
          </label>
        ) : null}
      </div>
      {showTeams ? (
        <>
          <div className="ch-grid">
            <TeamPicker
              id="ed-champ"
              label="Campeón"
              teams={data.teams}
              value={draft.champion_team_id}
              onChange={(id) => onPatch({ champion_team_id: id })}
            />
            <TeamPicker
              id="ed-sub"
              label="Subcampeón"
              teams={data.teams}
              value={draft.runner_up_team_id}
              onChange={(id) => onPatch({ runner_up_team_id: id })}
            />
          </div>
          {same ? <p className="ch-err">Campeón y subcampeón no pueden ser el mismo</p> : null}
          <TeamPicker
            id="ed-dq"
            label="Descalificado"
            teams={data.teams}
            value={draft.disqualified_team_id}
            onChange={(id) => onPatch({ disqualified_team_id: id, runner_up_asterisk: Boolean(id) || draft.runner_up_asterisk })}
          />
        </>
      ) : null}
      {draft.kind === "nooficial" ? (
        <label>
          Ganador
          <input
            value={draft.unofficial_winner_name}
            maxLength={48}
            onChange={(event) => onPatch({ unofficial_winner_name: event.target.value })}
          />
        </label>
      ) : null}
      <label>
        Sede
        <input
          value={draft.venue}
          maxLength={80}
          list="ed-venues"
          onChange={(event) => onPatch({ venue: event.target.value })}
        />
        <datalist id="ed-venues">
          {data.venues.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </label>
      <label>
        Notas
        <textarea rows={4} maxLength={400} value={draft.notes} onChange={(event) => onPatch({ notes: event.target.value })} />
        <small>{draft.notes.length}/400</small>
      </label>
      {showTeams ? (
        <div className="ch-flags">
          <label>
            <input
              type="checkbox"
              checked={draft.runner_up_asterisk}
              onChange={(event) => onPatch({ runner_up_asterisk: event.target.checked })}
            />
            Sub *
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.counts_as_final}
              onChange={(event) => onPatch({ counts_as_final: event.target.checked })}
            />
            Final
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.pitch_result === "empate"}
              onChange={(event) => onPatch({ pitch_result: event.target.checked ? "empate" : "" })}
            />
            Empate
          </label>
        </div>
      ) : null}
    </div>
  );
}

function Fotos({
  data,
  photoNote,
  onNote,
  onCaption,
  onCover,
  onKind,
  onDelete,
  onAdd,
  onUpload,
}: {
  data: ChampionDossier;
  photoNote: string;
  onNote: (value: string) => void;
  onCaption: (id: number, caption: string | null) => void;
  onCover: (mediaId: number) => void;
  onKind: (id: number, kind: "champion_photo" | "champion_thumb") => void;
  onDelete: (id: number) => void;
  onAdd: (path: string, caption: string | null, kind: "champion_photo" | "champion_thumb") => void;
  onUpload: (files: File[], thumb: boolean) => void;
}) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [over, setOver] = useState(false);
  const [asThumb, setAsThumb] = useState(false);
  const coverId = data.photos.find((row) => row.kind === "champion_photo" && row.sort_key === "0")?.id ?? data.photos.find((row) => row.kind === "champion_photo")?.id;
  return (
    <div>
      <label>
        Nota de foto
        <input value={photoNote} maxLength={80} onChange={(event) => onNote(event.target.value)} />
      </label>
      <form
        className="pd-add"
        style={{ marginTop: "0.75rem" }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!url.trim()) return;
          onAdd(url.trim(), caption.trim() || null, asThumb ? "champion_thumb" : "champion_photo");
          setUrl("");
          setCaption("");
        }}
      >
        <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="URL de la foto" aria-label="URL de la foto" />
        <input type="text" value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Pie" aria-label="Pie" maxLength={80} />
        <label className="ch-flags" style={{ margin: 0 }}>
          <input type="checkbox" checked={asThumb} onChange={(event) => setAsThumb(event.target.checked)} />
          Mini
        </label>
        <button type="submit" disabled={!url.trim()}>
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
          onUpload([...event.dataTransfer.files].filter((item) => item.type.startsWith("image/")), asThumb);
        }}
      >
        <IconPlus />
        Subir o pegar imagen
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            onUpload([...(event.target.files ?? [])], asThumb);
            event.target.value = "";
          }}
        />
      </label>
      {data.photos.length === 0 ? (
        <p className="pd-empty">Sin fotos</p>
      ) : (
        <div className="pd-gal ch-gal">
          {data.photos.map((shot) => (
            <ShotCard key={shot.id} shot={shot} cover={shot.id === coverId} onCaption={onCaption} onCover={onCover} onKind={onKind} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShotCard({
  shot,
  cover,
  onCaption,
  onCover,
  onKind,
  onDelete,
}: {
  shot: ChampionShot;
  cover: boolean;
  onCaption: (id: number, caption: string | null) => void;
  onCover: (mediaId: number) => void;
  onKind: (id: number, kind: "champion_photo" | "champion_thumb") => void;
  onDelete: (id: number) => void;
}) {
  const [caption, setCaption] = useState(shot.caption ?? "");
  useEffect(() => {
    setCaption(shot.caption ?? "");
  }, [shot.caption, shot.id]);
  return (
    <figure className={cover ? "on" : undefined}>
      <img
        src={shot.src}
        alt={shot.caption || ""}
        onError={(event) => {
          event.currentTarget.style.opacity = "0.25";
        }}
        onClick={() => window.open(shot.src, "_blank", "noopener")}
      />
      {cover ? <span className="pd-badge">Foto</span> : null}
      {shot.kind === "champion_thumb" ? <span className="pd-badge">Mini</span> : null}
      <figcaption>
        <input
          type="text"
          value={caption}
          placeholder="Pie"
          maxLength={80}
          onChange={(event) => setCaption(event.target.value)}
          onBlur={() => {
            const next = caption.trim() || null;
            if (next !== (shot.caption ?? null)) onCaption(shot.id, next);
          }}
        />
        <div className="pd-shot-actions">
          <button type="button" disabled={cover || shot.kind === "champion_thumb"} title="Foto" onClick={() => onCover(shot.id)}>
            Foto
          </button>
          <button
            type="button"
            title={shot.kind === "champion_thumb" ? "Pasar a foto" : "Mini"}
            onClick={() => onKind(shot.id, shot.kind === "champion_thumb" ? "champion_photo" : "champion_thumb")}
          >
            {shot.kind === "champion_thumb" ? "Foto" : "Mini"}
          </button>
          <button type="button" className="danger" title="Quitar" onClick={() => onDelete(shot.id)}>
            Quitar
          </button>
        </div>
      </figcaption>
    </figure>
  );
}

function TeamPicker({
  id,
  label,
  teams,
  value,
  onChange,
  required,
  invalid,
}: {
  id: string;
  label: string;
  teams: ChampionTeamOpt[];
  value: number | null;
  onChange: (id: number | null) => void;
  required?: boolean;
  invalid?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const selected = teams.find((t) => t.id === value);
  const filtered = teams.filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase()));
  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  function pick(idValue: number | null) {
    onChange(idValue);
    setQ("");
    setOpen(false);
  }
  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHi((n) => Math.min(n + 1, Math.max(filtered.length - 1, 0)));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHi((n) => Math.max(n - 1, 0));
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      const hit = filtered[hi];
      if (hit) pick(hit.id);
    }
  }
  return (
    <label>
      {label}
      <div className="ch-pick" ref={box}>
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-invalid={invalid}
          aria-required={required}
          value={open ? q : selected?.name ?? ""}
          placeholder="Buscar"
          autoComplete="off"
          onFocus={() => {
            setOpen(true);
            setQ("");
            setHi(0);
          }}
          onChange={(event) => {
            setQ(event.target.value);
            setOpen(true);
            setHi(0);
          }}
          onKeyDown={onKey}
        />
        {value != null ? (
          <button className="ch-pick-clear" type="button" title="Quitar" aria-label="Quitar" onClick={() => pick(null)}>
            ×
          </button>
        ) : null}
        {open ? (
          <ul className="ch-menu" id={`${id}-list`} role="listbox">
            {filtered.length === 0 ? (
              <li>
                <button type="button" disabled>
                  Sin equipos
                </button>
              </li>
            ) : (
              filtered.map((t, i) => (
                <li key={t.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={t.id === value}
                    className={`${i === hi ? "on" : ""}${t.is_dissolved ? " dim" : ""}`}
                    onMouseEnter={() => setHi(i)}
                    onClick={() => pick(t.id)}
                  >
                    <span>{t.name}</span>
                    {t.is_dissolved ? <small>Disuelto</small> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </label>
  );
}
