-- LIFEXI: hechos del torneo e historial.
-- La tabla, goleadores, fair play y palmarés se calculan; no se guardan como snapshot.

create or replace function public.discipline_yellows(p_yellows integer, p_reds integer)
returns integer
language sql
immutable
parallel safe
as $$
  select case
    when coalesce(p_reds, 0) > 0 and coalesce(p_yellows, 0) >= 2 then p_yellows - 2
    else coalesce(p_yellows, 0)
  end;
$$;

comment on function public.discipline_yellows(integer, integer) is
  'Amarillas que cuentan: si hay roja y 2+ amarillas en el mismo partido, esas dos no se suman.';

create table public.leagues (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  full_name text,
  founded_year integer,
  founder_name text,
  authorized_by text,
  founding_venue text,
  inaugural_match_on date,
  inaugural_home text,
  inaugural_away text,
  inaugural_kicker text,
  categories_split_year integer,
  logo_path text,
  source_name text,
  source_updated_at timestamptz,
  notes jsonb not null default '{}'::jsonb
);

create table public.categories (
  id bigint generated always as identity primary key,
  league_id bigint not null references public.leagues (id) on delete cascade,
  slug text not null,
  name text not null,
  unique (league_id, slug)
);

create index categories_league_id_idx on public.categories (league_id);

create table public.teams (
  id bigint generated always as identity primary key,
  league_id bigint not null references public.leagues (id) on delete cascade,
  slug text not null unique,
  name text not null unique,
  short_name text,
  is_dissolved boolean not null default false,
  is_founding_team boolean not null default false,
  created_at timestamptz not null default now()
);

create index teams_league_id_idx on public.teams (league_id);

create table public.seasons (
  id bigint generated always as identity primary key,
  league_id bigint not null references public.leagues (id) on delete cascade,
  category_id bigint not null references public.categories (id) on delete cascade,
  year integer not null,
  slug text not null,
  name text not null,
  label text not null,
  kind text not null check (kind in ('anual', 'apertura', 'clausura', 'otro')),
  status text not null check (status in ('in_progress', 'completed', 'suspended', 'unofficial')),
  venue text,
  second_round_from integer not null default 10,
  total_matchdays integer not null,
  published_through_matchday integer,
  points_win integer not null default 3,
  points_draw integer not null default 1,
  fair_play_yellow integer not null default -1,
  fair_play_red integer not null default -4,
  fair_play_half_wo integer not null default -6,
  fair_play_full_wo integer not null default -12,
  yellows_for_suspension integer not null default 4,
  unique (league_id, category_id, slug)
);

create index seasons_league_id_idx on public.seasons (league_id);
create index seasons_category_id_idx on public.seasons (category_id);

create table public.season_teams (
  id bigint generated always as identity primary key,
  season_id bigint not null references public.seasons (id) on delete cascade,
  team_id bigint not null references public.teams (id) on delete restrict,
  source_index integer not null,
  unique (season_id, team_id),
  unique (season_id, source_index)
);

create index season_teams_team_id_idx on public.season_teams (team_id);

create table public.players (
  id bigint generated always as identity primary key,
  season_id bigint not null references public.seasons (id) on delete cascade,
  team_id bigint not null references public.teams (id) on delete restrict,
  full_name text not null,
  source_index integer not null,
  unique (season_id, source_index)
);

create index players_season_id_idx on public.players (season_id);
create index players_team_id_idx on public.players (team_id);
create index players_full_name_idx on public.players (full_name);

create table public.matchdays (
  id bigint generated always as identity primary key,
  season_id bigint not null references public.seasons (id) on delete cascade,
  number integer not null,
  played_on date,
  round_number integer not null check (round_number in (1, 2)),
  league_site_number integer,
  unique (season_id, number)
);

create index matchdays_season_id_idx on public.matchdays (season_id);

create table public.matches (
  id bigint generated always as identity primary key,
  season_id bigint not null references public.seasons (id) on delete cascade,
  matchday_id bigint not null references public.matchdays (id) on delete cascade,
  sort_order integer not null,
  kickoff_time time,
  pitch text,
  home_team_id bigint not null references public.teams (id) on delete restrict,
  away_team_id bigint not null references public.teams (id) on delete restrict,
  home_goals integer,
  away_goals integer,
  status text not null check (status in ('played', 'scheduled', 'pending')),
  motm_player_id bigint references public.players (id) on delete set null,
  source_key text not null,
  unique (season_id, source_key),
  unique (matchday_id, home_team_id, away_team_id),
  check (home_team_id <> away_team_id),
  check (
    (status = 'played' and home_goals is not null and away_goals is not null)
    or (status <> 'played' and home_goals is null and away_goals is null)
  )
);

create index matches_season_id_idx on public.matches (season_id);
create index matches_matchday_id_idx on public.matches (matchday_id);
create index matches_home_team_id_idx on public.matches (home_team_id);
create index matches_away_team_id_idx on public.matches (away_team_id);
create index matches_motm_player_id_idx on public.matches (motm_player_id);
create index matches_status_idx on public.matches (status);

create table public.match_appearances (
  id bigint generated always as identity primary key,
  match_id bigint not null references public.matches (id) on delete cascade,
  player_id bigint not null references public.players (id) on delete restrict,
  team_id bigint not null references public.teams (id) on delete restrict,
  is_home boolean not null,
  goals integer not null default 0 check (goals >= 0),
  yellows integer not null default 0 check (yellows >= 0),
  reds integer not null default 0 check (reds >= 0),
  own_goals integer not null default 0 check (own_goals >= 0),
  is_motm boolean not null default false,
  unique (match_id, player_id)
);

create index match_appearances_match_id_idx on public.match_appearances (match_id);
create index match_appearances_player_id_idx on public.match_appearances (player_id);
create index match_appearances_team_id_idx on public.match_appearances (team_id);

create table public.published_sanctions (
  id bigint generated always as identity primary key,
  season_id bigint not null references public.seasons (id) on delete cascade,
  player_id bigint not null references public.players (id) on delete restrict,
  detail text not null,
  sanction text not null,
  sort_order integer not null
);

create index published_sanctions_season_id_idx on public.published_sanctions (season_id);
create index published_sanctions_player_id_idx on public.published_sanctions (player_id);

create table public.historical_tournaments (
  id bigint generated always as identity primary key,
  league_id bigint not null references public.leagues (id) on delete cascade,
  category_id bigint not null references public.categories (id) on delete cascade,
  season_id bigint references public.seasons (id) on delete set null,
  official_number integer,
  label text not null,
  venue text,
  notes text,
  kind text not null check (kind in ('oficial', 'suspendido', 'nooficial', 'encurso')),
  champion_team_id bigint references public.teams (id) on delete restrict,
  runner_up_team_id bigint references public.teams (id) on delete restrict,
  runner_up_asterisk boolean not null default false,
  disqualified_team_id bigint references public.teams (id) on delete restrict,
  pitch_result text,
  unofficial_winner_name text,
  photo_note text,
  counts_as_final boolean not null default true,
  sort_order integer not null,
  unique (league_id, category_id, label)
);

create index historical_tournaments_league_id_idx on public.historical_tournaments (league_id);
create index historical_tournaments_category_id_idx on public.historical_tournaments (category_id);
create index historical_tournaments_season_id_idx on public.historical_tournaments (season_id);
create index historical_tournaments_champion_team_id_idx on public.historical_tournaments (champion_team_id);
create index historical_tournaments_runner_up_team_id_idx on public.historical_tournaments (runner_up_team_id);
create index historical_tournaments_disqualified_team_id_idx on public.historical_tournaments (disqualified_team_id);

create table public.media (
  id bigint generated always as identity primary key,
  kind text not null check (kind in (
    'league_logo',
    'team_logo',
    'squad_photo',
    'champion_photo',
    'champion_thumb',
    'history_photo',
    'motm_photo'
  )),
  object_path text not null,
  width integer,
  height integer,
  caption text,
  alt_text text,
  team_id bigint references public.teams (id) on delete cascade,
  historical_tournament_id bigint references public.historical_tournaments (id) on delete cascade,
  match_id bigint references public.matches (id) on delete cascade,
  sort_key text,
  unique (kind, object_path)
);

create index media_kind_idx on public.media (kind);
create index media_team_id_idx on public.media (team_id);
create index media_historical_tournament_id_idx on public.media (historical_tournament_id);
create index media_match_id_idx on public.media (match_id);

create table public.league_history_entries (
  id bigint generated always as identity primary key,
  league_id bigint not null references public.leagues (id) on delete cascade,
  sort_order integer not null,
  body text not null,
  is_lead boolean not null default false
);

create index league_history_entries_league_id_idx on public.league_history_entries (league_id);

comment on table public.leagues is 'Liga LIFEXI (exalumnos ignacianos).';
comment on table public.categories is 'Categorías (Junior, y más adelante Senior).';
comment on table public.teams is 'Equipos actuales e históricos. Nombres duplicados en un plantel son jugadores distintos.';
comment on table public.seasons is 'Torneo concreto. Las reglas de puntaje y fair play viven aquí.';
comment on table public.season_teams is 'Inscripción de un equipo en un torneo. source_index es el índice de EQUIPOS en el sitio.';
comment on table public.players is 'Plantel de un torneo. source_index conserva el índice de JUGADORES, aunque el nombre se repita.';
comment on table public.matchdays is 'Fechas 1–N del calendario, jugadas o no.';
comment on table public.matches is 'Partidos. pending = programado en una fecha ya abierta pero sin resultado (ej. fecha 10).';
comment on table public.match_appearances is 'Planilla: goles, tarjetas y autogoles por jugador y partido.';
comment on table public.published_sanctions is 'Sanciones publicadas por la liga, tal cual el sitio.';
comment on table public.historical_tournaments is 'Campeones históricos Junior. Palmarés y finales se derivan de aquí.';
comment on table public.media is 'Rutas de imágenes del sitio (logos, planteles, campeones, estrellas).';
comment on table public.league_history_entries is 'Párrafos de la pestaña Historia.';

create or replace view public.v_player_season_stats
with (security_invoker = true) as
select
  p.id as player_id,
  p.season_id,
  p.team_id,
  t.name as team_name,
  p.full_name,
  p.source_index,
  count(a.id)::integer as matches_played,
  coalesce(sum(a.goals), 0)::integer as goals,
  coalesce(sum(public.discipline_yellows(a.yellows, a.reds)), 0)::integer as yellows,
  coalesce(sum(a.reds), 0)::integer as reds,
  coalesce(sum(a.own_goals), 0)::integer as own_goals,
  count(a.id) filter (where a.is_motm)::integer as motm
from public.players p
join public.teams t on t.id = p.team_id
left join public.match_appearances a on a.player_id = p.id
group by p.id, p.season_id, p.team_id, t.name, p.full_name, p.source_index;

comment on view public.v_player_season_stats is
  'Estadísticas de jugador calculadas desde planillas. Las amarillas siguen la regla de doble amarilla.';

create or replace view public.v_team_season_stats
with (security_invoker = true) as
with played as (
  select
    m.season_id,
    m.id as match_id,
    m.home_team_id,
    m.away_team_id,
    m.home_goals,
    m.away_goals
  from public.matches m
  where m.status = 'played'
),
team_matches as (
  select
    p.season_id,
    p.home_team_id as team_id,
    1 as pj,
    case when p.home_goals > p.away_goals then 1 else 0 end as pg,
    case when p.home_goals = p.away_goals then 1 else 0 end as pe,
    case when p.home_goals < p.away_goals then 1 else 0 end as pp,
    p.home_goals as gf,
    p.away_goals as gc
  from played p
  union all
  select
    p.season_id,
    p.away_team_id,
    1,
    case when p.away_goals > p.home_goals then 1 else 0 end,
    case when p.away_goals = p.home_goals then 1 else 0 end,
    case when p.away_goals < p.home_goals then 1 else 0 end,
    p.away_goals,
    p.home_goals
  from played p
),
cards as (
  select
    m.season_id,
    a.team_id,
    sum(public.discipline_yellows(a.yellows, a.reds))::integer as ta,
    sum(a.reds)::integer as tr
  from public.match_appearances a
  join public.matches m on m.id = a.match_id
  where m.status = 'played'
  group by m.season_id, a.team_id
)
select
  st.season_id,
  st.team_id,
  t.name as team_name,
  st.source_index,
  coalesce(sum(tm.pj), 0)::integer as pj,
  coalesce(sum(tm.pg), 0)::integer as pg,
  coalesce(sum(tm.pe), 0)::integer as pe,
  coalesce(sum(tm.pp), 0)::integer as pp,
  coalesce(sum(tm.gf), 0)::integer as gf,
  coalesce(sum(tm.gc), 0)::integer as gc,
  (coalesce(sum(tm.gf), 0) - coalesce(sum(tm.gc), 0))::integer as dg,
  coalesce(c.ta, 0) as ta,
  coalesce(c.tr, 0) as tr,
  (0 - coalesce(c.ta, 0) - 4 * coalesce(c.tr, 0))::integer as fp,
  (coalesce(sum(tm.pg), 0) * 3 + coalesce(sum(tm.pe), 0))::integer as pts
from public.season_teams st
join public.teams t on t.id = st.team_id
left join team_matches tm on tm.season_id = st.season_id and tm.team_id = st.team_id
left join cards c on c.season_id = st.season_id and c.team_id = st.team_id
group by st.season_id, st.team_id, t.name, st.source_index, c.ta, c.tr;

comment on view public.v_team_season_stats is
  'Totales de equipo sobre partidos jugados: puntos, goles y fair play (-1 amarilla, -4 roja).';

create or replace view public.v_match_calendar
with (security_invoker = true) as
select
  m.id as match_id,
  m.season_id,
  md.id as matchday_id,
  md.number as matchday_number,
  md.played_on,
  md.round_number,
  md.league_site_number,
  m.sort_order,
  m.kickoff_time,
  m.pitch,
  m.status,
  m.source_key,
  m.home_team_id,
  home.name as home_team,
  m.away_team_id,
  away.name as away_team,
  m.home_goals,
  m.away_goals,
  m.motm_player_id,
  motm.full_name as motm_name
from public.matches m
join public.matchdays md on md.id = m.matchday_id
join public.teams home on home.id = m.home_team_id
join public.teams away on away.id = m.away_team_id
left join public.players motm on motm.id = m.motm_player_id;

create or replace view public.v_palmares
with (security_invoker = true) as
select
  t.id as team_id,
  t.name as team_name,
  t.is_dissolved,
  count(*) filter (where h.champion_team_id = t.id)::integer as titles,
  count(*) filter (where h.runner_up_team_id = t.id)::integer as runner_ups,
  (array_agg(h.label order by h.sort_order desc) filter (where h.champion_team_id = t.id))[1] as last_title
from public.teams t
join public.historical_tournaments h
  on h.champion_team_id = t.id or h.runner_up_team_id = t.id
group by t.id, t.name, t.is_dissolved
having count(*) filter (where h.champion_team_id = t.id) > 0;

comment on view public.v_palmares is
  'Títulos oficiales. No incluye Copa COVID. Un descalificado no figura como subcampeón.';

create or replace view public.v_finalists
with (security_invoker = true) as
with finales as (
  select *
  from public.historical_tournaments
  where kind = 'oficial'
    and counts_as_final
    and champion_team_id is not null
),
rows as (
  select champion_team_id as team_id, 1 as played, 1 as won, 0 as lost
  from finales
  union all
  select coalesce(runner_up_team_id, disqualified_team_id), 1, 0, 1
  from finales
  where coalesce(runner_up_team_id, disqualified_team_id) is not null
)
select
  t.id as team_id,
  t.name as team_name,
  sum(r.played)::integer as finals_played,
  sum(r.won)::integer as finals_won,
  sum(r.lost)::integer as finals_lost
from rows r
join public.teams t on t.id = r.team_id
group by t.id, t.name;

comment on view public.v_finalists is
  'Finales oficiales con definición. 2017 (por puntos) y Copa COVID no cuentan. Un descalificado suma final jugada y perdida.';

create or replace view public.v_repeated_finals
with (security_invoker = true) as
with finales as (
  select
    label,
    champion_team_id,
    coalesce(runner_up_team_id, disqualified_team_id) as rival_team_id,
    coalesce(disqualified_team_id, case when pitch_result = 'empate' then null else champion_team_id end) as pitch_winner_team_id,
    pitch_result
  from public.historical_tournaments
  where kind = 'oficial'
    and counts_as_final
    and champion_team_id is not null
    and coalesce(runner_up_team_id, disqualified_team_id) is not null
),
pairs as (
  select
    least(champion_team_id, rival_team_id) as team_a_id,
    greatest(champion_team_id, rival_team_id) as team_b_id,
    count(*)::integer as times
  from finales
  group by 1, 2
)
select
  p.team_a_id,
  a.name as team_a,
  p.team_b_id,
  b.name as team_b,
  p.times
from pairs p
join public.teams a on a.id = p.team_a_id
join public.teams b on b.id = p.team_b_id;

create or replace function public.season_standings(p_season_id bigint, p_through integer default null)
returns table (
  pos integer,
  team_id bigint,
  team_name text,
  source_index integer,
  pj integer,
  pg integer,
  pe integer,
  pp integer,
  gf integer,
  gc integer,
  dg integer,
  ta integer,
  tr integer,
  fp integer,
  pts integer,
  sorteo integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with cutoff as (
    select coalesce(
      p_through,
      s.published_through_matchday,
      s.total_matchdays
    ) as n
    from public.seasons s
    where s.id = p_season_id
  ),
  played as (
    select
      m.id,
      md.number as matchday_number,
      m.home_team_id,
      m.away_team_id,
      m.home_goals,
      m.away_goals
    from public.matches m
    join public.matchdays md on md.id = m.matchday_id
    join cutoff c on true
    where m.season_id = p_season_id
      and m.status = 'played'
      and md.number <= c.n
  ),
  team_matches as (
    select
      home_team_id as team_id,
      1 as pj,
      case when home_goals > away_goals then 1 else 0 end as pg,
      case when home_goals = away_goals then 1 else 0 end as pe,
      case when home_goals < away_goals then 1 else 0 end as pp,
      home_goals as gf,
      away_goals as gc
    from played
    union all
    select
      away_team_id,
      1,
      case when away_goals > home_goals then 1 else 0 end,
      case when away_goals = home_goals then 1 else 0 end,
      case when away_goals < home_goals then 1 else 0 end,
      away_goals,
      home_goals
    from played
  ),
  cards as (
    select
      a.team_id,
      sum(public.discipline_yellows(a.yellows, a.reds))::integer as ta,
      sum(a.reds)::integer as tr
    from public.match_appearances a
    join played p on p.id = a.match_id
    group by a.team_id
  ),
  stats as (
    select
      st.team_id,
      t.name as team_name,
      st.source_index,
      coalesce(sum(tm.pj), 0)::integer as pj,
      coalesce(sum(tm.pg), 0)::integer as pg,
      coalesce(sum(tm.pe), 0)::integer as pe,
      coalesce(sum(tm.pp), 0)::integer as pp,
      coalesce(sum(tm.gf), 0)::integer as gf,
      coalesce(sum(tm.gc), 0)::integer as gc,
      (coalesce(sum(tm.gf), 0) - coalesce(sum(tm.gc), 0))::integer as dg,
      coalesce(c.ta, 0) as ta,
      coalesce(c.tr, 0) as tr,
      (0 - coalesce(c.ta, 0) - 4 * coalesce(c.tr, 0))::integer as fp,
      (coalesce(sum(tm.pg), 0) * 3 + coalesce(sum(tm.pe), 0))::integer as pts
    from public.season_teams st
    join public.teams t on t.id = st.team_id
    left join team_matches tm on tm.team_id = st.team_id
    left join cards c on c.team_id = st.team_id
    where st.season_id = p_season_id
    group by st.team_id, t.name, st.source_index, c.ta, c.tr
  ),
  grouped as (
    select
      s.*,
      rank() over (order by s.pts desc, s.dg desc, s.fp desc, s.gf desc) as grp
    from stats s
  ),
  h2h as (
    select
      g.team_id,
      g.grp,
      coalesce(sum(
        case
          when p.home_team_id = g.team_id and p.away_team_id in (select g2.team_id from grouped g2 where g2.grp = g.grp) then
            case
              when p.home_goals > p.away_goals then 3
              when p.home_goals = p.away_goals then 1
              else 0
            end
          when p.away_team_id = g.team_id and p.home_team_id in (select g2.team_id from grouped g2 where g2.grp = g.grp) then
            case
              when p.away_goals > p.home_goals then 3
              when p.away_goals = p.home_goals then 1
              else 0
            end
          else 0
        end
      ), 0)::integer as h2h_pts,
      coalesce(sum(
        case
          when p.home_team_id = g.team_id and p.away_team_id in (select g2.team_id from grouped g2 where g2.grp = g.grp)
            then p.home_goals - p.away_goals
          when p.away_team_id = g.team_id and p.home_team_id in (select g2.team_id from grouped g2 where g2.grp = g.grp)
            then p.away_goals - p.home_goals
          else 0
        end
      ), 0)::integer as h2h_dg
    from grouped g
    left join played p
      on p.home_team_id = g.team_id or p.away_team_id = g.team_id
    group by g.team_id, g.grp
  ),
  ordered as (
    select
      g.*,
      h.h2h_pts,
      h.h2h_dg,
      count(*) over (partition by g.grp, h.h2h_pts, h.h2h_dg) as tie_count,
      dense_rank() over (order by g.grp, h.h2h_pts desc, h.h2h_dg desc) as tie_mark
    from grouped g
    join h2h h on h.team_id = g.team_id
  )
  select
    row_number() over (
      order by o.pts desc, o.dg desc, o.fp desc, o.gf desc, o.h2h_pts desc, o.h2h_dg desc, o.team_name
    )::integer as pos,
    o.team_id,
    o.team_name,
    o.source_index,
    o.pj,
    o.pg,
    o.pe,
    o.pp,
    o.gf,
    o.gc,
    o.dg,
    o.ta,
    o.tr,
    o.fp,
    o.pts,
    case when o.tie_count > 1 then o.tie_mark else 0 end::integer as sorteo
  from ordered o
  order by pos;
$$;

comment on function public.season_standings(bigint, integer) is
  'Tabla del torneo hasta una fecha. Desempate: puntos, DG, fair play, GF, resultado directo, sorteo.';

create or replace function public.reset_competition_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not allowed';
  end if;

  truncate table
    public.match_appearances,
    public.published_sanctions,
    public.media,
    public.matches,
    public.matchdays,
    public.players,
    public.season_teams,
    public.historical_tournaments,
    public.league_history_entries,
    public.seasons,
    public.teams,
    public.categories,
    public.leagues
    restart identity cascade;
end;
$$;

revoke all on function public.reset_competition_data() from public, anon, authenticated;
grant execute on function public.reset_competition_data() to service_role;

alter table public.leagues enable row level security;
alter table public.categories enable row level security;
alter table public.teams enable row level security;
alter table public.seasons enable row level security;
alter table public.season_teams enable row level security;
alter table public.players enable row level security;
alter table public.matchdays enable row level security;
alter table public.matches enable row level security;
alter table public.match_appearances enable row level security;
alter table public.published_sanctions enable row level security;
alter table public.historical_tournaments enable row level security;
alter table public.media enable row level security;
alter table public.league_history_entries enable row level security;

create policy "public read leagues" on public.leagues for select to anon, authenticated using (true);
create policy "public read categories" on public.categories for select to anon, authenticated using (true);
create policy "public read teams" on public.teams for select to anon, authenticated using (true);
create policy "public read seasons" on public.seasons for select to anon, authenticated using (true);
create policy "public read season_teams" on public.season_teams for select to anon, authenticated using (true);
create policy "public read players" on public.players for select to anon, authenticated using (true);
create policy "public read matchdays" on public.matchdays for select to anon, authenticated using (true);
create policy "public read matches" on public.matches for select to anon, authenticated using (true);
create policy "public read match_appearances" on public.match_appearances for select to anon, authenticated using (true);
create policy "public read published_sanctions" on public.published_sanctions for select to anon, authenticated using (true);
create policy "public read historical_tournaments" on public.historical_tournaments for select to anon, authenticated using (true);
create policy "public read media" on public.media for select to anon, authenticated using (true);
create policy "public read league_history_entries" on public.league_history_entries for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;

grant select on
  public.leagues,
  public.categories,
  public.teams,
  public.seasons,
  public.season_teams,
  public.players,
  public.matchdays,
  public.matches,
  public.match_appearances,
  public.published_sanctions,
  public.historical_tournaments,
  public.media,
  public.league_history_entries,
  public.v_player_season_stats,
  public.v_team_season_stats,
  public.v_match_calendar,
  public.v_palmares,
  public.v_finalists,
  public.v_repeated_finals
to anon, authenticated;

grant execute on function public.discipline_yellows(integer, integer) to anon, authenticated, service_role;
grant execute on function public.season_standings(bigint, integer) to anon, authenticated, service_role;
