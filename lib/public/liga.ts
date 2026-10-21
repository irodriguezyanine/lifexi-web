import { createClient } from "@supabase/supabase-js";
import { publicSrc } from "@/lib/media";
import { applyLedger, calendarState, parseDuration, readLedger, type SanctionRow } from "@/lib/admin/sanctions";

export type PublicLiga = {
  season: {
    id: number;
    name: string;
    label: string;
    year: number;
    venue: string | null;
    status: string;
    published_through_matchday: number | null;
    second_round_from: number | null;
    total_matchdays: number | null;
  } | null;
  teams: {
    id: number;
    name: string;
    slug: string;
    short_name: string | null;
    bio: string | null;
    campaign: string | null;
    is_dissolved: boolean;
    is_founding_team: boolean;
    source_index: number | null;
    logo: string | null;
    squad_photo: string | null;
    squad_caption: string | null;
    squad_photos: { src: string; caption: string | null }[];
    titles: number;
    runner_ups: number;
    last_title: string | null;
  }[];
  players: {
    id: number;
    full_name: string;
    team_id: number;
    source_index: number;
    nick: string | null;
    bio: string | null;
    number: string | null;
    position: string | null;
    photo: string | null;
    photos: { src: string; caption: string | null }[];
    matches_played: number;
    goals: number;
    yellows: number;
    reds: number;
    motm: number;
    other_teams: { id: number; name: string; player_id: number }[];
  }[];
  tournaments: {
    id: number;
    label: string;
    kind: string;
    official_number: number | null;
    champion: string | null;
    champion_team_id: number | null;
    runner_up: string | null;
    runner_up_team_id: number | null;
    photo: string | null;
    thumb: string | null;
    venue: string | null;
    notes: string | null;
    unofficial_winner: string | null;
    runner_up_asterisk: boolean;
  }[];
  matches: {
    id: number;
    matchday_number: number;
    source_key: string;
    home_team_id: number;
    away_team_id: number;
    home_goals: number | null;
    away_goals: number | null;
    status: string;
    kickoff_time: string | null;
    pitch: string | null;
    motm_player_id: number | null;
    motm_source_index: number | null;
    live: boolean;
    sheet: {
      home: (number | [number, number, number, number, number])[];
      away: (number | [number, number, number, number, number])[];
    };
  }[];
  matchdays: { number: number; played_on: string | null }[];
  sanctions: {
    player_source_index: number | null;
    detail: string;
    sanction: string;
    remaining: number;
    origin_matchday: number | null;
    starts_matchday: number | null;
    duration: number;
    kind: string;
    active: boolean;
  }[];
  history: { body: string; is_lead: boolean; sort_order: number }[];
  content: { slug: string; title: string | null; body: string | null; is_visible: boolean }[];
};

function emptyLiga(): PublicLiga {
  return {
    season: null,
    teams: [],
    players: [],
    tournaments: [],
    matches: [],
    matchdays: [],
    sanctions: [],
    history: [],
    content: [],
  };
}

export async function getPublicLiga(): Promise<PublicLiga> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return emptyLiga();

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: season } = await sb.from("seasons").select("*").limit(1).single();
  const [teamsRes, seasonTeamsRes, playersRes, statsRes, mediaRes, tournamentsRes, palmaresRes, matchesRes, appsRes, matchdaysRes, sanctionsRes, historyRes, contentRes] = await Promise.all([
    sb.from("teams").select("id, name, slug, short_name, is_dissolved, is_founding_team").order("name"),
    sb.from("season_teams").select("team_id, source_index").eq("season_id", season?.id ?? 0),
    sb.from("players").select("id, full_name, team_id, source_index, season_id").eq("season_id", season?.id ?? 0).order("source_index"),
    sb.from("v_player_season_stats").select("*").eq("season_id", season?.id ?? 0),
    sb.from("media").select("kind, object_path, caption, team_id, historical_tournament_id, sort_key"),
    sb.from("historical_tournaments").select("*").order("sort_order"),
    sb.from("v_palmares").select("team_id, titles, runner_ups, last_title"),
    sb.from("v_match_calendar").select("*").eq("season_id", season?.id ?? 0).order("matchday_number").order("sort_order"),
    sb.from("match_appearances").select("match_id, player_id, team_id, is_home, goals, own_goals, yellows, reds"),
    sb.from("matchdays").select("number, played_on").eq("season_id", season?.id ?? 0).order("number"),
    sb.from("published_sanctions").select("player_id, detail, sanction, kind, duration, origin_matchday, starts_matchday, voided").eq("season_id", season?.id ?? 0).order("sort_order"),
    sb.from("league_history_entries").select("body, is_lead, sort_order").order("sort_order"),
    sb.from("site_content").select("slug, title, body, is_visible, extra").order("sort_order"),
  ]);

  const teamNames = new Map((teamsRes.data ?? []).map((row: { id: number; name: string }) => [row.id, row.name]));
  const sourceByTeam = new Map(
    (seasonTeamsRes.data ?? []).map((row: { team_id: number; source_index: number }) => [row.team_id, row.source_index]),
  );
  const palmares = new Map(
    (palmaresRes.data ?? []).map((row: { team_id: number; titles: number; runner_ups: number; last_title: string | null }) => [
      row.team_id,
      row,
    ]),
  );
  const media = (mediaRes.data ?? []) as {
    kind: string;
    object_path: string;
    caption: string | null;
    team_id: number | null;
    historical_tournament_id: number | null;
    sort_key: string | null;
  }[];
  const logoByTeam = new Map<number, string>();
  const squadsByTeam = new Map<number, { src: string; caption: string | null; sort_key: string | null }[]>();
  const photoByTournament = new Map<number, { photo: string | null; thumb: string | null; photoKey: string; thumbKey: string }>();
  for (const row of media) {
    const src = publicSrc(row.object_path);
    if (!src) continue;
    if (row.kind === "team_logo" && row.team_id) logoByTeam.set(row.team_id, src);
    if (row.kind === "squad_photo" && row.team_id) {
      const list = squadsByTeam.get(row.team_id) ?? [];
      list.push({ src, caption: row.caption, sort_key: row.sort_key });
      squadsByTeam.set(row.team_id, list);
    }
    if (row.historical_tournament_id && (row.kind === "champion_photo" || row.kind === "champion_thumb")) {
      const cur = photoByTournament.get(row.historical_tournament_id) ?? {
        photo: null,
        thumb: null,
        photoKey: "zzz",
        thumbKey: "zzz",
      };
      const key = row.sort_key ?? "5";
      if (row.kind === "champion_photo" && key.localeCompare(cur.photoKey) <= 0) {
        cur.photo = src;
        cur.photoKey = key;
      }
      if (row.kind === "champion_thumb" && key.localeCompare(cur.thumbKey) <= 0) {
        cur.thumb = src;
        cur.thumbKey = key;
      }
      photoByTournament.set(row.historical_tournament_id, cur);
    }
  }
  for (const list of squadsByTeam.values()) {
    list.sort((a, b) => (a.sort_key ?? "5").localeCompare(b.sort_key ?? "5"));
  }
  const profilesEntry = ((contentRes.data ?? []) as { slug: string; extra?: unknown; body?: string | null }[]).find((c) => c.slug === "team_profiles");
  let profiles: Record<string, { bio?: string; campaign?: string }> = {};
  if (profilesEntry?.extra && typeof profilesEntry.extra === "object" && !Array.isArray(profilesEntry.extra)) {
    profiles = profilesEntry.extra as Record<string, { bio?: string; campaign?: string }>;
  } else if (profilesEntry?.body) {
    try {
      const parsed = JSON.parse(profilesEntry.body) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        profiles = parsed as Record<string, { bio?: string; campaign?: string }>;
      }
    } catch {
      profiles = {};
    }
  }

  const playerProfilesEntry = ((contentRes.data ?? []) as { slug: string; extra?: unknown; body?: string | null }[]).find((c) => c.slug === "player_profiles");
  let playerProfiles: Record<string, { nick?: string; bio?: string; number?: string; position?: string; photo?: string | null; photos?: { src: string; caption?: string }[] }> = {};
  if (playerProfilesEntry?.extra && typeof playerProfilesEntry.extra === "object" && !Array.isArray(playerProfilesEntry.extra)) {
    playerProfiles = playerProfilesEntry.extra as typeof playerProfiles;
  } else if (playerProfilesEntry?.body) {
    try {
      const parsed = JSON.parse(playerProfilesEntry.body) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        playerProfiles = parsed as typeof playerProfiles;
      }
    } catch {
      playerProfiles = {};
    }
  }

  const stats = (statsRes.data ?? []) as {
    player_id: number;
    matches_played: number;
    goals: number;
    yellows: number;
    reds: number;
    motm: number;
  }[];
  const statsById = new Map(stats.map((row) => [row.player_id, row]));
  const playersRaw = (playersRes.data ?? []) as {
    id: number;
    full_name: string;
    team_id: number;
    source_index: number;
  }[];
  const byName = new Map<string, typeof playersRaw>();
  for (const row of playersRaw) {
    const list = byName.get(row.full_name) ?? [];
    list.push(row);
    byName.set(row.full_name, list);
  }
  const playerIndex = new Map(playersRaw.map((row) => [row.id, row.source_index]));
  const appsByMatch = new Map<
    number,
    { player_id: number; team_id: number; is_home: boolean; goals: number; own_goals: number; yellows: number; reds: number }[]
  >();
  for (const row of (appsRes.data ?? []) as {
    match_id: number;
    player_id: number;
    team_id: number;
    is_home: boolean;
    goals: number;
    own_goals: number;
    yellows: number;
    reds: number;
  }[]) {
    const list = appsByMatch.get(row.match_id) ?? [];
    list.push(row);
    appsByMatch.set(row.match_id, list);
  }
  function sheetSide(
    rows: { player_id: number; is_home: boolean; goals: number; own_goals: number; yellows: number; reds: number }[],
    home: boolean,
  ) {
    return rows
      .filter((row) => row.is_home === home)
      .map((row) => {
        const idx = playerIndex.get(row.player_id);
        if (idx == null) return null;
        if (row.goals || row.yellows || row.reds || row.own_goals) {
          return [idx, row.goals, row.yellows, row.reds, row.own_goals] as [number, number, number, number, number];
        }
        return idx;
      })
      .filter((row): row is number | [number, number, number, number, number] => row != null);
  }

  let sanctionsData: Record<string, unknown>[] | null = (sanctionsRes.data ?? null) as Record<string, unknown>[] | null;
  if (sanctionsRes.error) {
    const retry = await sb
      .from("published_sanctions")
      .select("player_id, detail, sanction")
      .eq("season_id", season?.id ?? 0)
      .order("sort_order");
    sanctionsData = (retry.data ?? null) as Record<string, unknown>[] | null;
  }

  const cal = calendarState((matchdaysRes.data ?? []) as { number: number; played_on: string | null }[]);
  const ledgerEntry = ((contentRes.data ?? []) as { slug: string; extra?: unknown; body?: string | null }[]).find((c) => c.slug === "sanctions_ledger");
  const sanctionRows = applyLedger((sanctionsData ?? []) as SanctionRow[], readLedger(ledgerEntry?.extra, ledgerEntry?.body ?? null));

  return {
    season: season
      ? {
          id: season.id,
          name: season.name,
          label: season.label,
          year: season.year,
          venue: season.venue,
          status: season.status,
          published_through_matchday: season.published_through_matchday,
          second_round_from: season.second_round_from ?? null,
          total_matchdays: season.total_matchdays ?? null,
        }
      : null,
    teams: ((teamsRes.data ?? []) as {
      id: number;
      name: string;
      slug: string;
      short_name: string | null;
      is_dissolved: boolean;
      is_founding_team: boolean;
    }[]).map((row) => {
      const palm = palmares.get(row.id);
      const shots = (squadsByTeam.get(row.id) ?? []).map((shot) => ({ src: shot.src, caption: shot.caption }));
      const profile = profiles[String(row.id)] ?? {};
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        short_name: row.short_name ?? null,
        bio: profile.bio?.trim() || null,
        campaign: profile.campaign?.trim() || null,
        is_dissolved: row.is_dissolved,
        is_founding_team: row.is_founding_team,
        source_index: sourceByTeam.get(row.id) ?? null,
        logo: logoByTeam.get(row.id) ?? null,
        squad_photo: shots[0]?.src ?? null,
        squad_caption: shots[0]?.caption ?? null,
        squad_photos: shots,
        titles: palm?.titles ?? 0,
        runner_ups: palm?.runner_ups ?? 0,
        last_title: palm?.last_title ?? null,
      };
    }),
    players: playersRaw.map((row) => {
      const st = statsById.get(row.id);
      const twins = (byName.get(row.full_name) ?? []).filter((item) => item.id !== row.id && item.team_id !== row.team_id);
      const profile = playerProfiles[String(row.id)] ?? {};
      const shots = (profile.photos ?? []).filter((shot) => shot.src).map((shot) => ({ src: shot.src, caption: shot.caption?.trim() || null }));
      return {
        id: row.id,
        full_name: row.full_name,
        team_id: row.team_id,
        source_index: row.source_index,
        nick: profile.nick?.trim() || null,
        bio: profile.bio?.trim() || null,
        number: profile.number?.trim() || null,
        position: profile.position?.trim() || null,
        photo: profile.photo?.trim() || shots[0]?.src || null,
        photos: shots,
        matches_played: st?.matches_played ?? 0,
        goals: st?.goals ?? 0,
        yellows: st?.yellows ?? 0,
        reds: st?.reds ?? 0,
        motm: st?.motm ?? 0,
        other_teams: twins.map((item) => ({
          id: item.team_id,
          name: teamNames.get(item.team_id) ?? `#${item.team_id}`,
          player_id: item.id,
        })),
      };
    }),
    tournaments: ((tournamentsRes.data ?? []) as {
      id: number;
      label: string;
      kind: string;
      official_number: number | null;
      champion_team_id: number | null;
      runner_up_team_id: number | null;
      venue: string | null;
      notes: string | null;
      unofficial_winner_name: string | null;
      runner_up_asterisk: boolean;
    }[]).map((row) => {
      const pics = photoByTournament.get(row.id);
      return {
        id: row.id,
        label: row.label,
        kind: row.kind,
        official_number: row.official_number,
        champion: row.champion_team_id ? (teamNames.get(row.champion_team_id) ?? null) : null,
        champion_team_id: row.champion_team_id,
        runner_up: row.runner_up_team_id ? (teamNames.get(row.runner_up_team_id) ?? null) : null,
        runner_up_team_id: row.runner_up_team_id,
        photo: pics?.photo ?? pics?.thumb ?? null,
        thumb: pics?.thumb ?? pics?.photo ?? null,
        venue: row.venue,
        notes: row.notes,
        unofficial_winner: row.unofficial_winner_name ?? null,
        runner_up_asterisk: Boolean(row.runner_up_asterisk),
      };
    }),
    matches: ((matchesRes.data ?? []) as {
      match_id: number;
      matchday_number: number;
      source_key: string;
      home_team_id: number;
      away_team_id: number;
      home_goals: number | null;
      away_goals: number | null;
      status: string;
      kickoff_time: string | null;
      pitch: string | null;
      motm_player_id: number | null;
    }[]).map((row) => {
      const apps = appsByMatch.get(row.match_id) ?? [];
      const live = row.status === "pending" && row.home_goals != null && row.away_goals != null;
      return {
        id: row.match_id,
        matchday_number: row.matchday_number,
        source_key: row.source_key,
        home_team_id: row.home_team_id,
        away_team_id: row.away_team_id,
        home_goals: row.home_goals,
        away_goals: row.away_goals,
        status: row.status,
        kickoff_time: row.kickoff_time,
        pitch: row.pitch,
        motm_player_id: row.motm_player_id,
        motm_source_index: row.motm_player_id != null ? (playerIndex.get(row.motm_player_id) ?? null) : null,
        live,
        sheet: {
          home: sheetSide(apps, true),
          away: sheetSide(apps, false),
        },
      };
    }),
    matchdays: ((matchdaysRes.data ?? []) as { number: number; played_on: string | null }[]).map((row) => ({
      number: row.number,
      played_on: row.played_on,
    })),
    sanctions: (sanctionRows as {
      player_id: number;
      detail: string;
      sanction: string;
      kind?: string;
      duration?: number;
      origin_matchday?: number | null;
      starts_matchday?: number | null;
      voided?: boolean | null;
    }[]).map((row) => {
      const duration = row.duration ?? parseDuration(String(row.sanction ?? ""));
      const starts = row.starts_matchday ?? cal.lastClosed + 1;
      const window = Array.from({ length: duration }, (_, i) => starts + i);
      const served = window.filter((n) => cal.closedNumbers.has(n)).length;
      const remaining = row.voided ? 0 : Math.max(0, duration - served);
      return {
        player_source_index: playerIndex.get(row.player_id) ?? null,
        detail: row.detail,
        sanction: row.sanction,
        remaining,
        origin_matchday: row.origin_matchday ?? null,
        starts_matchday: starts,
        duration,
        kind: row.kind ?? "other",
        active: !row.voided && remaining > 0,
      };
    }).filter((row) => row.active),
    history: ((historyRes.data ?? []) as { body: string; is_lead: boolean; sort_order: number }[]).map((row) => ({
      body: row.body,
      is_lead: row.is_lead,
      sort_order: row.sort_order,
    })),
    content: ((contentRes.data ?? []) as { slug: string; title: string | null; body: string | null; is_visible: boolean }[])
      .filter((row) => row.slug !== "sanctions_ledger" && row.slug !== "team_profiles" && row.slug !== "player_profiles")
      .map((row) => ({
      slug: row.slug,
      title: row.title,
      body: row.body,
      is_visible: row.is_visible,
    })),
  };
}
