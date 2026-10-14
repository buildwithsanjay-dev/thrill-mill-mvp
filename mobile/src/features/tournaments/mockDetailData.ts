import type { TournamentDetail } from './types';

// Keyed by the Tournament.id values in mockData.ts. Only the two COMPLETED
// mock tournaments have detail — matches RizzFit's real completed-tournament
// page shape (group matches + standings, a knockout bracket, a leaderboard),
// not generic filler. Replace with a live RizzFit API call once their
// Swagger spec is available (see CLAUDE.md's Phase 2 note).
export const MOCK_TOURNAMENT_DETAILS: Record<string, TournamentDetail> = {
  'mock-3': {
    tournamentId: 'mock-3',
    groups: [
      {
        name: 'Group A',
        matches: [
          { id: 'm3-1', teamA: 'Thrill Strikers', teamB: 'Chennai Chargers', round: 'Prelims', scoreA: 162, scoreB: 145 },
          { id: 'm3-2', teamA: 'Coimbatore Kings', teamB: 'Madurai Monarchs', round: 'Prelims', scoreA: 180, scoreB: 120 },
          { id: 'm3-3', teamA: 'Thrill Strikers', teamB: 'Coimbatore Kings', round: 'Prelims', scoreA: 170, scoreB: 160 },
          { id: 'm3-4', teamA: 'Chennai Chargers', teamB: 'Madurai Monarchs', round: 'Prelims', scoreA: 155, scoreB: 130 },
          { id: 'm3-5', teamA: 'Thrill Strikers', teamB: 'Madurai Monarchs', round: 'Prelims', scoreA: 190, scoreB: 100 },
          { id: 'm3-6', teamA: 'Chennai Chargers', teamB: 'Coimbatore Kings', round: 'Prelims', scoreA: 150, scoreB: 165 },
        ],
        standings: [
          { team: 'Thrill Strikers', played: 3, wins: 3, losses: 0, pointsFor: 522, pointsAgainst: 405 },
          { team: 'Coimbatore Kings', played: 3, wins: 2, losses: 1, pointsFor: 505, pointsAgainst: 445 },
          { team: 'Chennai Chargers', played: 3, wins: 1, losses: 2, pointsFor: 450, pointsAgainst: 465 },
          { team: 'Madurai Monarchs', played: 3, wins: 0, losses: 3, pointsFor: 350, pointsAgainst: 510 },
        ],
      },
    ],
    bracket: [
      {
        name: 'Semifinal',
        matches: [
          { id: 'b3-sf1', top: 'Thrill Strikers', bottom: 'Madurai Monarchs', winner: 'top' },
          { id: 'b3-sf2', top: 'Coimbatore Kings', bottom: 'Chennai Chargers', winner: 'top' },
        ],
      },
      {
        name: 'Final',
        matches: [{ id: 'b3-f1', top: 'Thrill Strikers', bottom: 'Coimbatore Kings', winner: 'top' }],
      },
    ],
    leaderboard: [
      { rank: 1, team: 'Thrill Strikers', games: 5, wins: 5, losses: 0 },
      { rank: 2, team: 'Coimbatore Kings', games: 5, wins: 3, losses: 2 },
      { rank: 3, team: 'Chennai Chargers', games: 4, wins: 1, losses: 3 },
      { rank: 4, team: 'Madurai Monarchs', games: 4, wins: 0, losses: 4 },
    ],
  },

  'mock-4': {
    tournamentId: 'mock-4',
    groups: [
      {
        name: 'Group A',
        matches: [
          { id: 'm4-1', teamA: 'Team Smash', teamB: 'Team Dink', round: 'Prelims', scoreA: 11, scoreB: 7 },
          { id: 'm4-2', teamA: 'Team Smash', teamB: 'Team Rally', round: 'Prelims', scoreA: 11, scoreB: 9 },
          { id: 'm4-3', teamA: 'Team Dink', teamB: 'Team Rally', round: 'Prelims', scoreA: 11, scoreB: 6 },
        ],
        standings: [
          { team: 'Team Smash', played: 2, wins: 2, losses: 0, pointsFor: 22, pointsAgainst: 16 },
          { team: 'Team Dink', played: 2, wins: 1, losses: 1, pointsFor: 18, pointsAgainst: 18 },
          { team: 'Team Rally', played: 2, wins: 0, losses: 2, pointsFor: 15, pointsAgainst: 21 },
        ],
      },
      {
        name: 'Group B',
        matches: [
          { id: 'm4-4', teamA: 'Team Ace', teamB: 'Team Spin', round: 'Prelims', scoreA: 11, scoreB: 4 },
          { id: 'm4-5', teamA: 'Team Ace', teamB: 'Team Volley', round: 'Prelims', scoreA: 11, scoreB: 8 },
          { id: 'm4-6', teamA: 'Team Spin', teamB: 'Team Volley', round: 'Prelims', scoreA: 9, scoreB: 11 },
        ],
        standings: [
          { team: 'Team Ace', played: 2, wins: 2, losses: 0, pointsFor: 22, pointsAgainst: 12 },
          { team: 'Team Volley', played: 2, wins: 1, losses: 1, pointsFor: 19, pointsAgainst: 20 },
          { team: 'Team Spin', played: 2, wins: 0, losses: 2, pointsFor: 13, pointsAgainst: 22 },
        ],
      },
    ],
    bracket: [
      {
        name: 'Semifinal',
        matches: [
          { id: 'b4-sf1', top: 'Team Smash', bottom: 'Team Volley', winner: 'top' },
          { id: 'b4-sf2', top: 'Team Ace', bottom: 'Team Dink', winner: 'top' },
        ],
      },
      {
        name: 'Final',
        matches: [{ id: 'b4-f1', top: 'Team Smash', bottom: 'Team Ace', winner: 'bottom' }],
      },
    ],
    leaderboard: [
      { rank: 1, team: 'Team Ace', games: 3, wins: 3, losses: 0 },
      { rank: 2, team: 'Team Smash', games: 3, wins: 2, losses: 1 },
      { rank: 3, team: 'Team Volley', games: 2, wins: 1, losses: 1 },
      { rank: 4, team: 'Team Dink', games: 2, wins: 1, losses: 1 },
      { rank: 5, team: 'Team Spin', games: 2, wins: 0, losses: 2 },
      { rank: 6, team: 'Team Rally', games: 2, wins: 0, losses: 2 },
    ],
  },
};
