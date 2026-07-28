// GET /functions/v1/reputation?wallet=<address>
// -> { completedEscrows, onTimeRate, asClient: {...}, asFreelancer: {...} }
import { createSupabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

// The schema has no explicit milestone due-date column, so "on time" is
// approximated as: approved within 7 days of submission. This is a
// documented heuristic, not a value derived from the contract — revisit
// if/when the contract exposes a real deadline.
const ON_TIME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    return errorResponse('method_not_allowed', 'Use GET', 405);
  }

  const wallet = new URL(req.url).searchParams.get('wallet');
  if (!wallet) {
    return errorResponse('missing_wallet', 'wallet query param is required', 400);
  }

  const supabase = createSupabaseAdmin();

  const [{ data: asClientProjects, error: clientErr }, { data: asFreelancerProjects, error: freelancerErr }] =
    await Promise.all([
      supabase.from('projects').select('id, status').eq('client_wallet', wallet),
      supabase.from('projects').select('id, status').eq('freelancer_wallet', wallet),
    ]);

  if (clientErr || freelancerErr) {
    return errorResponse('query_failed', (clientErr ?? freelancerErr)!.message, 500);
  }

  const completedAsClient = (asClientProjects ?? []).filter((p) => p.status === 'Completed').length;
  const completedAsFreelancer = (asFreelancerProjects ?? []).filter((p) => p.status === 'Completed').length;

  const freelancerProjectIds = (asFreelancerProjects ?? []).map((p) => p.id);
  let onTimeRate = 0;
  if (freelancerProjectIds.length > 0) {
    const { data: released, error: milestoneErr } = await supabase
      .from('milestones')
      .select('submitted_at, approved_at')
      .in('project_id', freelancerProjectIds)
      .eq('status', 'Released')
      .not('submitted_at', 'is', null)
      .not('approved_at', 'is', null);

    if (milestoneErr) {
      return errorResponse('query_failed', milestoneErr.message, 500);
    }

    if (released && released.length > 0) {
      const onTimeCount = released.filter((m) => {
        const submitted = new Date(m.submitted_at as string).getTime();
        const approved = new Date(m.approved_at as string).getTime();
        return approved - submitted <= ON_TIME_WINDOW_MS;
      }).length;
      onTimeRate = onTimeCount / released.length;
    }
  }

  return jsonResponse({
    completedEscrows: completedAsClient + completedAsFreelancer,
    onTimeRate,
    asClient: {
      totalProjects: (asClientProjects ?? []).length,
      completedEscrows: completedAsClient,
    },
    asFreelancer: {
      totalProjects: (asFreelancerProjects ?? []).length,
      completedEscrows: completedAsFreelancer,
    },
  });
});
