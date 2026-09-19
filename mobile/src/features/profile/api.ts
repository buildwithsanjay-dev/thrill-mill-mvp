import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  platform_role: 'MEMBER' | 'ADMIN';
  onboarded_at: string | null;
};

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user.id;
}

export async function getMyProfile(): Promise<Profile> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, avatar_url, platform_role, onboarded_at')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

type ProfileUpdate = Partial<Pick<Profile, 'full_name' | 'phone' | 'avatar_url'>> & {
  onboarded_at?: string;
};

export async function updateMyProfile(fields: ProfileUpdate): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from('profiles').update(fields).eq('id', userId);
  if (error) throw error;
}

// Uploads to the (public, per migration) "avatars" bucket at
// "<user_id>/avatar.<ext>" and returns a cache-busted public URL — the path
// is reused on every upload (upsert), so without the cache-bust query param
// a previously-cached image would keep showing after a re-upload.
export async function uploadAvatar(localUri: string): Promise<string> {
  const userId = await requireUserId();

  const extMatch = /\.(\w+)$/.exec(localUri);
  const ext = (extMatch?.[1] ?? 'jpg').toLowerCase();
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${userId}/avatar.${ext}`;

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, decode(base64), { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

// Pre-check used by onboarding so the user sees "already registered" inline
// before anything is saved. The database's unique index is the real guard.
export async function isPhoneAvailable(phoneE164: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('fn_is_phone_available', { p_phone: phoneE164 });
  if (error) throw error;
  return data === true;
}

// Deletes the stored avatar file(s) for a user. Split out (and taking the id
// explicitly) so account deletion can run it AFTER the server has accepted
// the deletion, when the session may no longer answer getUser().
export async function removeAvatarFiles(userId: string): Promise<void> {
  const { data: files } = await supabase.storage.from('avatars').list(userId);
  const paths = (files ?? []).map((f) => `${userId}/${f.name}`);
  if (paths.length > 0) {
    await supabase.storage.from('avatars').remove(paths);
  }
}

// Clears the profile picture: removes the stored file (best-effort) and
// nulls avatar_url so every screen falls back to the initials avatar.
export async function removeAvatar(): Promise<void> {
  const userId = await requireUserId();
  await removeAvatarFiles(userId).catch(() => undefined);
  const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
  if (error) throw error;
}

// Self-service account deletion — see fn_delete_my_account. Throws
// HOST_MUST_TRANSFER when the caller still hosts a live Team.
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('fn_delete_my_account');
  if (error) throw error;
}
