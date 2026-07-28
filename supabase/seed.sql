-- Fixture data for local dev and tests. Wallet addresses are made-up
-- Stellar-shaped strings (G... 56 chars), not real testnet keypairs, except
-- where a test needs a real keypair to sign challenges (see test/ scripts).

insert into users (wallet_address, display_name, role) values
  ('GALICE00000000000000000000000000000000000000000000000', 'Alice (client)', 'client'),
  ('GBOBFR0000000000000000000000000000000000000000000000',  'Bob (freelancer)', 'freelancer'),
  ('GCAROLB000000000000000000000000000000000000000000000',  'Carol (both)', 'both');

insert into projects
  (id, escrow_id, contract_id, client_wallet, freelancer_wallet, title, description, token_address, status, confirmed, last_synced_at)
values
  (
    '00000000-0000-0000-0000-000000000001',
    1,
    'CCPOUXHJT3D7EKM44ASLS442QSNRF6IKCMIAI466FSCYMA6BWKDHHFR2',
    'GALICE00000000000000000000000000000000000000000000000',
    'GBOBFR0000000000000000000000000000000000000000000000',
    'Landing page redesign',
    'Redesign the marketing site landing page.',
    'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'Active',
    true,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    2,
    'CCPOUXHJT3D7EKM44ASLS442QSNRF6IKCMIAI466FSCYMA6BWKDHHFR2',
    'GALICE00000000000000000000000000000000000000000000000',
    'GCAROLB000000000000000000000000000000000000000000000',
    'Completed logo project',
    'Brand identity work, fully wrapped up.',
    'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'Completed',
    true,
    now()
  );

-- Helper: description_hash must equal sha256(long_description) or the
-- integrity trigger from 0001_initial_schema.sql will reject the insert.
insert into milestones
  (project_id, index, amount, title, long_description, description_hash, status, submitted_at, approved_at, last_synced_at)
values
  (
    '00000000-0000-0000-0000-000000000001',
    0,
    '500.0000000',
    'Wireframes',
    'Deliver low-fidelity wireframes for the new landing page layout.',
    encode(digest('Deliver low-fidelity wireframes for the new landing page layout.', 'sha256'), 'hex'),
    'Funded',
    null,
    null,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    1,
    '1500.0000000',
    'Final build',
    'Ship the responsive, production-ready landing page.',
    encode(digest('Ship the responsive, production-ready landing page.', 'sha256'), 'hex'),
    'Pending',
    null,
    null,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    0,
    '800.0000000',
    'Logo delivery',
    'Final logo files in SVG, PNG, and brand guideline PDF.',
    encode(digest('Final logo files in SVG, PNG, and brand guideline PDF.', 'sha256'), 'hex'),
    'Released',
    now() - interval '10 days',
    now() - interval '9 days',
    now() - interval '9 days'
  );

insert into notifications (user_wallet, type, project_id, milestone_index, read) values
  ('GBOBFR0000000000000000000000000000000000000000000000', 'milestone_funded', '00000000-0000-0000-0000-000000000001', 0, false),
  ('GCAROLB000000000000000000000000000000000000000000000', 'funds_released', '00000000-0000-0000-0000-000000000002', 0, true);
