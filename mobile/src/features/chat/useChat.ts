import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getChatRoom, getMessages, getPresetCatalog, getReactions } from './api';

// Fixed reference data — long staleTime, same pattern as other
// rarely-changing lookups in this app (cf. useDefaultTurf's 1h staleTime
// before it was replaced by useTurfResources).
export function usePresetCatalog() {
  return useQuery({ queryKey: ['chat-preset-catalog'], queryFn: getPresetCatalog, staleTime: 60 * 60 * 1000 });
}

export function useChatRoom(teamId: string | undefined) {
  return useQuery({
    queryKey: ['chat-room', teamId],
    queryFn: () => getChatRoom(teamId as string),
    enabled: !!teamId,
  });
}

// No Realtime subscription in this codebase yet (nothing else here uses
// it) — polling matches the existing convention elsewhere (e.g.
// useTurfSlots' 15s refetchInterval for fast-moving slot data). Chat is
// much lower-volume, so a slightly longer interval is enough to feel
// live without hammering the DB.
export function useMessages(roomId: string | undefined) {
  return useQuery({
    queryKey: ['chat-messages', roomId],
    queryFn: () => getMessages(roomId as string),
    enabled: !!roomId,
    refetchInterval: 5_000,
  });
}

export function useReactions(messageIds: string[]) {
  return useQuery({
    queryKey: ['chat-reactions', messageIds],
    queryFn: () => getReactions(messageIds),
    enabled: messageIds.length > 0,
    refetchInterval: 5_000,
  });
}

export function useInvalidateChatQueries() {
  const queryClient = useQueryClient();
  return (opts: { roomId?: string; messageIds?: string[] }) => {
    if (opts.roomId) queryClient.invalidateQueries({ queryKey: ['chat-messages', opts.roomId] });
    if (opts.messageIds) queryClient.invalidateQueries({ queryKey: ['chat-reactions', opts.messageIds] });
  };
}
