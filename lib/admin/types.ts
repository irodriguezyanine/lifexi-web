export type EventKind =
  | "goal"
  | "own_goal"
  | "penalty"
  | "penalty_missed"
  | "yellow"
  | "second_yellow"
  | "red"
  | "assist";

export type MatchStatus = "played" | "scheduled" | "pending";

export type DraftEvent = {
  key: string;
  kind: EventKind;
  teamId: number;
  playerId: number | null;
  assistPlayerId: number | null;
  minute: string;
  extra: string;
  notes: string;
};

export type PlayerRow = {
  id: number;
  full_name: string;
  team_id: number;
  source_index: number;
};

export type TeamRow = {
  id: number;
  name: string;
  slug: string;
  is_dissolved: boolean;
  is_founding_team: boolean;
};

export type AppearanceRow = {
  id: number;
  player_id: number;
  team_id: number;
  is_home: boolean;
  goals: number;
  yellows: number;
  reds: number;
  own_goals: number;
  is_motm: boolean;
};

export type MatchEventRow = {
  id: number;
  match_id: number;
  team_id: number;
  player_id: number | null;
  kind: EventKind;
  minute: number | null;
  extra_minute: number | null;
  assist_player_id: number | null;
  notes: string | null;
  sort_order: number;
};

export type DossierEvent = {
  kind: EventKind;
  minute: number | null;
  extra_minute: number | null;
  notes: string | null;
  as_assist: boolean;
};

export type DossierMatch = {
  match_id: number;
  matchday_number: number;
  round_number: number;
  played_on: string | null;
  kickoff_time: string | null;
  pitch: string | null;
  status: MatchStatus;
  opponent: string;
  opponent_id: number;
  is_home: boolean;
  home_team: string;
  away_team: string;
  home_goals: number | null;
  away_goals: number | null;
  result: "W" | "D" | "L" | null;
  goals: number;
  yellows: number;
  reds: number;
  own_goals: number;
  is_motm: boolean;
  events: DossierEvent[];
};

export type DossierTournament = {
  id: number;
  label: string;
  kind: string;
  official_number: number | null;
  venue: string | null;
  clubRole: "champion" | "runner" | "dq" | "current" | null;
  champion: string | null;
  runner_up: string | null;
  photo: string | null;
  isCurrent: boolean;
};

export type DossierStint = {
  player_id: number;
  season_id: number;
  season_name: string;
  year: number;
  status: string;
  team_id: number;
  team_name: string;
  matches_played: number;
  goals: number;
  yellows: number;
  reds: number;
  motm: number;
  current: boolean;
};

export type PlayerShot = {
  src: string;
  caption: string;
};

export type PlayerDossier = {
  player: {
    id: number;
    full_name: string;
    team_id: number;
    source_index: number;
    season_id: number;
    nick: string;
    bio: string;
    number: string;
    position: string;
    photo: string | null;
    photos: PlayerShot[];
  };
  teams: { id: number; name: string }[];
  team: {
    id: number;
    name: string;
    slug: string;
    is_dissolved: boolean;
    is_founding_team: boolean;
    logo: string | null;
    squad_photo: string | null;
  };
  season: {
    id: number;
    name: string;
    label: string;
    year: number;
    venue: string | null;
    status: string;
    published_through_matchday: number | null;
    total_matchdays: number;
    second_round_from: number;
    yellows_for_suspension: number;
  };
  stats: {
    matches_played: number;
    goals: number;
    yellows: number;
    reds: number;
    own_goals: number;
    motm: number;
    assists: number;
    penalties: number;
    missed_penalties: number;
    second_yellows: number;
    fp: number;
    wins: number;
    draws: number;
    losses: number;
    league_goal_rank: number | null;
    team_goal_rank: number | null;
    team_table_place: number | null;
    team_played: number;
    first_appearance: string | null;
    last_appearance: string | null;
    streak: number;
    yellows_to_ban: number;
    goals_by_matchday: number[];
    round1: { pj: number; goals: number };
    round2: { pj: number; goals: number };
  };
  matches: DossierMatch[];
  sanctions: {
    id: number;
    detail: string;
    sanction: string;
    duration?: number | null;
    starts_matchday?: number | null;
    origin_matchday?: number | null;
    voided?: boolean | null;
  }[];
  homonyms: { id: number; team: string; team_id: number }[];
  clubs: PlayerClub[];
  stints: DossierStint[];
  tournaments: DossierTournament[];
  club: { titles: number; runner_ups: number; last_title: string | null };
};

export type PlayerClub = {
  team_id: number;
  team_name: string;
  logo: string | null;
  current: boolean;
  related: boolean;
  player_id: number;
  matches_played: number;
  goals: number;
};

export type TeamDossierPlayer = {
  id: number;
  full_name: string;
  source_index: number;
  matches_played: number;
  goals: number;
  yellows: number;
  reds: number;
  motm: number;
  otherClubs: { team_id: number; team_name: string; player_id: number }[];
};

export type TeamDossierTitle = {
  id: number;
  label: string;
  kind: string;
  official_number: number | null;
  venue: string | null;
  notes: string | null;
  role: "champion" | "runner" | "dq" | "current";
  champion: string | null;
  runner_up: string | null;
  champion_team_id: number | null;
  runner_up_team_id: number | null;
  photo: string | null;
  thumb: string | null;
  photo_id: number | null;
  thumb_id: number | null;
  photo_path: string | null;
  thumb_path: string | null;
};

export type TeamDossierMatch = {
  match_id: number;
  matchday_number: number;
  round_number: number;
  played_on: string | null;
  kickoff_time: string | null;
  status: MatchStatus;
  is_home: boolean;
  opponent: string;
  opponent_id: number;
  home_goals: number | null;
  away_goals: number | null;
  result: "W" | "D" | "L" | null;
  motm_name: string | null;
};

export type TeamMediaShot = {
  id: number;
  src: string;
  path: string;
  caption: string | null;
  sort_key: string | null;
};

export type TeamDossier = {
  team: {
    id: number;
    name: string;
    slug: string;
    short_name: string | null;
    bio: string;
    campaign: string;
    is_dissolved: boolean;
    is_founding_team: boolean;
    logo: string | null;
    logo_id: number | null;
    logo_path: string | null;
    squad_photos: TeamMediaShot[];
  };
  season: {
    id: number;
    name: string;
    year: number;
    venue: string | null;
    status: string;
    published_through_matchday: number | null;
    total_matchdays: number;
  };
  table: {
    pos: number | null;
    pts: number;
    pj: number;
    pg: number;
    pe: number;
    pp: number;
    gf: number;
    gc: number;
    dg: number;
    ta: number;
    tr: number;
    fp: number;
  };
  roster: TeamDossierPlayer[];
  alumni: TeamDossierPlayer[];
  titles: TeamDossierTitle[];
  matches: TeamDossierMatch[];
  club: {
    titles: number;
    runner_ups: number;
    last_title: string | null;
    finals_played: number;
    finals_won: number;
  };
};

export type CalendarMatch = {
  match_id: number;
  season_id: number;
  matchday_id: number;
  matchday_number: number;
  played_on: string | null;
  round_number: number;
  league_site_number: number | null;
  sort_order: number;
  kickoff_time: string | null;
  pitch: string | null;
  status: MatchStatus;
  source_key: string;
  home_team_id: number;
  home_team: string;
  away_team_id: number;
  away_team: string;
  home_goals: number | null;
  away_goals: number | null;
  motm_player_id: number | null;
  motm_name: string | null;
};

export type ChampionKind = "oficial" | "nooficial" | "suspendido" | "encurso";

export type ChampionShot = {
  id: number;
  kind: "champion_photo" | "champion_thumb";
  src: string;
  path: string;
  caption: string | null;
  sort_key: string | null;
  width: number | null;
  height: number | null;
};

export type ChampionTeamOpt = {
  id: number;
  name: string;
  is_dissolved: boolean;
};

export type ChampionDossier = {
  tournament: {
    id: number;
    official_number: number | null;
    label: string;
    venue: string | null;
    notes: string | null;
    kind: ChampionKind;
    champion_team_id: number | null;
    runner_up_team_id: number | null;
    runner_up_asterisk: boolean;
    disqualified_team_id: number | null;
    pitch_result: string | null;
    unofficial_winner_name: string | null;
    photo_note: string | null;
    counts_as_final: boolean;
    sort_order: number;
  };
  teams: ChampionTeamOpt[];
  photos: ChampionShot[];
  usedNumbers: number[];
  usedLabels: string[];
  venues: string[];
  currentId: number | null;
};
