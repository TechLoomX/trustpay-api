-- TrustPay off-chain schema.
-- Mirrors on-chain Escrow/Milestone state; never the source of truth for it.
-- The indexer worker (service role) is the only writer of chain-derived columns
-- (status, confirmed, last_synced_at, submitted_at, approved_at).

create extension if not exists pgcrypto;

create table users (
  wallet_address text primary key,
  display_name text,
  role text check (role in ('client', 'freelancer', 'both')),
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  escrow_id bigint not null unique,       -- matches contract's u64 escrow id
  contract_id text not null,               -- deployed contract address
  client_wallet text not null references users(wallet_address),
  freelancer_wallet text not null references users(wallet_address),
  title text not null,
  description text,
  token_address text not null,
  status text not null check (status in ('Active', 'Completed', 'Cancelled')) default 'Active',
  confirmed boolean not null default false,  -- flipped true only by the indexer, once escrow_created is observed
  created_at timestamptz not null default now(),
  last_synced_at timestamptz
);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  index int not null,
  amount numeric not null,                  -- i128-scale value; numeric avoids JS float precision loss
  title text not null,
  long_description text not null,
  description_hash text not null,            -- must match the on-chain description_hash for this milestone
  status text not null check (status in
    ('Pending', 'Funded', 'Submitted', 'Approved', 'Released', 'Disputed', 'Refunded')) default 'Pending',
  submitted_at timestamptz,
  approved_at timestamptz,
  last_synced_at timestamptz,
  unique (project_id, index)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_wallet text not null references users(wallet_address),
  type text not null check (type in
    ('milestone_funded', 'milestone_submitted', 'milestone_approved',
     'funds_released', 'dispute_raised', 'milestone_refunded')),
  project_id uuid references projects(id),
  milestone_index int,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table indexer_state (
  id text primary key default 'singleton',
  last_processed_ledger bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table auth_nonces (
  wallet_address text not null,
  nonce text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  primary key (wallet_address, nonce)
);

-- Integrity check: description_hash must actually be sha256(long_description).
-- This only enforces internal consistency between the two columns — it cannot
-- reach out to Stellar RPC to confirm the hash matches the on-chain value.
-- That cross-check against the chain happens in the indexer, which is the
-- only writer allowed to flip a milestone's status away from 'Pending'.
create or replace function check_description_hash()
returns trigger as $$
begin
  if new.description_hash <> encode(digest(new.long_description, 'sha256'), 'hex') then
    raise exception 'description_hash does not match sha256(long_description)'
      using errcode = '22000';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger milestones_check_description_hash
  before insert or update of long_description, description_hash on milestones
  for each row execute function check_description_hash();

insert into indexer_state (id, last_processed_ledger) values ('singleton', 0)
  on conflict (id) do nothing;
