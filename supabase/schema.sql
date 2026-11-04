-- ECO Professional DP Generator – Supabase / Postgres schema
-- NO photographs or image data are stored in this database.
-- Access is server-side only via the service-role key; RLS is enabled with NO policies, so the
-- public anon key cannot read or write anything.

create table if not exists participants (
  id                    uuid primary key,
  staff_id              text,
  category              text check (category in ('corporate','ccr_chauffeur','ets_chauffeur')),
  branch                text,
  consent_version       text,
  consent_at            timestamptz,
  generated_count       integer not null default 0,
  first_generated_at    timestamptz,
  download_count        integer not null default 0,
  first_downloaded_at   timestamptz,
  whatsapp_confirmed_at timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists participants_updated_idx on participants (updated_at);

create table if not exists consent_events (
  id             uuid primary key,
  participant_id uuid not null,
  action         text not null check (action in ('granted','withdrawn')),
  notice_version text not null,
  lang           text not null,
  created_at     timestamptz not null default now()
);
create index if not exists consent_events_created_idx on consent_events (created_at);

create table if not exists privacy_requests (
  id             uuid primary key,
  reference      text not null unique,
  participant_id uuid,
  request_type   text not null,
  contact        text,
  message        text not null,
  status         text not null default 'open' check (status in ('open','in_progress','closed')),
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);

create table if not exists admin_audit (
  id         uuid primary key,
  actor      text not null,
  action     text not null,
  detail     text,
  created_at timestamptz not null default now()
);

alter table participants     enable row level security;
alter table consent_events   enable row level security;
alter table privacy_requests enable row level security;
alter table admin_audit      enable row level security;
-- Intentionally no policies: only the server (service role) can access these tables.
