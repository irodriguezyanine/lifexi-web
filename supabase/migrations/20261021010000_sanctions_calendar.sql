-- Calendario de sanciones: vigencia por fechas (domingos) e histórico.

alter table public.published_sanctions
  add column if not exists kind text not null default 'other',
  add column if not exists duration smallint not null default 1,
  add column if not exists origin_matchday integer,
  add column if not exists starts_matchday integer,
  add column if not exists issued_on date,
  add column if not exists voided boolean not null default false,
  add column if not exists note text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.published_sanctions
  drop constraint if exists published_sanctions_kind_check;

alter table public.published_sanctions
  add constraint published_sanctions_kind_check
  check (kind in ('yellow_accum', 'second_yellow', 'red', 'other'));

alter table public.published_sanctions
  drop constraint if exists published_sanctions_duration_check;

alter table public.published_sanctions
  add constraint published_sanctions_duration_check
  check (duration between 1 and 16);

create index if not exists published_sanctions_starts_idx
  on public.published_sanctions (season_id, starts_matchday);

create index if not exists published_sanctions_voided_idx
  on public.published_sanctions (voided);

comment on column public.published_sanctions.kind is 'Tipo: acumulación, doble amarilla, roja u otra.';
comment on column public.published_sanctions.duration is 'Fechas (domingos) que debe cumplir.';
comment on column public.published_sanctions.origin_matchday is 'Fecha en que se originó.';
comment on column public.published_sanctions.starts_matchday is 'Primera fecha que debe perder.';
comment on column public.published_sanctions.voided is 'Anulada; queda en histórico, no en la web.';

update public.published_sanctions
set
  duration = case
    when sanction ~* '(^|[^0-9])3([^0-9]|$)' then 3
    when sanction ~* '(^|[^0-9])2([^0-9]|$)' then 2
    else 1
  end,
  kind = case
    when detail ilike '%acumul%' and detail ilike '%doble%' then 'second_yellow'
    when detail ilike '%acumul%' then 'yellow_accum'
    when detail ilike '%doble%' then 'second_yellow'
    when detail ilike '%roja%' or detail ilike '%expuls%' then 'red'
    else 'other'
  end
where origin_matchday is null or starts_matchday is null;

update public.published_sanctions s
set
  origin_matchday = coalesce(
    s.origin_matchday,
    (
      select md.number
      from public.matchdays md
      where md.season_id = s.season_id
        and md.played_on is not null
        and md.played_on < ((timezone('America/Santiago', now()))::date)
      order by md.number desc
      limit 1
    ),
    1
  ),
  starts_matchday = coalesce(
    s.starts_matchday,
    (
      select coalesce(max(md.number), 0) + 1
      from public.matchdays md
      where md.season_id = s.season_id
        and md.played_on is not null
        and md.played_on < ((timezone('America/Santiago', now()))::date)
    )
  )
where s.origin_matchday is null or s.starts_matchday is null;

grant all on table public.published_sanctions to service_role;
