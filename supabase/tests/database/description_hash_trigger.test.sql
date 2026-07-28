-- pgTAP test: description_hash must equal sha256(long_description).
-- Run against a local Supabase stack: `supabase test db`

begin;
select plan(3);

insert into users (wallet_address, role) values
  ('GALICE00000000000000000000000000000000000000000000000', 'client'),
  ('GBOBFR0000000000000000000000000000000000000000000000', 'freelancer');

insert into projects (id, escrow_id, contract_id, client_wallet, freelancer_wallet, title, token_address)
values (
  '30000000-0000-0000-0000-000000000001',
  9101,
  'CCPOUXHJT3D7EKM44ASLS442QSNRF6IKCMIAI466FSCYMA6BWKDHHFR2',
  'GALICE00000000000000000000000000000000000000000000000',
  'GBOBFR0000000000000000000000000000000000000000000000',
  'Hash trigger test project',
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
);

-- Mismatched hash is rejected.
select throws_ok(
  $$ insert into milestones (project_id, index, amount, title, long_description, description_hash)
     values ('30000000-0000-0000-0000-000000000001', 0, 100, 'Bad hash milestone',
             'The real description', 'not-the-real-sha256-hash') $$,
  'description_hash does not match sha256(long_description)',
  'milestone insert with mismatched description_hash is rejected'
);

-- Correct hash is accepted.
select lives_ok(
  $$ insert into milestones (project_id, index, amount, title, long_description, description_hash)
     values ('30000000-0000-0000-0000-000000000001', 0, 100, 'Good hash milestone',
             'The real description',
             encode(digest('The real description', 'sha256'), 'hex')) $$,
  'milestone insert with matching description_hash succeeds'
);

-- Updating long_description without updating description_hash to match is rejected.
select throws_ok(
  $$ update milestones set long_description = 'A changed description'
     where project_id = '30000000-0000-0000-0000-000000000001' and index = 0 $$,
  'description_hash does not match sha256(long_description)',
  'updating long_description without a matching description_hash is rejected'
);

select * from finish();
rollback;
