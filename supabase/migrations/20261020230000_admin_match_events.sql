-- Eventos de partido (gol/tarjeta con minuto), contenido de portada y acceso admin.

alter table public.matches
  add column if not exists notes text,
  add column if not exists referee text,
  add column if not exists walkover text
    check (walkover is null or walkover in ('none', 'home', 'away', 'half_home', 'half_away')),
  add column if not exists updated_at timestamptz not null default now();

create table public.match_events (
  id bigint generated always as identity primary key,
  match_id bigint not null references public.matches (id) on delete cascade,
  team_id bigint not null references public.teams (id) on delete restrict,
  player_id bigint references public.players (id) on delete restrict,
  kind text not null check (kind in (
    'goal',
    'own_goal',
    'penalty',
    'penalty_missed',
    'yellow',
    'second_yellow',
    'red',
    'assist'
  )),
  minute integer check (minute is null or (minute >= 0 and minute <= 130)),
  extra_minute integer check (extra_minute is null or extra_minute >= 0),
  period text check (period is null or period in ('1h', '2h', 'et', 'pen')),
  assist_player_id bigint references public.players (id) on delete set null,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index match_events_match_id_idx on public.match_events (match_id);
create index match_events_team_id_idx on public.match_events (team_id);
create index match_events_player_id_idx on public.match_events (player_id);
create index match_events_assist_player_id_idx on public.match_events (assist_player_id);
create index match_events_kind_idx on public.match_events (kind);

comment on table public.match_events is
  'Goles y tarjetas con minuto. La planilla (match_appearances) sigue siendo la presencia; esto es el relato del partido.';

create table public.site_content (
  id bigint generated always as identity primary key,
  slug text not null unique,
  area text not null,
  title text,
  body text,
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.site_content is 'Textos y bloques editables de la portada y pestañas públicas.';

create table public.admin_users (
  username text primary key,
  password_hash text not null,
  display_name text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  entity text not null,
  entity_id text,
  summary text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

alter table public.match_events enable row level security;
alter table public.site_content enable row level security;
alter table public.admin_users enable row level security;
alter table public.audit_log enable row level security;

create policy "public read match_events" on public.match_events
  for select to anon, authenticated using (true);
create policy "public read site_content" on public.site_content
  for select to anon, authenticated using (true);

grant select on public.match_events, public.site_content to anon, authenticated;
grant all privileges on public.match_events, public.site_content, public.admin_users, public.audit_log to service_role;
grant all privileges on all sequences in schema public to service_role;

insert into public.site_content (slug, area, title, body, sort_order, extra) values
  ('construction_banner', 'home', 'Sitio en construcción', null, 10, '{"visible": true}'::jsonb),
  ('home_subtitle', 'home', 'Junior · Torneo Apertura 2026', null, 20, '{}'::jsonb),
  ('tab_fechas', 'home', 'Fechas', null, 30, '{"visible": true}'::jsonb),
  ('tab_equipos', 'home', 'Equipos', null, 40, '{"visible": true}'::jsonb),
  ('tab_lideres', 'home', 'Goleadores y Tarjetas', null, 50, '{"visible": true}'::jsonb),
  ('tab_fair', 'home', 'Fair Play', null, 60, '{"visible": true}'::jsonb),
  ('tab_sim', 'home', 'Simulador', null, 70, '{"visible": true}'::jsonb),
  ('tab_camp', 'home', 'Campeones', null, 80, '{"visible": true}'::jsonb),
  ('tab_hist', 'home', 'Historia', null, 90, '{"visible": true}'::jsonb),
  ('footer_source', 'home', 'Fuente', 'Datos tomados de lifexi.refereepro.com, según la actualización del 18 de octubre de 2026 a las 15:43.', 100, '{}'::jsonb),
  ('footer_table_rules', 'home', 'Reglas de tabla', 'La tabla suma 3 puntos por triunfo, 1 por empate y 0 por derrota. Si hay igualdad de puntos se desempata en este orden: diferencia de gol, puntaje Fair Play, goles a favor, resultado directo entre los equipos igualados y sorteo.', 110, '{}'::jsonb),
  ('footer_fair_play', 'home', 'Reglas Fair Play', 'El puntaje Fair Play descuenta 1 punto por tarjeta amarilla, 4 por tarjeta roja, 6 por medio W.O. y 12 por W.O. completo. Una expulsión por doble amarilla cuenta solo como roja.', 120, '{}'::jsonb),
  ('sanctions_note', 'sanciones', 'Nota', 'Según la tabla de sanciones 2026 de la categoría Junior publicada por LIFEXI.', 130, '{}'::jsonb)
on conflict (slug) do nothing;
