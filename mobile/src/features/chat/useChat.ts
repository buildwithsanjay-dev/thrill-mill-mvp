import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getChatRoom, getLastReadAt, getLatestMessageAt, getMessages, getPresetCatalog, getReactions } from './api';

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
  return (opts: { roomId?: string; messageIds?: string[]; readMarker?: { roomId: string; userId: string } }) => {
    if (opts.roomId) queryClient.invalidateQueries({ queryKey: ['chat-messages', opts.roomId] });
    if (opts.messageIds) queryClient.invalidateQueries({ queryKey: ['chat-reactions', opts.messageIds] });
    // The dashboard's red dot reads this same key — without invalidating
    // it here, the global 30s default staleTime means returning to the
    // dashboard right after reading a chat can still show the dot for up
    // to 30s, since the cached "last read" value hasn't been told to
    // refresh yet even though markRoomRead() already wrote the new value.
    if (opts.readMarker) {
      queryClient.invalidateQueries({ queryKey: ['chat-last-read-at', opts.readMarker.roomId, opts.readMarker.userId] });
    }
  };
}

// Dashboard "has unread chat" red-dot support. Polled independently of
// the chat screen itself (which the user isn't necessarily on) — a
// longer interval than the in-chat polls is enough for a badge, and
// avoids hammering the DB from the dashboard for something this
// low-urgency.
export function useHasUnreadChat(teamId: string | undefined, userId: string | undefined) {
  const { data: room } = useQuery({
    queryKey: ['chat-room', teamId],
    queryFn: () => getChatRoom(teamId as string),
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: latestMessageAt } = useQuery({
    queryKey: ['chat-latest-message-at', room?.id],
    queryFn: () => getLatestMessageAt(room?.id as string),
    enabled: !!room?.id,
    refetchInterval: 20_000,
  });

  const { data: lastReadAt } = useQuery({
    queryKey: ['chat-last-read-at', room?.id, userId],
    queryFn: () => getLastReadAt(room?.id as string, userId as string),
    enabled: !!room?.id && !!userId,
    refetchInterval: 20_000,
  });

  if (!latestMessageAt) return false; // no messages at all yet
  if (!lastReadAt) return true; // never opened this room's chat
  return new Date(latestMessageAt).getTime() > new Date(lastReadAt).getTime();
}
