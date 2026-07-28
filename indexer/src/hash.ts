// Must match the contract's description-hash function (check types.rs/events.rs
// on the deployed contract) and the Postgres trigger in
// supabase/migrations/0001_initial_schema.sql, which uses
// encode(digest(long_description, 'sha256'), 'hex'). sha256-hex is the
// assumed convention until confirmed against the contract source.
import { createHash } from 'node:crypto';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
