// Service-role client for Edge Functions. Bypasses RLS — only ever used
// server-side inside these functions, never handed to the frontend.
import { createClient } from 'npm:@supabase/supabase-js@2';

export function createSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
