-- pgTAP test: RLS boundary on projects/milestones.
-- Run against a local Supabase stack: `supabase test db`
-- (requires the `pgtap` extension, enabled by default in `supabase start`).

begin;
select plan(5);

insert into users (wallet_address, role) values
  ('GALICE00000000000000000000000000000000000000000000000', 'client'),
  ('GBOBFR0000000000000000000000000000000000000000000000', 'freelancer'),
  ('GMALLORY0000000000000000000000000000000000000000000000', 'client');

insert into projects (id, escrow_id, contract_id, client_wallet, freelancer_wallet, title, token_address, confirmed)
values (
  '10000000-0000-0000-0000-000000000001',
  9001,
  'CCPOUXHJT3D7EKM44ASLS442QSNRF6IKCMIAI466FSCYMA6BWKDHHFR2',
  'GALICE00000000000000000000000000000000000000000000000',
  'GBOBFR0000000000000000000000000000000000000000000000',
  'Test project',
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  true
);

-- Alice (the client) can see the project.
set local role authenticated;
set local request.jwt.claims = '{"wallet_address": "GALICE00000000000000000000000000000000000000000000000"}';

select is(
  (select count(*)::int from projects where id = '10000000-0000-0000-0000-000000000001'),
  1,
  'client participant can read their project'
);

-- Bob (the freelancer) can see the project too.
set local request.jwt.claims = '{"wallet_address": "GBOBFR0000000000000000000000000000000000000000000000"}';

select is(
  (select count(*)::int from projects where id = '10000000-0000-0000-0000-000000000001'),
  1,
  'freelancer participant can read their project'
);

-- Mallory, an unrelated wallet, cannot see the project.
set local request.jwt.claims = '{"wallet_address": "GMALLORY0000000000000000000000000000000000000000000000"}';

select is(
  (select count(*)::int from projects where id = '10000000-0000-0000-0000-000000000001'),
  0,
  'non-participant cannot read the project'
);

-- Mallory cannot create a project claiming Alice as the client.
select throws_ok(
  $$ insert into projects (escrow_id, contract_id, client_wallet, freelancer_wallet, title, token_address)
     values (9002, 'CCPOUXHJT3D7EKM44ASLS442QSNRF6IKCMIAI466FSCYMA6BWKDHHFR2',
             'GALICE00000000000000000000000000000000000000000000000',
             'GBOBFR0000000000000000000000000000000000000000000000',
             'Forged project', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') $$,
  'new row violates row-level security policy for table "projects"',
  'wallet A cannot create a project claiming wallet B as client_wallet'
);

-- Mallory can create her own project as client.
set local request.jwt.claims = '{"wallet_address": "GMALLORY0000000000000000000000000000000000000000000000"}';

select lives_ok(
  $$ insert into projects (escrow_id, contract_id, client_wallet, freelancer_wallet, title, token_address)
     values (9003, 'CCPOUXHJT3D7EKM44ASLS442QSNRF6IKCMIAI466FSCYMA6BWKDHHFR2',
             'GMALLORY0000000000000000000000000000000000000000000000',
             'GBOBFR0000000000000000000000000000000000000000000000',
             'Mallory''s own project', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') $$,
  'a wallet can create its own project as client'
);

select * from finish();
rollback;
