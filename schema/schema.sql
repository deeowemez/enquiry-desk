-- Project 01 — Enquiry Desk. Four tables; that's the whole thing.

create table enquiry (
  id            uuid primary key,
  source        text        not null check (source in ('form','email')),
  external_key  text        not null unique,     -- idempotency anchor
  received_at   timestamptz not null,
  from_email    text not null,
  subject       text,
  body          text        not null,
  category      text,
  confidence    numeric(3,2),
  language      text,
  safety_flags  jsonb       not null default '[]',
  missing_slots jsonb       not null default '[]',
  action        text        check (action in ('auto_send','clarify','escalate','blocked')),
  status        text        not null default 'new',
  created_at    timestamptz not null default now()
);

create table reply (
  id          uuid primary key,
  enquiry_id  uuid        not null references enquiry(id),
  body        text        not null,
  grounded_on jsonb       not null default '[]',  -- which fact keys were used
  sent_at     timestamptz,
  blocked     boolean     not null default false,
  block_reason text
);

create table followup (
  id          uuid primary key,
  enquiry_id  uuid        not null references enquiry(id),
  due_at      timestamptz not null,
  sent_at     timestamptz,
  cancelled   boolean     not null default false
);

-- The table that makes the whole project demonstrable, and where your
-- portfolio numbers come from.
create table run_log (
  id          bigserial   primary key,
  enquiry_id  uuid,
  stage       text        not null,   -- classify | lookup | draft | validate | send
  status      text        not null,   -- ok | retry | failed
  attempt     int         not null default 1,
  model       text,
  cost_usd    numeric(10,6),
  duration_ms int,
  error       text,
  at          timestamptz not null default now()
);

create index on enquiry (status, received_at);
create index on followup (due_at) where sent_at is null and not cancelled;
create index on run_log (enquiry_id, at);
