import type { Tournament } from './types';

// Placeholder data only — modelled on real listings observed on
// tournament.rizzfitt.com for The Thrill Mill Club at research time, so the
// shell looks like what the real feed will eventually show rather than
// generic filler. Replace with a live RizzFit API call once their Swagger
// spec is available (see CLAUDE.md's Phase 2 note).
export const MOCK_TOURNAMENTS: Tournament[] = [
  {
    id: 'mock-1',
    name: 'Coimbatore Dink Feast - Halloween Edition',
    organizer: 'The Thrill Mill Club',
    venueOrHost: 'The Thrill Mill Club',
    sport: 'Pickleball',
    eventType: 'Event',
    startDate: '2026-11-01',
    endDate: '2026-11-01',
    status: 'UPCOMING',
    isRegistered: false,
  },
  {
    id: 'mock-2',
    name: '8th Tamilnadu State Level Championship - Junior',
    organizer: 'TNPA',
    venueOrHost: 'Chennai',
    sport: 'Pickleball',
    eventType: 'Tournament',
    startDate: '2026-10-23',
    endDate: '2026-10-25',
    status: 'UPCOMING',
    isRegistered: false,
  },
  {
    id: 'mock-3',
    name: 'Thrill Mill Inaugural Cricket Cup 2026',
    organizer: 'The Thrill Mill Club',
    venueOrHost: 'The Thrill Mill Club',
    sport: 'Cricket',
    eventType: 'Tournament',
    startDate: '2026-08-08',
    endDate: '2026-08-09',
    status: 'COMPLETED',
    isRegistered: false,
  },
  {
    id: 'mock-4',
    name: 'Thrill & Chill Pickleball',
    organizer: 'The Thrill Mill Club',
    venueOrHost: 'The Thrill Mill Club',
    sport: 'Pickleball',
    eventType: 'Tournament',
    startDate: '2026-08-01',
    endDate: '2026-08-02',
    status: 'COMPLETED',
    isRegistered: false,
  },
];
