"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MatchStatus, TeamDossier, TeamDossierMatch, TeamDossierPlayer, TeamDossierTitle } from "@/lib/admin/types";
import { publicSrc } from "@/lib/media";

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

const PROFILE_SLUG = "team_profiles";

type TeamProfile = { bio?: string; campaign?: string };
type TeamProfiles = Record<string, TeamProfile>;

function fail(error: string): Result<never> {
  return { ok: false, error };
}

function touchPublic() {
  revalidatePath("/");
  revalidatePath("/api/public/liga");
}

function resultOf(
  status: string,
  isHome: boolean,
  homeGoals: number | null,
  awayGoals: number | null,
): "W" | "D" | "L" | null {
  if (status !== "played" || homeGoals == null || awayGoals == null) return null;
  const gf = isHome ? homeGoals : awayGoals;
  const ga = isHome ? awayGoals : homeGoals;
  if (gf > ga) return "W";
  if (gf < ga) return "L";
  return "D";
}

function readProfiles(extra: unknown, body: string | null | undefined): TeamProfiles {
  if (extra && typeof extra === "object" && !Array.isArray(extra)) return extra as TeamProfiles;
  if (body) {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as TeamProfiles;
    } catch {
      /* ignore */
    }
  }
  return {};
}

function shotKey(value: string | null | undefined) {
  return value ?? "5";
}

export async function getTeamDossier(teamId: number): Promise<Result<TeamDossier>> {
  try {
    const id = Number(teamId);
    if (!Number.isFinite(id)) return fail("Equipo no encontrado");
    try {
      await requireAdmin();
    } catch {
      return fail("Sesión vencida");
    }

    const sb = createAdminClient();
    const { data: team, error } = await sb.from("teams").select("*").eq("id", id).maybeSingle();
    if (error || !team) return fail("Equipo no encontrado");

    const { data: season } = await sb.from("seasons").select("*").limit(1).single();
    if (!season) return fail("Sin temporada");

    const [playersRes, allPlayersRes, statsRes, mediaRes, tournamentsRes, calendarRes, standingsRes, appearancesRes, teamsRes, finalistsRes, profilesRes] =
      await Promise.all([
        sb.from("players").select("id, full_name, team_id, source_index, season_id").eq("team_id", id).order("full_name"),
        sb.from("players").select("id, full_name, team_id, season_id").eq("season_id", season.id),
        sb.from("v_player_season_stats").select("*").eq("season_id", season.id),
        sb.from("media").select("id, kind, object_path, caption, team_id, historical_tournament_id, width, height, sort_key"),
        sb.from("historical_tournaments").select("*").order("sort_order"),
        sb.from("v_match_calendar").select("*").eq("season_id", season.id).order("matchday_number").order("sort_order"),
        sb.rpc("season_standings", {
          p_season_id: season.id,
          p_through: season.published_through_matchday ?? 16,
        }),
        sb.from("match_appearances").select("player_id, team_id, goals, yellows, reds, is_motm").eq("team_id", id),
        sb.from("teams").select("id, name"),
        sb.from("v_finalists").select("*").eq("team_id", id).maybeSingle(),
        sb.from("site_content").select("extra, body").eq("slug", PROFILE_SLUG).maybeSingle(),
      ]);

    const teamNames = new Map((teamsRes.data ?? []).map((row: { id: number; name: string }) => [row.id, row.name]));
    const media = (mediaRes.data ?? []) as {
      id: number;
      kind: string;
      object_path: string;
      caption: string | null;
      team_id: number | null;
      historical_tournament_id: number | null;
      sort_key: string | null;
    }[];
    const logoRow = media.find((row) => row.kind === "team_logo" && row.team_id === id);
    const logo = publicSrc(logoRow?.object_path);
    const squad_photos = media
      .filter((row) => row.kind === "squad_photo" && row.team_id === id)
      .map((row) => ({
        id: row.id,
        src: publicSrc(row.object_path) ?? "",
        path: row.object_path,
        caption: row.caption,
        sort_key: row.sort_key,
      }))
      .filter((row) => row.src)
      .sort((a, b) => shotKey(a.sort_key).localeCompare(shotKey(b.sort_key)) || a.id - b.id);

    type TitlePics = {
      photo: string | null;
      thumb: string | null;
      photo_id: number | null;
      thumb_id: number | null;
      photo_path: string | null;
      thumb_path: string | null;
    };
    const photoByTournament = new Map<number, TitlePics>();
    for (const row of media) {
      if (!row.historical_tournament_id) continue;
      if (row.kind !== "champion_photo" && row.kind !== "champion_thumb") continue;
      const cur = photoByTournament.get(row.historical_tournament_id) ?? {
        photo: null,
        thumb: null,
        photo_id: null,
        thumb_id: null,
        photo_path: null,
        thumb_path: null,
      };
      const src = publicSrc(row.object_path);
      if (row.kind === "champion_photo") {
        cur.photo = src;
        cur.photo_id = row.id;
        cur.photo_path = row.object_path;
      } else {
        cur.thumb = src;
        cur.thumb_id = row.id;
        cur.thumb_path = row.object_path;
      }
      photoByTournament.set(row.historical_tournament_id, cur);
    }
    const stats = (statsRes.data ?? []) as {
      player_id: number;
      team_id: number;
      full_name: string;
      source_index: number;
      matches_played: number;
      goals: number;
      yellows: number;
      reds: number;
      motm: number;
    }[];
    const statsById = new Map(stats.map((row) => [row.player_id, row]));
    const allPlayers = (allPlayersRes.data ?? []) as { id: number; full_name: string; team_id: number; season_id: number }[];
    const byName = new Map<string, typeof allPlayers>();
    for (const row of allPlayers) {
      const list = byName.get(row.full_name) ?? [];
      list.push(row);
      byName.set(row.full_name, list);
    }

    function toPlayer(row: { id: number; full_name: string; source_index?: number; team_id?: number }): TeamDossierPlayer {
      const st = statsById.get(row.id);
      const twins = (byName.get(row.full_name) ?? []).filter((item) => item.id !== row.id && item.team_id !== id);
      return {
        id: row.id,
        full_name: row.full_name,
        source_index: row.source_index ?? st?.source_index ?? 0,
        matches_played: st?.matches_played ?? 0,
        goals: st?.goals ?? 0,
        yellows: st?.yellows ?? 0,
        reds: st?.reds ?? 0,
        motm: st?.motm ?? 0,
        otherClubs: twins.map((item) => ({
          team_id: item.team_id,
          team_name: teamNames.get(item.team_id) ?? `#${item.team_id}`,
          player_id: item.id,
        })),
      };
    }

    const roster = ((playersRes.data ?? []) as { id: number; full_name: string; source_index: number }[]).map(toPlayer);
    const rosterIds = new Set(roster.map((row) => row.id));
    const alumniIds = [...new Set((appearancesRes.data ?? []).map((row: { player_id: number }) => row.player_id))].filter(
      (playerId) => !rosterIds.has(playerId),
    );
    const alumniPlayers = allPlayers.filter((row) => alumniIds.includes(row.id));
    const alumni = alumniPlayers.map((row) => toPlayer({ ...row, source_index: statsById.get(row.id)?.source_index ?? 0 }));

    const titles: TeamDossierTitle[] = ((tournamentsRes.data ?? []) as {
      id: number;
      label: string;
      kind: string;
      official_number: number | null;
      venue: string | null;
      notes: string | null;
      season_id: number | null;
      champion_team_id: number | null;
      runner_up_team_id: number | null;
      disqualified_team_id: number | null;
    }[])
      .map((row) => {
        const isCurrent = row.season_id === season.id || row.kind === "encurso";
        let role: TeamDossierTitle["role"] | null = isCurrent ? "current" : null;
        if (row.champion_team_id === id) role = "champion";
        else if (row.runner_up_team_id === id) role = "runner";
        else if (row.disqualified_team_id === id) role = "dq";
        else if (!isCurrent) return null;
        const pics = photoByTournament.get(row.id);
        return {
          id: row.id,
          label: row.label,
          kind: row.kind,
          official_number: row.official_number,
          venue: row.venue,
          notes: row.notes,
          role: role ?? "current",
          champion: row.champion_team_id ? (teamNames.get(row.champion_team_id) ?? null) : null,
          runner_up: row.runner_up_team_id ? (teamNames.get(row.runner_up_team_id) ?? null) : null,
          champion_team_id: row.champion_team_id,
          runner_up_team_id: row.runner_up_team_id,
          photo: pics?.photo ?? pics?.thumb ?? null,
          thumb: pics?.thumb ?? pics?.photo ?? null,
          photo_id: pics?.photo_id ?? null,
          thumb_id: pics?.thumb_id ?? null,
          photo_path: pics?.photo_path ?? null,
          thumb_path: pics?.thumb_path ?? null,
        };
      })
      .filter((row): row is TeamDossierTitle => row != null);

    const matches: TeamDossierMatch[] = (
      (calendarRes.data ?? []) as {
        match_id: number;
        matchday_number: number;
        round_number: number;
        played_on: string | null;
        kickoff_time: string | null;
        status: MatchStatus;
        home_team_id: number;
        away_team_id: number;
        home_team: string;
        away_team: string;
        home_goals: number | null;
        away_goals: number | null;
        motm_name: string | null;
      }[]
    )
      .filter((row) => row.home_team_id === id || row.away_team_id === id)
      .map((row) => {
        const is_home = row.home_team_id === id;
        return {
          match_id: row.match_id,
          matchday_number: row.matchday_number,
          round_number: row.round_number,
          played_on: row.played_on,
          kickoff_time: row.kickoff_time,
          status: row.status,
          is_home,
          opponent: is_home ? row.away_team : row.home_team,
          opponent_id: is_home ? row.away_team_id : row.home_team_id,
          home_goals: row.home_goals,
          away_goals: row.away_goals,
          result: resultOf(row.status, is_home, row.home_goals, row.away_goals),
          motm_name: row.motm_name,
        };
      });

    const standing = ((standingsRes.data ?? []) as { team_id: number; pos: number; pts: number; pj: number; pg: number; pe: number; pp: number; gf: number; gc: number; dg: number; ta: number; tr: number; fp: number }[]).find(
      (row) => row.team_id === id,
    );
    const finalists = finalistsRes.data as { finals_played: number; finals_won: number } | null;
    const champTitles = titles.filter((row) => row.role === "champion");
    const profile = readProfiles(profilesRes.data?.extra, profilesRes.data?.body)[String(id)] ?? {};

    return {
      ok: true,
      data: {
        team: {
          id: team.id,
          name: team.name,
          slug: team.slug,
          short_name: team.short_name ?? null,
          bio: profile.bio ?? "",
          campaign: profile.campaign ?? "",
          is_dissolved: team.is_dissolved,
          is_founding_team: team.is_founding_team,
          logo,
          logo_id: logoRow?.id ?? null,
          logo_path: logoRow?.object_path ?? null,
          squad_photos,
        },
        season: {
          id: season.id,
          name: season.name,
          year: season.year,
          venue: season.venue,
          status: season.status,
          published_through_matchday: season.published_through_matchday,
          total_matchdays: season.total_matchdays,
        },
        table: {
          pos: standing?.pos ?? null,
          pts: standing?.pts ?? 0,
          pj: standing?.pj ?? 0,
          pg: standing?.pg ?? 0,
          pe: standing?.pe ?? 0,
          pp: standing?.pp ?? 0,
          gf: standing?.gf ?? 0,
          gc: standing?.gc ?? 0,
          dg: standing?.dg ?? 0,
          ta: standing?.ta ?? 0,
          tr: standing?.tr ?? 0,
          fp: standing?.fp ?? 0,
        },
        roster,
        alumni,
        titles,
        matches,
        club: {
          titles: champTitles.length,
          runner_ups: titles.filter((row) => row.role === "runner").length,
          last_title: [...champTitles].reverse()[0]?.label ?? null,
          finals_played: finalists?.finals_played ?? 0,
          finals_won: finalists?.finals_won ?? 0,
        },
      },
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "No se pudo cargar");
  }
}

async function upsertProfiles(sb: ReturnType<typeof createAdminClient>, teamId: number, patch: TeamProfile) {
  const { data } = await sb.from("site_content").select("id, extra, body").eq("slug", PROFILE_SLUG).maybeSingle();
  const profiles = readProfiles(data?.extra, data?.body);
  const key = String(teamId);
  profiles[key] = { ...profiles[key], ...patch };
  const extra = profiles;
  const body = JSON.stringify(profiles);
  if (data?.id) {
    await sb.from("site_content").update({ extra, body, updated_at: new Date().toISOString() }).eq("id", data.id);
    return;
  }
  await sb.from("site_content").insert({
    slug: PROFILE_SLUG,
    area: "equipos",
    title: "Perfiles de equipos",
    body,
    is_visible: false,
    sort_order: 970,
    extra,
  });
}

export async function saveTeamProfile(input: {
  teamId: number;
  bio?: string;
  campaign?: string;
}): Promise<Result> {
  try {
    await requireAdmin();
  } catch {
    return fail("Sesión vencida");
  }
  const sb = createAdminClient();
  await upsertProfiles(sb, input.teamId, {
    ...(input.bio !== undefined ? { bio: input.bio } : {}),
    ...(input.campaign !== undefined ? { campaign: input.campaign } : {}),
  });
  touchPublic();
  return { ok: true };
}

export async function saveTeamMedia(input: {
  id?: number;
  team_id?: number | null;
  kind: "team_logo" | "squad_photo" | "champion_photo" | "champion_thumb";
  object_path: string;
  caption?: string | null;
  historical_tournament_id?: number | null;
  cover?: boolean;
}): Promise<Result<{ id: number }>> {
  try {
    await requireAdmin();
  } catch {
    return fail("Sesión vencida");
  }
  const path = input.object_path.trim();
  if (!path) return fail("Falta la URL");
  const sb = createAdminClient();
  let id = input.id ?? null;

  if (id) {
    const { error } = await sb
      .from("media")
      .update({
        object_path: path,
        caption: input.caption ?? null,
        team_id: input.team_id ?? null,
        historical_tournament_id: input.historical_tournament_id ?? null,
      })
      .eq("id", id);
    if (error) return fail(error.message);
  } else if (input.kind === "team_logo" && input.team_id) {
    const { data: existing } = await sb.from("media").select("id").eq("kind", "team_logo").eq("team_id", input.team_id).maybeSingle();
    if (existing?.id) {
      const { error } = await sb.from("media").update({ object_path: path, caption: input.caption ?? null }).eq("id", existing.id);
      if (error) return fail(error.message);
      id = existing.id;
    }
  } else if (input.kind === "champion_photo" && input.historical_tournament_id) {
    const { data: existing } = await sb
      .from("media")
      .select("id")
      .eq("kind", "champion_photo")
      .eq("historical_tournament_id", input.historical_tournament_id)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await sb
        .from("media")
        .update({ object_path: path, caption: input.caption ?? null, team_id: input.team_id ?? null })
        .eq("id", existing.id);
      if (error) return fail(error.message);
      id = existing.id;
    }
  }

  if (!id) {
    const { data, error } = await sb
      .from("media")
      .insert({
        kind: input.kind,
        object_path: path,
        caption: input.caption ?? null,
        team_id: input.team_id ?? null,
        historical_tournament_id: input.historical_tournament_id ?? null,
        sort_key: input.cover ? "0" : "5",
      })
      .select("id")
      .single();
    if (error || !data) return fail(error?.message ?? "No se pudo guardar");
    id = data.id;
  }

  if (!id) return fail("No se pudo guardar");
  if (input.cover && input.team_id) {
    await promoteCover(sb, input.team_id, id);
  }
  touchPublic();
  return { ok: true, data: { id } };
}

export async function saveTeamCaption(input: { id: number; caption: string | null }): Promise<Result> {
  try {
    await requireAdmin();
  } catch {
    return fail("Sesión vencida");
  }
  const sb = createAdminClient();
  const { error } = await sb.from("media").update({ caption: input.caption }).eq("id", input.id);
  if (error) return fail(error.message);
  touchPublic();
  return { ok: true };
}

export async function setSquadCover(input: { teamId: number; mediaId: number }): Promise<Result> {
  try {
    await requireAdmin();
  } catch {
    return fail("Sesión vencida");
  }
  const sb = createAdminClient();
  await promoteCover(sb, input.teamId, input.mediaId);
  touchPublic();
  return { ok: true };
}

export async function deleteTeamMedia(input: { id: number }): Promise<Result> {
  try {
    await requireAdmin();
  } catch {
    return fail("Sesión vencida");
  }
  const sb = createAdminClient();
  const { error } = await sb.from("media").delete().eq("id", input.id);
  if (error) return fail(error.message);
  touchPublic();
  return { ok: true };
}

export async function saveTeamTitle(input: {
  id: number;
  venue?: string | null;
  notes?: string | null;
  photo_path?: string | null;
  photo_id?: number | null;
  team_id?: number | null;
}): Promise<Result> {
  try {
    await requireAdmin();
  } catch {
    return fail("Sesión vencida");
  }
  const sb = createAdminClient();
  const patch: { venue?: string | null; notes?: string | null } = {};
  if (input.venue !== undefined) patch.venue = input.venue?.trim() || null;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (Object.keys(patch).length) {
    const { error } = await sb.from("historical_tournaments").update(patch).eq("id", input.id);
    if (error) return fail(error.message);
  }
  if (input.photo_path !== undefined) {
    const path = (input.photo_path ?? "").trim();
    if (!path) {
      if (input.photo_id) {
        const { error } = await sb.from("media").delete().eq("id", input.photo_id);
        if (error) return fail(error.message);
      }
    } else {
      const res = await saveTeamMedia({
        id: input.photo_id ?? undefined,
        kind: "champion_photo",
        object_path: path,
        historical_tournament_id: input.id,
        team_id: input.team_id ?? null,
      });
      if (!res.ok) return res;
    }
  }
  touchPublic();
  return { ok: true };
}

async function promoteCover(sb: ReturnType<typeof createAdminClient>, teamId: number, mediaId: number) {
  const { data } = await sb.from("media").select("id").eq("kind", "squad_photo").eq("team_id", teamId).order("id");
  const rows = (data ?? []) as { id: number }[];
  await Promise.all(
    rows.map((row, index) =>
      sb
        .from("media")
        .update({ sort_key: row.id === mediaId ? "0" : String(index + 1) })
        .eq("id", row.id),
    ),
  );
}
