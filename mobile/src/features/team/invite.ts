import { APP_SHARE_URL } from '@/constants/links';

// One share message for every "invite someone to my team" entry point (the
// create-team wizard, Team Details, Add Members) so the app link and the
// steps are always the same.
export function buildInviteMessage(teamName: string, joinCode: string | null | undefined): string {
  return [
    `Join my Thrill Mill Club team "${teamName}"!`,
    '',
    `1. Get the app: ${APP_SHARE_URL}`,
    '2. Sign in and open "Join a Team"',
    `3. Enter this Team ID: ${joinCode ?? ''}`,
  ].join('\n');
}
