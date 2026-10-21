"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { deleteSanction, getSanctionsInbox, saveSanction, saveSiteContent, syncSanctionCalendar } from "@/app/admin/actions";
import { IconChevL, IconClose, IconEdit } from "@/components/admin/icons";
import { useAdminData } from "@/components/admin/store";
import {
  TEMPLATES,
  calendarState,
  durationLabel,
  formatDia,
  hydrateSanction,
  kindLabel,
  parseDuration,
  weekdayShort,
  type SanctionKind,
  type SanctionRow,
  type SanctionView,
} from "@/lib/admin/sanctions";
import "@/app/admin/sanctions-desk.css";

type Tab = "now" | "hist" | "inbox";
type InboxItem = {
  key: string;
  player_id: number;
  player_name: string;
  team_name: string;
  kind: "red" | "second_yellow" | "yellow_accum";
  matchday: number;
  detail: string;
};

const DRAFT = "lifexi-sanciones-draft";
const TAB_KEY = "lifexi-sanciones-tab";

function loadDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT) || "null");
  } catch {
    return null;
  }
}

export function SanctionsDesk() {
  const { data, loading, error, reload, openPlayer } = useAdminData();
  const [tab, setTab] = useState<Tab>("now");
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("all");
  const [kindF, setKindF] = useState("all");
  const [fecha, setFecha] = useState("all");
  const [player, setPlayer] = useState("");
  const [pq, setPq] = useState("");
  const [kind, setKind] = useState<SanctionKind>("yellow_accum");
  const [duration, setDuration] = useState(1);
  const [origin, setOrigin] = useState("");
  const [starts, setStarts] = useState("");
  const [detail, setDetail] = useState("Acumulación de amarillas");
  const [sanction, setSanction] = useState("1 fecha");
  const [note, setNote] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [pending, start] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = sessionStorage.getItem(TAB_KEY);
    if (t === "now" || t === "hist" || t === "inbox") setTab(t);
    const d = loadDraft();
    if (d) {
      setPlayer(String(d.player ?? ""));
      setKind(d.kind ?? "yellow_accum");
      setDuration(d.duration ?? 1);
      setDetail(d.detail ?? "");
      setNote(d.note ?? "");
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    sessionStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  useEffect(() => {
    sessionStorage.setItem(DRAFT, JSON.stringify({ player, kind, duration, detail, note }));
  }, [player, kind, duration, detail, note]);

  useEffect(() => {
    void (async () => {
      await syncSanctionCalendar();
      await reload();
    })();
  }, []);

  useEffect(() => {
    void getSanctionsInbox().then((res) => {
      if (res.ok && res.data) setInbox(res.data as InboxItem[]);
    });
  }, [data?.sanctions]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (event.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "n" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        event.preventDefault();
        setTab("now");
        setEditId(null);
      }
      if (event.key === "Escape") clearForm();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const matchdays = (data?.matchdays ?? []) as { number: number; played_on: string | null }[];
  const cal = useMemo(() => calendarState(matchdays), [matchdays, tick]);
  const fallbackStart = cal.next?.number ?? cal.lastClosed + 1;

  const views = useMemo(() => {
    if (!data) return [];
    return (data.sanctions as SanctionRow[]).map((row) => hydrateSanction(row, cal, data.teams, fallbackStart));
  }, [data, cal, fallbackStart]);

  const active = views.filter((v) => v.active);
  const hist = views.filter((v) => !v.active);
  const ids = (tab === "hist" ? hist : active).map((v) => v.playerId);

  const filtered = useMemo(() => {
    const src = tab === "hist" ? hist : active;
    const needle = q.trim().toLowerCase();
    return src.filter((v) => {
      if (team !== "all" && String(v.teamId) !== team) return false;
      if (kindF !== "all" && v.kind !== kindF) return false;
      if (fecha !== "all") {
        const n = Number(fecha);
        if (tab === "hist") {
          if (!v.window.includes(n) && v.origin !== n) return false;
        } else if (!v.window.includes(n) && v.starts !== n) return false;
      }
      if (needle && !`${v.playerName} ${v.teamName} ${v.detail} ${v.sanction}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [tab, hist, active, team, kindF, fecha, q]);

  const grouped = useMemo(() => {
    const map = new Map<number, SanctionView[]>();
    for (const v of filtered) {
      const key = tab === "hist" ? v.origin : v.starts;
      const list = map.get(key) ?? [];
      list.push(v);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [filtered, tab]);

  const picks = useMemo(() => {
    if (!data) return [];
    const needle = pq.trim().toLowerCase();
    return data.players
      .filter((p) => !needle || p.full_name.toLowerCase().includes(needle) || data.teams.find((t) => t.id === p.team_id)?.name.toLowerCase().includes(needle))
      .slice(0, 12);
  }, [data, pq]);

  const contents = (data?.content ?? []) as { id: number; slug: string; title: string | null; body: string | null; is_visible: boolean }[];
  const noteRow = contents.find((c) => c.slug === "sanctions_note");

  if (loading) return <p className="adm-load">Cargando sanciones…</p>;
  if (error || !data) return <p className="adm-alert">{error ?? "Sin datos"}</p>;

  const thisSunday = active.filter((v) => v.servingToday || (cal.next && v.window.includes(cal.next.number))).length;
  const previewEnds = (Number(starts) || fallbackStart) + duration - 1;
  const selectedPlayer = data.players.find((p) => String(p.id) === player);

  function applyTemplate(t: (typeof TEMPLATES)[number]) {
    setKind(t.kind);
    setDuration(t.duration);
    setDetail(t.detail);
    setSanction(durationLabel(t.duration));
  }

  function fillFrom(v: SanctionView) {
    setEditId(v.id);
    setPlayer(String(v.playerId));
    setPq(v.playerName);
    setKind(v.kind);
    setDuration(v.duration);
    setOrigin(String(v.origin));
    setStarts(String(v.starts));
    setDetail(v.detail);
    setSanction(v.sanction);
    setNote(v.note);
    setTab("now");
  }

  function clearForm() {
    setEditId(null);
    setPlayer("");
    setPq("");
    setNote("");
    setMsg(null);
  }

  function publish() {
    if (!player) {
      setMsg("Elegí un jugador");
      return;
    }
    start(async () => {
      const res = await saveSanction({
        id: editId ?? undefined,
        player_id: Number(player),
        detail: detail.trim() || kindLabel(kind),
        sanction: sanction.trim() || durationLabel(duration),
        kind,
        duration,
        origin_matchday: Number(origin) || cal.lastClosed || 1,
        starts_matchday: Number(starts) || fallbackStart,
        note: note.trim() || null,
      });
      if (!res.ok) setMsg(res.error);
      else {
        setMsg(null);
        clearForm();
        sessionStorage.removeItem(DRAFT);
        void reload();
        void getSanctionsInbox().then((r) => r.ok && setInbox((r.data as InboxItem[]) ?? []));
      }
    });
  }

  function anular(id: number) {
    start(async () => {
      const res = await saveSanction({ id, voided: true, player_id: views.find((v) => v.id === id)?.playerId ?? 0, detail: views.find((v) => v.id === id)?.detail ?? "", sanction: views.find((v) => v.id === id)?.sanction ?? "" });
      if (!res.ok) setMsg(res.error);
      else {
        setToast({ id, text: "Anulada" });
        window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 5000);
        void reload();
      }
    });
  }

  function restaurar(id: number) {
    start(async () => {
      const v = views.find((x) => x.id === id);
      await saveSanction({ id, voided: false, player_id: v?.playerId ?? 0, detail: v?.detail ?? "", sanction: v?.sanction ?? "" });
      setToast(null);
      void reload();
    });
  }

  function quitar(id: number) {
    if (!window.confirm("Borrar del registro")) return;
    start(async () => {
      await deleteSanction(id);
      void reload();
    });
  }

  return (
    <div className="sn">
      <div className="sn-top">
        <div>
          <h1>Sanciones</h1>
          <p>
            {cal.todayMd
              ? `Hoy fecha ${cal.todayMd.number}`
              : cal.next
                ? `Próximo domingo: fecha ${cal.next.number}${cal.next.played_on ? ` · ${weekdayShort(cal.next.played_on)} ${formatDia(cal.next.played_on)}` : ""}`
                : "Calendario al día"}
            {cal.lastClosed ? ` · cerrada ${cal.lastClosed}` : ""}
          </p>
        </div>
        <span className="sn-sync">
          <i />
          En la web
        </span>
      </div>

      <div className="sn-kpis">
        <div className="adm-kpi">
          <span>Vigentes</span>
          <b>{active.length}</b>
        </div>
        <div className="adm-kpi">
          <span>Este domingo</span>
          <b>{thisSunday}</b>
        </div>
        <div className="adm-kpi">
          <span>Histórico</span>
          <b>{hist.length}</b>
        </div>
        <div className="adm-kpi">
          <span>Bandeja</span>
          <b>{inbox.length}</b>
        </div>
      </div>

      <div className="sn-cal" role="listbox" aria-label="Fechas">
        {matchdays
          .slice()
          .sort((a, b) => a.number - b.number)
          .map((md) => {
            const closed = cal.closedNumbers.has(md.number);
            const isToday = cal.todayMd?.number === md.number;
            const isNext = cal.next?.number === md.number;
            return (
              <button
                key={md.number}
                type="button"
                className={`sn-chip${fecha === String(md.number) ? " on" : ""}${closed ? " closed" : ""}${isToday ? " today" : ""}${isNext ? " next" : ""}`}
                title={`Fecha ${md.number}`}
                aria-label={`Fecha ${md.number}`}
                onClick={() => {
                  setFecha((cur) => (cur === String(md.number) ? "all" : String(md.number)));
                  setTab("hist");
                }}
              >
                <b>{md.number}</b>
                <small>{isToday ? "hoy" : closed ? "ok" : weekdayShort(md.played_on) || "—"}</small>
              </button>
            );
          })}
      </div>

      <div className="sn-tabs" role="tablist">
        {(
          [
            ["now", "Ahora", active.length],
            ["hist", "Histórico", hist.length],
            ["inbox", "Bandeja", inbox.length],
          ] as const
        ).map(([id, label, n]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
            <b>{n}</b>
          </button>
        ))}
      </div>

      {tab !== "inbox" ? (
        <div className="sn-tools">
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar" />
          <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Equipo">
            <option value="all">Equipos</option>
            {data.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select value={kindF} onChange={(e) => setKindF(e.target.value)} aria-label="Tipo">
            <option value="all">Tipo</option>
            <option value="yellow_accum">Acumulación</option>
            <option value="second_yellow">Doble TA</option>
            <option value="red">Roja</option>
            <option value="other">Otra</option>
          </select>
          {fecha !== "all" ? (
            <button className="adm-btn ghost" type="button" onClick={() => setFecha("all")} title="Limpiar" aria-label="Limpiar">
              Fecha {fecha}
              <IconClose />
            </button>
          ) : null}
        </div>
      ) : null}

      {msg ? (
        <p className="adm-alert sn-alert" role="alert">
          {msg}
        </p>
      ) : null}

      <div className="sn-layout">
        <section className="adm-card">
          {tab === "inbox" ? (
            <div className="sn-inbox">
              {inbox.length === 0 ? <p className="sn-empty">Nada pendiente de publicar</p> : null}
              {inbox.map((item) => (
                <div className="sn-row" key={item.key}>
                  <div className="sn-id">
                    <strong>{item.player_name}</strong>
                    <span>
                      {item.team_name} · fecha {item.matchday} · {item.detail}
                    </span>
                  </div>
                  <div className="sn-meta">
                    <span className="adm-pill">{kindLabel(item.kind)}</span>
                    <button
                      className="adm-btn"
                      type="button"
                      onClick={() => {
                        setTab("now");
                        setPlayer(String(item.player_id));
                        setPq(item.player_name);
                        setKind(item.kind);
                        setDuration(item.kind === "yellow_accum" ? 1 : 1);
                        setDetail(item.detail);
                        setSanction("1 fecha");
                        setOrigin(String(item.matchday));
                        setStarts(String(item.matchday + 1));
                      }}
                    >
                      Cargar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="sn-empty">{tab === "hist" ? "Sin histórico con ese filtro" : "Nadie cumple este domingo"}</p>
          ) : (
            <div className="sn-list">
              {grouped.map(([n, rows]) => (
                <div key={n}>
                  <p className="sn-group">{tab === "hist" ? `Origen fecha ${n}` : `Cumple desde ${n}`}</p>
                  {rows.map((v) => (
                    <article
                      key={v.id}
                      className={`sn-row${selected === v.id ? " on" : ""}${v.voided ? " voided" : ""}`}
                      tabIndex={0}
                      onClick={() => {
                        setSelected(v.id);
                        if (v.playerId) openPlayer(v.playerId, ids);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelected(v.id);
                          if (v.playerId) openPlayer(v.playerId, ids);
                        }
                      }}
                    >
                      <div className="sn-id">
                        <strong>{v.playerName}</strong>
                        <span>
                          {v.teamName} · {v.detail}
                        </span>
                      </div>
                      <div className="sn-meta">
                        <span className={`adm-pill${v.lastSunday ? " live" : ""}`}>
                          {v.voided ? "Anulada" : v.active ? `${v.remaining} por cumplir` : "Cumplida"}
                        </span>
                        <span className="adm-pill">{kindLabel(v.kind)}</span>
                        <span className="sn-ticks" title={`${v.starts}–${v.ends}`}>
                          {v.window.map((n) => (
                            <i key={n} className={cal.closedNumbers.has(n) ? "done" : n === cal.next?.number || n === cal.todayMd?.number ? "now" : ""} />
                          ))}
                        </span>
                        <div className="sn-actions" onClick={(event) => event.stopPropagation()}>
                          <button className="adm-iconbtn" type="button" title="Editar" aria-label="Editar" onClick={() => fillFrom(v)}>
                            <IconEdit />
                          </button>
                          {v.voided ? (
                            <button className="adm-iconbtn" type="button" title="Restaurar" aria-label="Restaurar" onClick={() => restaurar(v.id)}>
                              <IconChevL />
                            </button>
                          ) : (
                            <button className="adm-iconbtn" type="button" title="Anular" aria-label="Anular" onClick={() => anular(v.id)}>
                              <IconClose />
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="adm-card sn-form">
          <h2>{editId ? "Editar" : "Nueva"}</h2>
          <div className="sn-temps">
            {TEMPLATES.map((t) => (
              <button key={t.label} type="button" className={kind === t.kind && duration === t.duration ? "on" : ""} onClick={() => applyTemplate(t)}>
                {t.label}
              </button>
            ))}
          </div>
          <label>
            Jugador
            <input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Nombre o club" aria-label="Buscar jugador" />
          </label>
          <div className="sn-pick">
            {picks.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`adm-btn ghost${player === String(p.id) ? " on" : ""}`}
                onClick={() => {
                  setPlayer(String(p.id));
                  setPq(p.full_name);
                }}
              >
                {p.full_name}
                <span style={{ color: "var(--muted)", marginLeft: "0.4rem" }}>{data.teams.find((t) => t.id === p.team_id)?.name}</span>
              </button>
            ))}
          </div>
          <div className="sn-kinds">
            {(["yellow_accum", "second_yellow", "red", "other"] as const).map((k) => (
              <button key={k} type="button" className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
                {kindLabel(k)}
              </button>
            ))}
          </div>
          <div className="sn-step">
            <button className="adm-iconbtn" type="button" title="Menos" aria-label="Menos" onClick={() => { const n = Math.max(1, duration - 1); setDuration(n); setSanction(durationLabel(n)); }}>
              −
            </button>
            <b>{duration}</b>
            <button className="adm-iconbtn" type="button" title="Más" aria-label="Más" onClick={() => { const n = Math.min(16, duration + 1); setDuration(n); setSanction(durationLabel(n)); }}>
              +
            </button>
            <span>{durationLabel(duration)}</span>
          </div>
          <div className="adm-form two">
            <label>
              Origen
              <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
                <option value="">{cal.lastClosed ? `Fecha ${cal.lastClosed}` : "—"}</option>
                {matchdays.map((md) => (
                  <option key={md.number} value={md.number}>
                    Fecha {md.number}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Desde
              <select value={starts} onChange={(e) => setStarts(e.target.value)}>
                <option value="">{`Fecha ${fallbackStart}`}</option>
                {matchdays.map((md) => (
                  <option key={md.number} value={md.number}>
                    Fecha {md.number}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Detalle
              <input value={detail} onChange={(e) => setDetail(e.target.value)} />
            </label>
            <label>
              Texto
              <input value={sanction} onChange={(e) => { setSanction(e.target.value); setDuration(parseDuration(e.target.value)); }} />
            </label>
            <label>
              Nota
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
          <p className="sn-preview">
            {selectedPlayer ? <strong>{selectedPlayer.full_name}</strong> : "Sin jugador"}
            {` · cumple ${durationLabel(duration)} · fechas ${Number(starts) || fallbackStart}–${previewEnds}`}
          </p>
          <div className="adm-actions">
            <button className="adm-btn" type="button" disabled={pending} onClick={publish}>
              {editId ? "Guardar" : "Publicar"}
            </button>
            {editId ? (
              <button className="adm-btn ghost" type="button" onClick={clearForm}>
                Cancelar
              </button>
            ) : null}
            {editId ? (
              <button className="adm-btn ghost" type="button" onClick={() => quitar(editId)}>
                Borrar
              </button>
            ) : null}
          </div>
          {noteRow ? (
            <label>
              Nota web
              <input
                defaultValue={noteRow.body ?? ""}
                onBlur={(e) => {
                  const body = e.target.value;
                  if (body === (noteRow.body ?? "")) return;
                  start(async () => {
                    await saveSiteContent({
                      id: noteRow.id,
                      title: noteRow.title,
                      body,
                      is_visible: noteRow.is_visible,
                    });
                    void reload();
                  });
                }}
              />
            </label>
          ) : null}
        </aside>
      </div>

      {toast ? (
        <div className="sn-toast">
          <span>{toast.text}</span>
          <button className="adm-btn ghost" type="button" onClick={() => restaurar(toast.id)}>
            Deshacer
          </button>
        </div>
      ) : null}
    </div>
  );
}
