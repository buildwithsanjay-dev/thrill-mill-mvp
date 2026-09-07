import { useQuery } from '@tanstack/react-query';

import { getTeamWallet, getWalletLedger } from './api';

export function useTeamWallet(teamId: string | undefined) {
  return useQuery({
    queryKey: ['team-wallet', teamId],
    queryFn: () => getTeamWallet(teamId as string),
    enabled: !!teamId,
  });
}

export function useWalletLedger(teamId: string | undefined) {
  return useQuery({
    queryKey: ['wallet-ledger', teamId],
    queryFn: () => getWalletLedger(teamId as string),
    enabled: !!teamId,
  });
}
