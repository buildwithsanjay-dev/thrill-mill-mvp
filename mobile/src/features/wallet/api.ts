import { supabase } from '@/lib/supabase';
import type { TeamWallet, WalletLedgerEntry } from '@/types/db';

export async function getTeamWallet(teamId: string): Promise<TeamWallet | null> {
  const { data, error } = await supabase.from('team_wallets').select('*').eq('team_id', teamId).maybeSingle();
  if (error) throw error;
  return (data as TeamWallet | null) ?? null;
}

export async function getWalletLedger(teamId: string): Promise<WalletLedgerEntry[]> {
  const { data, error } = await supabase
    .from('wallet_ledger')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as WalletLedgerEntry[];
}
