import type { MyTeamSummary } from '@/features/team/api';
import type { TurfSlot } from '@/types/db';
import { formatBookingDate, formatSlotTime } from '@/utils/datetime';

// Customer-facing "why can't I do this?" explanations for the slot grid. The
// grid used to grey slots out silently and a blocked hold said only "Could
// not hold slot"; these give the actual reason. They are UX only — the
// server (fn_create_slot_hold) enforces every one of these rules itself.

export type Reason = { title: string; message: string };

// Why a greyed-out / non-available slot can't be picked. Returns null when
// the slot is actually free and in the future.
export function whySlotNotBookable(slot: TurfSlot, isoDate: string, isPast: boolean): Reason | null {
  const when = `${formatSlotTime(slot.start_time)} on ${formatBookingDate(isoDate)}`;
  if (isPast) {
    return {
      title: 'This slot has already passed',
      message: `The ${when} slot has already started or finished, so it can't be booked. Pick a later time.`,
    };
  }
  switch (slot.status) {
    case 'HELD':
      return {
        title: 'Another team is holding this slot',
        message: `Someone is selecting the ${when} slot right now. Holds last 1 minute — if they don't confirm, it opens up again automatically. Try again shortly.`,
      };
    case 'CONFIRMED':
      return {
        title: 'This slot is already booked',
        message: `The ${when} slot has been booked by another team. Pick a different time.`,
      };
    case 'BLOCKED':
      return {
        title: 'This slot is closed by the club',
        message: `The club has blocked the ${when} slot (for example for maintenance or an event), so it can't be booked.`,
      };
    default:
      return null;
  }
}

// Why the current user's team can't hold any slot at all right now. Returns
// null when they're allowed to try (the server still has the final say).
export function whyTeamCannotHold(team: MyTeamSummary): Reason | null {
  const name = team.team.name;

  if (team.team.status === 'ARCHIVED') {
    return {
      title: 'This team is archived',
      message: `${name} has been archived by the club Admin, so it can no longer make bookings.`,
    };
  }

  if (team.myRole === 'MEMBER') {
    return {
      title: 'Only the Host or Co-host can book',
      message: `You're a member of ${name}, and slots are booked by the team's Host or Co-host because they spend the team's shared credits. Ask them to book, or ask to be made a Co-host.`,
    };
  }

  switch (team.membershipStatus) {
    case 'ACTIVE':
      return null;
    case null:
      return {
        title: 'No membership yet',
        message: `${name} hasn't chosen a membership plan yet. Choose a plan and get it approved by the club Admin before booking slots.`,
      };
    default:
      return {
        title: 'Your membership is under review',
        message: `You've applied for a membership for ${name} and the Admin is still reviewing it. You can hold slots once they verify your payment and load your credits — they'll contact the Host or Co-host.`,
      };
  }
}
