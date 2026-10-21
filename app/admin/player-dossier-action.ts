"use server";

import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventKind, MatchStatus, PlayerClub, PlayerDossier } from "@/lib/admin/types";
import { publicSrc } from "@/lib/media";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: string): Result<never> {
  return { ok: false, error };
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

export async function getPlayerDossier(playerId: number): Promise<Result<PlayerDossier>> {
  try {
    const id = Number(playerId);
    if (!Number.isFinite(id)) return fail("Jugador no encontrado");
    try {
      await requireAdmin();
    } catch {
      return fail("Sesión vencida");
    }

    const sb = createAdminClient();
    const { data: player, error } = await sb.from("players").select("*").eq("id", id).maybeSingle();
    if (error || !player) return fail("Jugador no encontrado");

    const [teamRes, seasonRes, appearancesRes, eventsMain, eventsAssist, sanctionsRes, statsRes, mediaRes, tournamentsRes, nameTwinsRes, standingsRes, seasonsRes, teamsRes] =
      await Promise.all([
        sb.from("teams").select("*").eq("id", player.team_id).single(),
        sb.from("seasons").select("*").eq("id", player.season_id).single(),
        sb.from("match_appearances").select("*, team_id").eq("player_id", id),
        sb.from("match_events").select("*").eq("player_id", id),
        sb.from("match_events").select("*").eq("assist_player_id", id),
        sb.from("published_sanctions").select("id, detail, sanction, duration, starts_matchday, origin_matchday, voided").eq("player_id", id).order("sort_order"),
        sb.from("v_player_season_stats").select("*").eq("season_id", player.season_id),
        sb.from("media").select("kind, object_path, team_id, historical_tournament_id"),
        sb.from("historical_tournaments").select("*").order("sort_order"),
        sb.from("players").select("id, full_name, team_id, season_id").eq("full_name", player.full_name),
        sb.rpc("season_standings", {
          p_season_id: player.season_id,
          p_through: 16,
        }),
        sb.from("seasons").select("id, name, year, status"),
        sb.from("teams").select("id, name"),
      ]);

    const team = teamRes.data;
    const season = seasonRes.data;
    if (!team || !season) return fail("Ficha incompleta");

    const appearances = appearancesRes.data ?? [];
    const matchIds = [...new Set(appearances.map((row: { match_id: number }) => row.match_id))];
    const calendarRes =
      matchIds.length > 0 ? await sb.from("v_match_calendar").select("*").in("match_id", matchIds) : { data: [] };
    const calendar = (calendarRes.data ?? []) as {
      match_id: number;
      matchday_number: number;
      round_number: number;
      played_on: string | null;
      kickoff_time: string | null;
      pitch: string | null;
      status: MatchStatus;
      home_team_id: number;
      away_team_id: number;
      home_team: string;
      away_team: string;
      home_goals: number | null;
      away_goals: number | null;
    }[];
    const calById = new Map(calendar.map((row) => [row.match_id, row]));

    const events = [...(eventsMain.data ?? []), ...(eventsAssist.data ?? [])]
      .filter((row, index, all) => all.findIndex((other) => other.id === row.id) === index)
      .map((row) => ({
        match_id: row.match_id as number,
        kind: row.kind as EventKind,
        minute: row.minute as number | null,
        extra_minute: row.extra_minute as number | null,
        notes: row.notes as string | null,
        player_id: row.player_id as number | null,
        assist_player_id: row.assist_player_id as number | null,
        sort_order: (row.sort_order as number) ?? 0,
      }));

    const matches: PlayerDossier["matches"] = appearances
      .map((a: { match_id: number; team_id: number; is_home: boolean; goals: number; yellows: number; reds: number; own_goals: number; is_motm: boolean }) => {
        const row = calById.get(a.match_id);
        if (!row) return null;
        return {
          match_id: row.match_id,
          matchday_number: row.matchday_number,
          round_number: row.round_number,
          played_on: row.played_on,
          kickoff_time: row.kickoff_time,
          pitch: row.pitch,
          status: row.status,
          opponent: a.is_home ? row.away_team : row.home_team,
          opponent_id: a.is_home ? row.away_team_id : row.home_team_id,
          is_home: a.is_home,
          home_team: row.home_team,
          away_team: row.away_team,
          home_goals: row.home_goals,
          away_goals: row.away_goals,
          result: resultOf(row.status, a.is_home, row.home_goals, row.away_goals),
          goals: a.goals,
          yellows: a.yellows,
          reds: a.reds,
          own_goals: a.own_goals,
          is_motm: a.is_motm,
          events: events
            .filter((event) => event.match_id === a.match_id)
            .sort((x, y) => (x.minute ?? 999) - (y.minute ?? 999) || x.sort_order - y.sort_order)
            .map((event) => ({
              kind: event.kind,
              minute: event.minute,
              extra_minute: event.extra_minute,
              notes: event.notes,
              as_assist: event.assist_player_id === id && event.player_id !== id,
            })),
        };
      })
      .filter((row): row is PlayerDossier["matches"][number] => row != null)
      .sort((a, b) => a.matchday_number - b.matchday_number || a.match_id - b.match_id);

    const playedMatches = matches.filter((row) => row.status === "played");
    const mine = matches.reduce(
      (acc, row) => {
        acc.goals += row.goals;
        acc.yellows += row.yellows;
        acc.reds += row.reds;
        acc.own_goals += row.own_goals;
        acc.motm += row.is_motm ? 1 : 0;
        return acc;
      },
      { goals: 0, yellows: 0, reds: 0, own_goals: 0, motm: 0 },
    );

    const totalMd = season.total_matchdays ?? 16;
    const goalsByMatchday = Array.from({ length: totalMd }, (_, index) => matches.find((row) => row.matchday_number === index + 1)?.goals ?? 0);
    const appeared = new Set(playedMatches.map((row) => row.matchday_number));
    const published = season.published_through_matchday ?? totalMd;
    let streak = 0;
    for (let n = published; n >= 1; n -= 1) {
      if (appeared.has(n)) streak += 1;
      else break;
    }

    const allStats = (statsRes.data ?? []) as {
      player_id: number;
      team_id: number;
      season_id: number;
      full_name: string;
      matches_played: number;
      goals: number;
      yellows: number;
      reds: number;
      motm: number;
    }[];
    const scorers = allStats.filter((row) => row.goals > 0).sort((a, b) => b.goals - a.goals || a.full_name.localeCompare(b.full_name, "es"));
    const teamScorers = scorers.filter((row) => row.team_id === player.team_id);
    const standings = (standingsRes.data ?? []) as { team_id: number; pj: number }[];
    const tableIndex = standings.findIndex((row) => row.team_id === player.team_id);

    const media = (mediaRes.data ?? []) as {
      kind: string;
      object_path: string;
      team_id: number | null;
      historical_tournament_id: number | null;
    }[];
    const logo = publicSrc(media.find((row) => row.kind === "team_logo" && row.team_id === team.id)?.object_path);
    const squad_photo = publicSrc(media.find((row) => row.kind === "squad_photo" && row.team_id === team.id)?.object_path);
    const photoByTournament = new Map(
      media
        .filter((row) => (row.kind === "champion_thumb" || row.kind === "champion_photo") && row.historical_tournament_id)
        .map((row) => [row.historical_tournament_id as number, publicSrc(row.object_path)]),
    );

    const teamNames = new Map((teamsRes.data ?? []).map((row: { id: number; name: string }) => [row.id, row.name]));
    const twins = (nameTwinsRes.data ?? []) as { id: number; team_id: number; season_id: number }[];
    const seasonNames = new Map(
      (seasonsRes.data ?? []).map((row: { id: number; name: string; year: number; status: string }) => [row.id, row]),
    );

    const yellows_for_suspension = season.yellows_for_suspension ?? 4;
    const used = mine.yellows % yellows_for_suspension;
    const dated = playedMatches.filter((row) => row.played_on);
    const round1 = playedMatches.filter((row) => row.round_number === 1);
    const round2 = playedMatches.filter((row) => row.round_number === 2);

    const tournaments: PlayerDossier["tournaments"] = ((tournamentsRes.data ?? []) as {
      id: number;
      label: string;
      kind: string;
      official_number: number | null;
      venue: string | null;
      season_id: number | null;
      champion_team_id: number | null;
      runner_up_team_id: number | null;
      disqualified_team_id: number | null;
    }[]).map((row) => {
      const isCurrent = row.season_id === player.season_id || row.kind === "encurso";
      let clubRole: PlayerDossier["tournaments"][number]["clubRole"] = isCurrent ? "current" : null;
      if (row.champion_team_id === team.id) clubRole = isCurrent ? "current" : "champion";
      else if (row.runner_up_team_id === team.id) clubRole = "runner";
      else if (row.disqualified_team_id === team.id) clubRole = "dq";
      return {
        id: row.id,
        label: row.label,
        kind: row.kind,
        official_number: row.official_number,
        venue: row.venue,
        clubRole,
        champion: row.champion_team_id ? (teamNames.get(row.champion_team_id) ?? null) : null,
        runner_up: row.runner_up_team_id ? (teamNames.get(row.runner_up_team_id) ?? null) : null,
        photo: photoByTournament.get(row.id) ?? null,
        isCurrent,
      };
    });

    return {
      ok: true,
      data: {
        player: {
          id: player.id,
          full_name: player.full_name,
          team_id: player.team_id,
          source_index: player.source_index,
          season_id: player.season_id,
        },
        team: {
          id: team.id,
          name: team.name,
          slug: team.slug,
          is_dissolved: team.is_dissolved,
          is_founding_team: team.is_founding_team,
          logo,
          squad_photo,
        },
        season: {
          id: season.id,
          name: season.name,
          label: season.label,
          year: season.year,
          venue: season.venue,
          status: season.status,
          published_through_matchday: season.published_through_matchday,
          total_matchdays: season.total_matchdays,
          second_round_from: season.second_round_from,
          yellows_for_suspension,
        },
        stats: {
          matches_played: playedMatches.length,
          goals: mine.goals,
          yellows: mine.yellows,
          reds: mine.reds,
          own_goals: mine.own_goals,
          motm: mine.motm,
          assists: events.filter((event) => event.assist_player_id === id || (event.kind === "assist" && event.player_id === id)).length,
          penalties: events.filter((event) => event.kind === "penalty" && event.player_id === id).length,
          missed_penalties: events.filter((event) => event.kind === "penalty_missed" && event.player_id === id).length,
          second_yellows: events.filter((event) => event.kind === "second_yellow" && event.player_id === id).length,
          fp: -mine.yellows - 4 * mine.reds,
          wins: playedMatches.filter((row) => row.result === "W").length,
          draws: playedMatches.filter((row) => row.result === "D").length,
          losses: playedMatches.filter((row) => row.result === "L").length,
          league_goal_rank: mine.goals > 0 ? scorers.findIndex((row) => row.player_id === id) + 1 : null,
          team_goal_rank: mine.goals > 0 ? teamScorers.findIndex((row) => row.player_id === id) + 1 : null,
          team_table_place: tableIndex >= 0 ? tableIndex + 1 : null,
          team_played: standings[tableIndex]?.pj ?? 0,
          first_appearance: dated[0]?.played_on ?? null,
          last_appearance: dated[dated.length - 1]?.played_on ?? null,
          streak,
          yellows_to_ban: used === 0 ? yellows_for_suspension : yellows_for_suspension - used,
          goals_by_matchday: goalsByMatchday,
          round1: { pj: round1.length, goals: round1.reduce((sum, row) => sum + row.goals, 0) },
          round2: { pj: round2.length, goals: round2.reduce((sum, row) => sum + row.goals, 0) },
        },
        matches,
        sanctions: sanctionsRes.data ?? [],
        homonyms: twins
          .filter((row) => row.id !== id && row.season_id === player.season_id)
          .map((row) => ({ id: row.id, team: teamNames.get(row.team_id) ?? `#${row.team_id}`, team_id: row.team_id })),
        clubs: (() => {
          const clubs = new Map<number, PlayerClub>();
          const add = (teamId: number, playerId: number, related: boolean, pj: number, goals: number) => {
            const prev = clubs.get(teamId);
            clubs.set(teamId, {
              team_id: teamId,
              team_name: teamNames.get(teamId) ?? `#${teamId}`,
              logo: publicSrc(media.find((row) => row.kind === "team_logo" && row.team_id === teamId)?.object_path),
              current: teamId === team.id,
              related,
              player_id: playerId,
              matches_played: Math.max(prev?.matches_played ?? 0, pj),
              goals: Math.max(prev?.goals ?? 0, goals),
            });
          };
          add(team.id, id, false, playedMatches.length, mine.goals);
          const byApp = new Map<number, { pj: number; goals: number }>();
          for (const a of appearances as { team_id: number; goals: number }[]) {
            const cur = byApp.get(a.team_id) ?? { pj: 0, goals: 0 };
            cur.pj += 1;
            cur.goals += a.goals;
            byApp.set(a.team_id, cur);
          }
          for (const [teamId, tot] of byApp) add(teamId, id, false, tot.pj, tot.goals);
          for (const row of twins.filter((item) => item.id !== id && item.team_id !== team.id)) {
            const st = allStats.find((item) => item.player_id === row.id);
            add(row.team_id, row.id, true, st?.matches_played ?? 0, st?.goals ?? 0);
          }
          return [...clubs.values()].sort((a, b) => Number(b.current) - Number(a.current) || a.team_name.localeCompare(b.team_name, "es"));
        })(),
        stints: twins
          .filter((row) => row.id === id || (row.team_id === player.team_id && row.season_id !== player.season_id))
          .map((row) => {
            const st = allStats.find((item) => item.player_id === row.id);
            const sn = seasonNames.get(row.season_id);
            return {
              player_id: row.id,
              season_id: row.season_id,
              season_name: sn?.name ?? `Torneo ${row.season_id}`,
              year: sn?.year ?? 0,
              status: sn?.status ?? "",
              team_id: row.team_id,
              team_name: team.name,
              matches_played: st?.matches_played ?? (row.id === id ? playedMatches.length : 0),
              goals: st?.goals ?? (row.id === id ? mine.goals : 0),
              yellows: st?.yellows ?? (row.id === id ? mine.yellows : 0),
              reds: st?.reds ?? (row.id === id ? mine.reds : 0),
              motm: st?.motm ?? (row.id === id ? mine.motm : 0),
              current: row.season_id === player.season_id,
            };
          })
          .sort((a, b) => b.year - a.year || b.season_id - a.season_id),
        tournaments,
        club: {
          titles: tournaments.filter((row) => row.clubRole === "champion").length,
          runner_ups: tournaments.filter((row) => row.clubRole === "runner").length,
          last_title: [...tournaments].reverse().find((row) => row.clubRole === "champion")?.label ?? null,
        },
      },
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "No se pudo cargar");
  }
}
