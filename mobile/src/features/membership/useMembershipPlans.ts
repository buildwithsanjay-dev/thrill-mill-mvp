import { useQuery } from '@tanstack/react-query';

import { getMembershipPlans } from './api';

export function useMembershipPlans() {
  return useQuery({
    queryKey: ['membership-plans'],
    queryFn: getMembershipPlans,
    staleTime: 5 * 60 * 1000,
  });
}
