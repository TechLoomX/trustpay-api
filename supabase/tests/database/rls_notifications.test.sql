-- pgTAP test: wallet A cannot read or mark-read wallet B's notifications.
-- Run against a local Supabase stack: `supabase test db`

begin;
select plan(3);

insert into users (wallet_address, role) values
  ('GALICE00000000000000000000000000000000000000000000000', 'client'),
  ('GBOBFR0000000000000000000000000000000000000000000000', 'freelancer');

insert into notifications (id, user_wallet, type, read)
values ('20000000-0000-0000-0000-000000000001', 'GBOBFR0000000000000000000000000000000000000000000000', 'milestone_funded', false);

-- Alice cannot see Bob's notification.
set local role authenticated;
set local request.jwt.claims = '{"wallet_address": "GALICE00000000000000000000000000000000000000000000000"}';

select is(
  (select count(*)::int from notifications where id = '20000000-0000-0000-0000-000000000001'),
  0,
  'wallet A cannot read wallet B''s notifications'
);

-- Alice's attempt to mark Bob's notification read affects zero rows (RLS filters the update, not an error).
update notifications set read = true where id = '20000000-0000-0000-0000-000000000001';

select is(
  (select read from notifications where id = '20000000-0000-0000-0000-000000000001'),
  false,
  'wallet A cannot mark wallet B''s notification as read'
);

-- Bob can mark his own notification read.
set local request.jwt.claims = '{"wallet_address": "GBOBFR0000000000000000000000000000000000000000000000"}';
update notifications set read = true where id = '20000000-0000-0000-0000-000000000001';

select is(
  (select read from notifications where id = '20000000-0000-0000-0000-000000000001'),
  true,
  'wallet B can mark their own notification as read'
);

select * from finish();
rollback;
