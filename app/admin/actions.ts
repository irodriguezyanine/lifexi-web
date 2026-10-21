"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  ADMIN_COOKIE,
  encodeSession,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicSrc } from "@/lib/media";
import type { EventKind } from "@/lib/admin/types";
import {
  applyLedger,
  calendarState,
  inferKind,
  parseDuration,
  readLedger,
  type SanctionLedger,
  type SanctionRow,
} from "@/lib/admin/sanctions";

const INITIAL_USER = "A";
const INITIAL_PASS = "a";

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

async function actor() {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}

function touchPublic() {
  revalidatePath("/");
  revalidatePath("/api/public/liga");
}

async function upsertSanctionLedger(
  sb: ReturnType<typeof createAdminClient>,
  id: number,
  patch: SanctionLedger[string],
) {
  const { data } = await sb.from("site_content").select("id, extra, body").eq("slug", "sanctions_ledger").maybeSingle();
  const ledger = readLedger(data?.extra, data?.body);
  ledger[String(id)] = { ...ledger[String(id)], ...patch };
  const extra = ledger;
  const body = JSON.stringify(ledger);
  if (data?.id) {
    await sb.from("site_content").update({ extra, body, updated_at: new Date().toISOString() }).eq("id", data.id);
    return;
  }
  await sb.from("site_content").insert({
    slug: "sanctions_ledger",
    area: "admin",
    title: "Sanciones",
    body,
    is_visible: false,
    sort_order: 980,
    extra,
  });
}

async function log(
  who: string,
  action: string,
  entity: string,
  entityId?: string | number,
  summary?: string,
  before?: unknown,
  after?: unknown,
) {
  const sb = createAdminClient();
  await sb.from("audit_log").insert({
    actor: who,
    action,
    entity,
    entity_id: entityId == null ? null : String(entityId),
    summary: summary ?? null,
    before: before ?? null,
    after: after ?? null,
  });
}

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");
  const dest = next.startsWith("/admin") ? next : "/admin";

  if (!username || !password) {
    return { error: "1" };
  }

  const sb = createAdminClient();
  const { data: existing } = await sb
    .from("admin_users")
    .select("username, password_hash")
    .eq("username", username)
    .maybeSingle();

  let valid = false;
  if (existing) {
    valid = verifyPassword(password, existing.password_hash);
  } else if (username === INITIAL_USER && password === INITIAL_PASS) {
    const { error } = await sb.from("admin_users").insert({
      username: INITIAL_USER,
      password_hash: hashPassword(INITIAL_PASS),
      display_name: "Administración LIFEXI",
    });
    valid = !error;
  }

  if (!valid) return { error: "1" };

  await sb
    .from("admin_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("username", username);

  (await cookies()).set(ADMIN_COOKIE, encodeSession(username), sessionCookieOptions());
  redirect(dest);
}

export async function logoutAction(formData?: FormData) {
  (await cookies()).set(ADMIN_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  redirect(formData?.get("to") === "public" ? "/" : "/login");
}

export async function getOverview(): Promise<ActionResult> {
  const who = await actor();
  if (!who) return fail("Sesión vencida");
  const sb = createAdminClient();

  const [
    matches,
    standings,
    pending,
    content,
    players,
    teams,
    sanctions,
    audit,
  ] = await Promise.all([
    sb.from("v_match_calendar").select("*").order("matchday_number").order("sort_order"),
    sb.rpc("season_standings", {
      p_season_id: 1,
      p_through: 16,
    }),
    sb
      .from("v_match_calendar")
      .select("*")
      .in("status", ["pending", "scheduled"])
      .order("matchday_number")
      .order("sort_order"),
    sb.from("site_content").select("*").order("sort_order"),
    sb.from("players").select("*", { count: "exact", head: true }),
    sb.from("teams").select("*", { count: "exact", head: true }),
    sb.from("published_sanctions").select("*", { count: "exact", head: true }),
    sb.from("audit_log").select("*").order("created_at", { ascending: false }).limit(12),
  ]);

  const list = matches.data ?? [];
  const played = list.filter((m) => m.status === "played");
  const goals = played.reduce((s, m) => s + (m.home_goals ?? 0) + (m.away_goals ?? 0), 0);

  return {
    ok: true,
    data: {
      actor: who,
      matches: list,
      standings: standings.data ?? [],
      inbox: pending.data ?? [],
      content: content.data ?? [],
      counts: {
        players: players.count ?? 0,
        teams: teams.count ?? 0,
        sanctions: sanctions.count ?? 0,
        played: played.length,
        open: (pending.data ?? []).length,
        goals,
      },
      audit: audit.data ?? [],
    },
  };
}

export async function getMatchWorkspace(matchId: number): Promise<ActionResult> {
  const who = await actor();
  if (!who) return fail("Sesión vencida");
  const sb = createAdminClient();

  const { data: match, error } = await sb
    .from("matches")
    .select("*, matchdays(number, played_on, round_number, league_site_number)")
    .eq("id", matchId)
    .single();
  if (error || !match) return fail(error?.message ?? "Partido no encontrado");

  const [{ data: homeTeam }, { data: awayTeam }] = await Promise.all([
    sb.from("teams").select("id, name, slug").eq("id", match.home_team_id).single(),
    sb.from("teams").select("id, name, slug").eq("id", match.away_team_id).single(),
  ]);
  match.home = homeTeam;
  match.away = awayTeam;

  const [events, appearances, homePlayers, awayPlayers, seasonPlayers, logos] = await Promise.all([
    sb.from("match_events").select("*").eq("match_id", matchId).order("sort_order").order("id"),
    sb.from("match_appearances").select("*").eq("match_id", matchId),
    sb.from("players").select("id, full_name, team_id, source_index").eq("team_id", match.home_team_id).order("full_name"),
    sb.from("players").select("id, full_name, team_id, source_index").eq("team_id", match.away_team_id).order("full_name"),
    sb.from("players").select("id, full_name, team_id, source_index").eq("season_id", match.season_id),
    sb
      .from("media")
      .select("team_id, object_path")
      .eq("kind", "team_logo")
      .in("team_id", [match.home_team_id, match.away_team_id]),
  ]);

  const logoOf = (teamId: number) =>
    publicSrc(logos.data?.find((row) => row.team_id === teamId)?.object_path ?? null);

  return {
    ok: true,
    data: {
      match: {
        ...match,
        home_logo: logoOf(match.home_team_id),
        away_logo: logoOf(match.away_team_id),
      },
      events: events.data ?? [],
      appearances: appearances.data ?? [],
      homePlayers: homePlayers.data ?? [],
      awayPlayers: awayPlayers.data ?? [],
      seasonPlayers: seasonPlayers.data ?? [],
    },
  };
}

type SaveMatchInput = {
  matchId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  status: "played" | "scheduled" | "pending";
  kickoffTime: string | null;
  pitch: string | null;
  notes: string | null;
  referee: string | null;
  walkover: string | null;
  motmPlayerId: number | null;
  lineup: { playerId: number; teamId: number; isHome: boolean }[];
  events: {
    kind: EventKind;
    teamId: number;
    playerId: number | null;
    assistPlayerId: number | null;
    minute: number | null;
    extraMinute: number | null;
    notes: string | null;
  }[];
  replaceEvents: boolean;
};

function statsFromEvents(events: SaveMatchInput["events"], playerId: number) {
  const mine = events.filter((e) => e.playerId === playerId);
  let goals = 0;
  let own = 0;
  let yellows = 0;
  let reds = 0;
  for (const e of mine) {
    if (e.kind === "goal" || e.kind === "penalty") goals += 1;
    if (e.kind === "own_goal") own += 1;
    if (e.kind === "yellow") yellows += 1;
    if (e.kind === "second_yellow") {
      yellows += 2;
      reds += 1;
    }
    if (e.kind === "red") reds += 1;
  }
  return { goals, own_goals: own, yellows, reds };
}

export async function saveMatchDesk(input: SaveMatchInput): Promise<ActionResult> {
  const who = await actor();
  if (!who) return fail("Sesión vencida");
  const sb = createAdminClient();

  const { data: current, error: curErr } = await sb
    .from("matches")
    .select("*")
    .eq("id", input.matchId)
    .single();
  if (curErr || !current) return fail(curErr?.message ?? "Partido no encontrado");

  if (input.status === "played" && (input.homeGoals == null || input.awayGoals == null)) {
    return fail("El partido jugado necesita marcador");
  }

  const patch = {
    home_goals: input.status === "played" ? input.homeGoals : null,
    away_goals: input.status === "played" ? input.awayGoals : null,
    status: input.status,
    kickoff_time: input.kickoffTime,
    pitch: input.pitch,
    notes: input.notes,
    referee: input.referee,
    walkover: input.walkover === "none" ? null : input.walkover,
    motm_player_id: input.motmPlayerId,
    updated_at: new Date().toISOString(),
  };

  const { error: upErr } = await sb.from("matches").update(patch).eq("id", input.matchId);
  if (upErr) return fail(upErr.message);

  const lineup = [...input.lineup];
  if (input.replaceEvents) {
    for (const event of input.events) {
      if (!event.playerId) continue;
      if (!lineup.some((l) => l.playerId === event.playerId)) {
        lineup.push({
          playerId: event.playerId,
          teamId: event.teamId,
          isHome: event.teamId === current.home_team_id,
        });
      }
    }
  }

  if (input.replaceEvents) {
    await sb.from("match_events").delete().eq("match_id", input.matchId);
    if (input.events.length) {
      const { error: evErr } = await sb.from("match_events").insert(
        input.events.map((event, sort_order) => ({
          match_id: input.matchId,
          team_id: event.teamId,
          player_id: event.playerId,
          kind: event.kind,
          minute: event.minute,
          extra_minute: event.extraMinute,
          assist_player_id: event.assistPlayerId,
          notes: event.notes,
          sort_order,
        })),
      );
      if (evErr) return fail(evErr.message);
    }
  }

  if (lineup.length) {
    await sb.from("match_appearances").delete().eq("match_id", input.matchId);
    const rows = lineup.map((row) => {
      const stats = input.replaceEvents
        ? statsFromEvents(input.events, row.playerId)
        : { goals: 0, own_goals: 0, yellows: 0, reds: 0 };
      return {
        match_id: input.matchId,
        player_id: row.playerId,
        team_id: row.teamId,
        is_home: row.isHome,
        goals: stats.goals,
        own_goals: stats.own_goals,
        yellows: stats.yellows,
        reds: stats.reds,
        is_motm: row.playerId === input.motmPlayerId,
      };
    });
    const { error: apErr } = await sb.from("match_appearances").insert(rows);
    if (apErr) return fail(apErr.message);
  } else if (input.motmPlayerId) {
    await sb.from("match_appearances").update({ is_motm: false }).eq("match_id", input.matchId);
    await sb
      .from("match_appearances")
      .update({ is_motm: true })
      .eq("match_id", input.matchId)
      .eq("player_id", input.motmPlayerId);
  }

  await log(
    who,
    "save_match",
    "matches",
    input.matchId,
    `${current.source_key} ${input.status} ${input.homeGoals ?? "-"}-${input.awayGoals ?? "-"}`,
    current,
    patch,
  );
  revalidatePath("/admin");
  revalidatePath("/admin/partidos");
  revalidatePath(`/admin/partidos/${input.matchId}`);
  touchPublic();
  return { ok: true };
}

export async function saveTeam(input: {
  id?: number;
  name: string;
  slug: string;
  short_name?: string | null;
  is_dissolved: boolean;
  is_founding_team: boolean;
}): Promise<ActionResult<{ id: number }>> {
  const who = await actor();
  if (!who) return fail("Sesión vencida");
  const sb = createAdminClient();
  const shortName = input.short_name !== undefined ? input.short_name?.trim() || input.name.trim() : undefined;
  if (input.id) {
    const { error } = await sb
      .from("teams")
      .update({
        name: input.name.trim(),
        slug: input.slug.trim(),
        is_dissolved: input.is_dissolved,
        is_founding_team: input.is_founding_team,
        ...(shortName !== undefined ? { short_name: shortName } : {}),
      })
      .eq("id", input.id);
    if (error) return fail(error.message);
    await log(who, "update", "teams", input.id, input.name);
    touchPublic();
    return { ok: true, data: { id: input.id } };
  }
  const { data: league } = await sb.from("leagues").select("id").limit(1).single();
  const { data, error } = await sb
    .from("teams")
    .insert({
      league_id: league?.id,
      name: input.name.trim(),
      slug: input.slug.trim(),
      short_name: input.name.trim(),
      is_dissolved: input.is_dissolved,
      is_founding_team: input.is_founding_team,
    })
    .select("id")
    .single();
  if (error || !data) return fail(error?.message ?? "No se pudo crear");
  const { data: season } = await sb.from("seasons").select("id").limit(1).single();
  if (season) {
    const { data: last } = await sb
      .from("season_teams")
      .select("source_index")
      .eq("season_id", season.id)
      .order("source_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    await sb.from("season_teams").insert({
      season_id: season.id,
      team_id: data.id,
      source_index: (last?.source_index ?? -1) + 1,
    });
  }
  await log(who, "create", "teams", data.id, input.name);
  touchPublic();
  return { ok: true, data: { id: data.id } };
}

export async function savePlayer(input: {
  id?: number;
  full_name: string;
  team_id: number;
}): Promise<ActionResult<{ id: number }>> {
  const who = await actor();
  if (!who) return fail("Sesión vencida");
  const sb = createAdminClient();
  if (input.id) {
    const { error } = await sb
      .from("players")
      .update({ full_name: input.full_name.trim(), team_id: input.team_id })
      .eq("id", input.id);
    if (error) return fail(error.message);
    await log(who, "update", "players", input.id, input.full_name);
    touchPublic();
    return { ok: true, data: { id: input.id } };
  }
  const { data: season } = await sb.from("seasons").select("id").limit(1).single();
  const { data: last } = await sb
    .from("players")
    .select("source_index")
    .eq("season_id", season?.id)
    .order("source_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await sb
    .from("players")
    .insert({
      season_id: season?.id,
      team_id: input.team_id,
      full_name: input.full_name.trim(),
      source_index: (last?.source_index ?? -1) + 1,
    })
    .select("id")
    .single();
  if (error || !data) return fail(error?.message ?? "No se pudo crear");
  await log(who, "create", "players", data.id, input.full_name);
  touchPublic();
  return { ok: true, data: { id: data.id } };
}

export async function saveMatchday(input: {
  id?: number;
  number: number;
  played_on: string | null;
  league_site_number: number | null;
  round_number: number;
}): Promise<ActionResult<{ id: number }>> {
  const who = await actor();
  if (!who) return fail("Sesión vencida");
  const sb = createAdminClient();
  if (input.id) {
    const { error } = await sb
      .from("matchdays")
      .update({
        number: input.number,
        played_on: input.played_on,
        league_site_number: input.league_site_number,
        round_number: input.round_number,
      })
      .eq("id", input.id);
    if (error) return fail(error.message);
    await log(who, "update", "matchdays", input.id, `Fecha ${input.number}`);
    touchPublic();
    return { ok: true, data: { id: input.id } };
  }
  const { data: season } = await sb.from("seasons").select("id").limit(1).single();
  const { data, error } = await sb
    .from("matchdays")
    .insert({
      season_id: season?.id,
      number: input.number,
      played_on: input.played_on,
      league_site_number: input.league_site_number ?? input.number,
      round_number: input.round_number,
    })
    .select("id")
    .single();
  if (error || !data) return fail(error?.message ?? "No se pudo crear");
  await log(who, "create", "matchdays", data.id, `Fecha ${input.number}`);
  touchPublic();
  return { ok: true, data: { id: data.id } };
}

export async function addFixture(input: {
  matchdayId: number;
  homeTeamId: number;
  awayTeamId: number;
  kickoffTime: string | null;
  pitch: string | null;
}): Promise<ActionResult<{ id: number }>> {
  const who = await actor();
  if (!who) return fail("Sesión vencida");
  if (input.homeTeamId === input.awayTeamId) return fail("Local y visita deben ser distintos");
  const sb = createAdminClient();
  const { data: md } = await sb.from("matchdays").select("id, number, season_id").eq("id", input.matchdayId).single();
  if (!md) return fail("Fecha no encontrada");
  const { data: last } = await sb
    .from("matches")
    .select("sort_order")
    .eq("matchday_id", input.matchdayId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const homeIdx = await sourceIndex(sb, md.season_id, input.homeTeamId);
  const awayIdx = await sourceIndex(sb, md.season_id, input.awayTeamId);
  const source_key = `${md.number}:${homeIdx}:${awayIdx}`;
  const { data, error } = await sb
    .from("matches")
    .insert({
      season_id: md.season_id,
      matchday_id: input.matchdayId,
      sort_order: (last?.sort_order ?? -1) + 1,
      kickoff_time: input.kickoffTime,
      pitch: input.pitch,
      home_team_id: input.homeTeamId,
      away_team_id: input.awayTeamId,
      status: "scheduled",
      source_key,
    })
    .select("id")
    .single();
  if (error || !data) return fail(error?.message ?? "No se pudo crear el partido");
  await log(who, "create", "matches", data.id, source_key);
  touchPublic();
  return { ok: true, data: { id: data.id } };
}

async function sourceIndex(
  sb: ReturnType<typeof createAdminClient>,
  seasonId: number,
  teamId: number,
) {
  const { data } = await sb
    .from("season_teams")
    .select("source_index")
    .eq("season_id", seasonId)
    .eq("team_id", teamId)
    .maybeSingle();
  return data?.source_index ?? teamId;
}

export async function saveSanction(input: {
  id?: number;
  player_id: number;
  detail: string;
  sanction: string;
  kind?: string;
  duration?: number;
  origin_matchday?: number;
  starts_matchday?: number;
  note?: string | null;
  voided?: boolean;
}): Promise<ActionResult> {
  const who = await actor();
  if (!who) return fail("Sesión vencida");
  const sb = createAdminClient();
  const extra: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.kind) extra.kind = input.kind;
  if (input.duration != null) extra.duration = Math.max(1, Math.min(16, Number(input.duration) || 1));
  if (input.origin_matchday != null) extra.origin_matchday = input.origin_matchday;
  if (input.starts_matchday != null) extra.starts_matchday = input.starts_matchday;
  if (input.note !== undefined) extra.note = input.note;
  if (input.voided !== undefined) extra.voided = Boolean(input.voided);
  if (!input.id) extra.issued_on = new Date().toISOString().slice(0, 10);
  const base = { player_id: input.player_id, detail: input.detail, sanction: input.sanction };
  if (input.id) {
    const full = { ...base, ...extra };
    let { error } = await sb.from("published_sanctions").update(full).eq("id", input.id);
    if (error && /column|schema cache/i.test(error.message)) {
      ({ error } = await sb.from("published_sanctions").update(base).eq("id", input.id));
    }
    if (error) return fail(error.message);
    await upsertSanctionLedger(sb, input.id, {
      kind: (input.kind as SanctionLedger[string]["kind"]) ?? inferKind(input.detail),
      duration: input.duration != null ? Math.max(1, Math.min(16, Number(input.duration) || 1)) : undefined,
      origin_matchday: input.origin_matchday,
      starts_matchday: input.starts_matchday,
      note: input.note,
      voided: input.voided,
    });
    await log(who, "update", "published_sanctions", input.id, input.detail);
    touchPublic();
    return { ok: true };
  }
  const { data: season } = await sb.from("seasons").select("id").limit(1).single();
  const { data: last } = await sb
    .from("published_sanctions")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const insertFull = {
    ...base,
    ...extra,
    season_id: season?.id,
    sort_order: (last?.sort_order ?? -1) + 1,
  };
  let created: { id: number } | null = null;
  let ins = await sb.from("published_sanctions").insert(insertFull).select("id").maybeSingle();
  if (ins.error && /column|schema cache/i.test(ins.error.message)) {
    ins = await sb.from("published_sanctions").insert({
      ...base,
      season_id: season?.id,
      sort_order: (last?.sort_order ?? -1) + 1,
    }).select("id").maybeSingle();
  }
  if (ins.error) return fail(ins.error.message);
  created = ins.data;
  const rowId = input.id ?? created?.id;
  if (rowId) {
    await upsertSanctionLedger(sb, rowId, {
      kind: (input.kind as SanctionLedger[string]["kind"]) ?? inferKind(input.detail),
      duration: input.duration != null ? Math.max(1, Math.min(16, Number(input.duration) || 1)) : undefined,
      origin_matchday: input.origin_matchday,
      starts_matchday: input.starts_matchday,
      note: input.note,
      voided: input.voided,
    });
  }
  await log(who, "create", "published_sanctions", rowId, input.detail);
  touchPublic();
  return { ok: true, data: { id: rowId } };
}

export async function getSanctionsInbox(): Promise<ActionResult> {
  const who = await actor();
  if (!who) return fail("Sesión vencida");
  const sb = createAdminClient();
  const [eventsRes, appsRes, sanctionsRes, playersRes, teamsRes, matchesRes, daysRes, statsRes] = await Promise.all([
    sb.from("match_events").select("id, kind, player_id, match_id").in("kind", ["red", "second_yellow"]),
    sb.from("match_appearances").select("player_id, reds, yellows, match_id").gt("reds", 0),
    sb.from("published_sanctions").select("player_id, kind, origin_matchday, voided"),
    sb.from("players").select("id, full_name, team_id"),
    sb.from("teams").select("id, name"),
    sb.from("matches").select("id, matchday_id"),
    sb.from("matchdays").select("id, number"),
    sb.from("v_player_season_stats").select("player_id, yellows"),
  ]);
  const days = new Map((daysRes.data ?? []).map((d: { id: number; number: number }) => [d.id, d.number]));
  const matchFecha = new Map(
    (matchesRes.data ?? []).map((m: { id: number; matchday_id: number }) => [m.id, days.get(m.matchday_id) ?? 0]),
  );
  const players = new Map((playersRes.data ?? []).map((p: { id: number; full_name: string; team_id: number }) => [p.id, p]));
  const teams = new Map((teamsRes.data ?? []).map((t: { id: number; name: string }) => [t.id, t.name]));
  const published = (sanctionsRes.data ?? []) as { player_id: number; kind: string | null; origin_matchday: number | null; voided: boolean | null }[];
  const out: {
    key: string;
    player_id: number;
    player_name: string;
    team_name: string;
    kind: "red" | "second_yellow" | "yellow_accum";
    matchday: number;
    detail: string;
  }[] = [];
  const seen = new Set<string>();
  function push(kind: "red" | "second_yellow" | "yellow_accum", playerId: number, matchday: number, detail: string) {
    const p = players.get(playerId);
    if (!p) return;
    const already = published.some(
      (s) => s.player_id === playerId && !s.voided && (s.kind === kind || !s.kind) && (s.origin_matchday == null || s.origin_matchday === matchday),
    );
    const key = `${kind}:${playerId}:${matchday}`;
    if (already || seen.has(key)) return;
    seen.add(key);
    out.push({
      key,
      player_id: playerId,
      player_name: p.full_name,
      team_name: teams.get(p.team_id) ?? "",
      kind,
      matchday,
      detail,
    });
  }
  for (const e of eventsRes.data ?? []) {
    const kind = e.kind === "red" ? "red" : "second_yellow";
    push(kind, e.player_id, matchFecha.get(e.match_id) ?? 0, kind === "red" ? "Expulsión" : "Doble amarilla");
  }
  for (const a of appsRes.data ?? []) {
    if ((a.reds ?? 0) > 0) push("red", a.player_id, matchFecha.get(a.match_id) ?? 0, "Expulsión");
  }
  for (const s of statsRes.data ?? []) {
    const yellows = Number(s.yellows) || 0;
    if (yellows < 4) continue;
    const bans = Math.floor(yellows / 4);
    const have = published.filter((x) => x.player_id === s.player_id && !x.voided && (x.kind === "yellow_accum" || !x.kind)).length;
    if (have >= bans) continue;
    push("yellow_accum", s.player_id, 0, "Acumulación de amarillas");
  }
  out.sort((a, b) => b.matchday - a.matchday || a.player_name.localeCompare(b.player_name, "es"));
  return { ok: true, data: out.slice(0, 40) };
}

export async function syncSanctionCalendar(): Promise<ActionResult> {
  const who = await actor();
  if (!who) return fail("Sesión vencida");
  const sb = createAdminClient();
  let rowsRes = await sb.from("published_sanctions").select("id, detail, sanction, kind, duration, origin_matchday, starts_matchday, voided");
  if (rowsRes.error) {
    rowsRes = await sb.from("published_sanctions").select("id, detail, sanction");
  }
  const [{ data: days }, { data: ledgerRow }] = await Promise.all([
    sb.from("matchdays").select("number, played_on").order("number"),
    sb.from("site_content").select("extra, body").eq("slug", "sanctions_ledger").maybeSingle(),
  ]);
  const rows = rowsRes.data as { id: number; detail: string; sanction: string; kind?: string | null; duration?: number | null; origin_matchday?: number | null; starts_matchday?: number | null; voided?: boolean | null }[] | null;
  const cal = calendarState((days ?? []) as { number: number; played_on: string | null }[]);
  const start = cal.next?.number ?? cal.lastClosed + 1;
  const ledger = readLedger(ledgerRow?.extra, ledgerRow?.body);
  for (const row of rows ?? []) {
    const cur = ledger[String(row.id)] ?? {};
    if (cur.starts_matchday != null || row.starts_matchday != null) continue;
    ledger[String(row.id)] = {
      ...cur,
      kind: (row.kind as SanctionLedger[string]["kind"]) || inferKind(row.detail),
      duration: row.duration ?? parseDuration(row.sanction),
      origin_matchday: row.origin_matchday ?? (cal.lastClosed || 1),
      starts_matchday: start,
      voided: Boolean(row.voided),
    };
    await upsertSanctionLedger(sb, row.id, ledger[String(row.id)]);
  }
  touchPublic();
  return { ok: true };
}

export async function deleteSanction(id: number): Promise<ActionResult> {
  const who = await actor();
  if (!who) return fail("Sesión vencida");
  const sb = createAdminClient();
  const { error } = await sb.from("published_sanctions").delete().eq("id", id);
  if (error) return fail(error.message);
  await log(who, "delete", "published_sanctions", id);
  touchPublic();
  return { ok: true };
}

export async function saveHistoryEntry(input: {
  id?: number;
  body: string;
  is_lead: boolean;
  sort_order: number;
}): Promise<ActionResult> {
  const who = await actor();
  if (!who) return fail("Sesión vencida");
  const sb = createAdminClient();
  if (input.id) {
    const { error } = await sb
      .from("league_history_entries")
      .update({ body: input.body, is_lead: input.is_lead, sort_order: input.sort_order })
      .eq("id", input.id);
    if (error) return fail(error.message);
    touchPublic();
    return { ok: true };
  }
  const { data: league } = await sb.from("leagues").select("id").limit(1).single();
  const { error } = await sb.from("league_history_entries").insert({
    league_id: league?.id,
    body: input.body,
    is_lead: input.is_lead,
    sort_order: input.sort_order,
  });
  if (error) return fail(error.message);
  touchPublic();
  return { ok: true };
}

export async function saveTournament(input: {
  id?: number;
  official_number: number | null;
  label: string;
  venue: string | null;
  notes: string | null;
  kind: string;
  champion_team_id: number | null;
  runner_up_team_id: number | null;
  runner_up_asterisk: boolean;
  disqualified_team_id: number | null;
  counts_as_final: boolean;
}): Promise<ActionResult> {
  const who = await actor();
  if (!who) return fail("Sesión vencida");
  const sb = createAdminClient();
  const payload = {
    official_number: input.official_number,
    label: input.label.trim(),
    venue: input.venue,
    notes: input.notes,
    kind: input.kind,
    champion_team_id: input.champion_team_id,
    runner_up_team_id: input.runner_up_team_id,
    runner_up_asterisk: input.runner_up_asterisk,
    disqualified_team_id: input.disqualified_team_id,
    counts_as_final: input.counts_as_final,
  };
  if (input.id) {
    const { error } = await sb.from("historical_tournaments").update(payload).eq("id", input.id);
    if (error) return fail(error.message);
    touchPublic();
    return { ok: true };
  }
  const { data: league } = await sb.from("leagues").select("id").limit(1).single();
  const { data: category } = await sb.from("categories").select("id").limit(1).single();
  const { data: last } = await sb
    .from("historical_tournaments")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await sb.from("historical_tournaments").insert({
    ...payload,
    league_id: league?.id,
    category_id: category?.id,
    sort_order: (last?.sort_order ?? -1) + 1,
  });
  if (error) return fail(error.message);
  touchPublic();
  return { ok: true };
}

export async function saveSiteContent(input: {
  id: number;
  title: string | null;
  body: string | null;
  is_visible: boolean;
}): Promise<ActionResult> {
  const who = await actor();
  if (!who) return fail("Sesión vencida");
  const sb = createAdminClient();
  const { error } = await sb
    .from("site_content")
    .update({
      title: input.title,
      body: input.body,
      is_visible: input.is_visible,
      extra: { visible: input.is_visible },
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return fail(error.message);
  await log(who, "update", "site_content", input.id, input.title ?? undefined);
  touchPublic();
  return { ok: true };
}

export async function saveMediaCaption(input: {
  id: number;
  caption: string | null;
}): Promise<ActionResult> {
  const who = await actor();
  if (!who) return fail("Sesión vencida");
  const sb = createAdminClient();
  const { error } = await sb.from("media").update({ caption: input.caption }).eq("id", input.id);
  if (error) return fail(error.message);
  touchPublic();
  return { ok: true };
}

export async function saveSeason(input: {
  id: number;
  name: string;
  venue: string | null;
  published_through_matchday: number | null;
  second_round_from: number;
  total_matchdays: number;
}): Promise<ActionResult> {
  const who = await actor();
  if (!who) return fail("Sesión vencida");
  const sb = createAdminClient();
  const { error } = await sb
    .from("seasons")
    .update({
      name: input.name,
      venue: input.venue,
      published_through_matchday: input.published_through_matchday,
      second_round_from: input.second_round_from,
      total_matchdays: input.total_matchdays,
    })
    .eq("id", input.id);
  if (error) return fail(error.message);
  await log(who, "update", "seasons", input.id, input.name);
  touchPublic();
  return { ok: true };
}

export async function listDirectory(): Promise<ActionResult> {
  const who = await actor();
  if (!who) return fail("Sesión vencida");
  const sb = createAdminClient();
  const { data: season } = await sb.from("seasons").select("*").limit(1).single();
  const [teams, players, matchdays, calendar, sanctions, history, tournaments, media, content, stats, standings] =
    await Promise.all([
      sb.from("teams").select("*").order("name"),
      sb.from("players").select("id, full_name, team_id, source_index, season_id").order("full_name"),
      sb.from("matchdays").select("*").order("number"),
      sb.from("v_match_calendar").select("*").order("matchday_number").order("sort_order"),
      sb.from("published_sanctions").select("*, players(id, full_name, team_id)").order("sort_order"),
      sb.from("league_history_entries").select("*").order("sort_order"),
      sb.from("historical_tournaments").select("*").order("sort_order"),
      sb.from("media").select("*").order("kind").order("sort_key"),
      sb.from("site_content").select("*").order("sort_order"),
      sb.from("v_player_season_stats").select("*"),
      sb.rpc("season_standings", {
        p_season_id: season?.id,
        p_through: season?.published_through_matchday ?? 16,
      }),
    ]);

  return {
    ok: true,
    data: {
      teams: teams.data ?? [],
      players: players.data ?? [],
      matchdays: matchdays.data ?? [],
      calendar: calendar.data ?? [],
      sanctions: applyLedger((sanctions.data ?? []) as SanctionRow[], readLedger(
        (content.data ?? []).find((c: { slug?: string }) => c.slug === "sanctions_ledger")?.extra,
        (content.data ?? []).find((c: { slug?: string }) => c.slug === "sanctions_ledger")?.body,
      )),
      history: history.data ?? [],
      tournaments: tournaments.data ?? [],
      media: media.data ?? [],
      content: content.data ?? [],
      season: season,
      stats: stats.data ?? [],
      standings: standings.data ?? [],
    },
  };
}
