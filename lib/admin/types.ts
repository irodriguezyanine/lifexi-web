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
