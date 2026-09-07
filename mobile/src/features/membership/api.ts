import { supabase } from '@/lib/supabase';
import type { MembershipPlan } from '@/types/db';

export async function getMembershipPlans(): Promise<MembershipPlan[]> {
  const { data, error } = await supabase
    .from('membership_plans')
    .select('*')
    .eq('is_active', true)
    .order('price_inr', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MembershipPlan[];
}

// Submits the Team's membership request against a chosen plan. Credits are
// not loaded here — this only creates the REQUEST_SUBMITTED
// team_memberships row + a PAYMENT_EXPECTED payments row; an Admin
// verifying the externally-collected payment (fn_admin_verify_payment) is
// what actually allocates credits, per CLAUDE.md's external-payment model.
export async function requestTeamMembership(params: {
  teamId: string;
  planCode: string;
  hostPhone: string;
  coHostPhone?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('fn_request_team_membership', {
    p_team_id: params.teamId,
    p_plan_code: params.planCode,
    p_host_phone: params.hostPhone,
    p_co_host_phone: params.coHostPhone ?? null,
  });
  if (error) throw error;
  return data as string;
}
