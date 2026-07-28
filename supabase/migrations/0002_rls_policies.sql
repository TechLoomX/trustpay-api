-- RLS is the actual ownership boundary for this API — not app middleware.
-- The indexer worker and Edge Functions connect with the service role key,
-- which bypasses RLS entirely; that key must never reach the frontend.

alter table users enable row level security;
alter table projects enable row level security;
alter table milestones enable row level security;
alter table notifications enable row level security;
alter table indexer_state enable row level security;
alter table auth_nonces enable row level security;

-- users: any authenticated wallet can read public profile info; a wallet can
-- only create/update its own row.
create policy "authenticated can read users"
  on users for select
  to authenticated
  using (true);

create policy "wallet can upsert own user row"
  on users for insert
  to authenticated
  with check (auth.jwt() ->> 'wallet_address' = wallet_address);

create policy "wallet can update own user row"
  on users for update
  to authenticated
  using (auth.jwt() ->> 'wallet_address' = wallet_address)
  with check (auth.jwt() ->> 'wallet_address' = wallet_address);

-- projects: only the client or freelancer on the project can read it.
create policy "project participants can read"
  on projects for select
  to authenticated
  using (
    auth.jwt() ->> 'wallet_address' = client_wallet
    or auth.jwt() ->> 'wallet_address' = freelancer_wallet
  );

-- projects: only the authenticated wallet can create a project where it is the client.
-- New rows are always unconfirmed; only the indexer (service role) flips `confirmed`.
create policy "client can create own project"
  on projects for insert
  to authenticated
  with check (
    auth.jwt() ->> 'wallet_address' = client_wallet
    and confirmed = false
  );

-- No update/delete policy for `authenticated` on projects: status/confirmed/last_synced_at
-- are chain-derived and must only ever be written by the indexer via the service role key.

-- milestones: inherit visibility from parent project.
create policy "project participants can read milestones"
  on milestones for select
  to authenticated
  using (
    exists (
      select 1 from projects p
      where p.id = milestones.project_id
        and (auth.jwt() ->> 'wallet_address' = p.client_wallet
             or auth.jwt() ->> 'wallet_address' = p.freelancer_wallet)
    )
  );

-- milestones: the client on the parent project may create the initial (Pending)
-- milestone rows when creating a project. Status transitions beyond that are
-- indexer-only (service role, bypasses RLS).
create policy "client can create milestones on own project"
  on milestones for insert
  to authenticated
  with check (
    status = 'Pending'
    and exists (
      select 1 from projects p
      where p.id = milestones.project_id
        and auth.jwt() ->> 'wallet_address' = p.client_wallet
    )
  );

-- notifications: only the owning wallet can read/mark-read their own.
create policy "user reads own notifications"
  on notifications for select
  to authenticated
  using (auth.jwt() ->> 'wallet_address' = user_wallet);

create policy "user marks own notifications read"
  on notifications for update
  to authenticated
  using (auth.jwt() ->> 'wallet_address' = user_wallet)
  with check (auth.jwt() ->> 'wallet_address' = user_wallet);

-- indexer_state and auth_nonces: no policies for `authenticated` — these are
-- only ever touched by Edge Functions / the indexer via the service role key,
-- which bypasses RLS. Enabling RLS with zero policies denies all client access.
