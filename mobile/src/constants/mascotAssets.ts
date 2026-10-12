import type { SeasonId } from '@/features/seasons/seasonWindows';

export type MascotPose =
  | 'hero-standing'
  | 'wave-hello'
  | 'oops-sorry'
  | 'waiting-watch'
  | 'hold-on'
  | 'trophy-champion'
  | 'napping'
  | 'welcome-open-arms'
  | 'run-lets-go'
  | 'celebrate-jump'
  | 'wink-nice'
  | 'throw-game-on'
  | 'face-smile'
  | 'face-wink'
  | 'face-excited'
  | 'face-surprised'
  | 'face-thinking'
  | 'face-laughing'
  | 'face-sad'
  | 'face-worried'
  | 'face-sleepy';

// require() needs a literal, static path per call — this is why each pose is
// spelled out twice (base, halloween) instead of built from a template
// string.
const base: Record<MascotPose, number> = {
  'hero-standing': require('../../assets/mascot/base/hero-standing.webp'),
  'wave-hello': require('../../assets/mascot/base/wave-hello.webp'),
  'oops-sorry': require('../../assets/mascot/base/oops-sorry.webp'),
  'waiting-watch': require('../../assets/mascot/base/waiting-watch.webp'),
  'hold-on': require('../../assets/mascot/base/hold-on.webp'),
  'trophy-champion': require('../../assets/mascot/base/trophy-champion.webp'),
  napping: require('../../assets/mascot/base/napping.webp'),
  'welcome-open-arms': require('../../assets/mascot/base/welcome-open-arms.webp'),
  'run-lets-go': require('../../assets/mascot/base/run-lets-go.webp'),
  'celebrate-jump': require('../../assets/mascot/base/celebrate-jump.webp'),
  'wink-nice': require('../../assets/mascot/base/wink-nice.webp'),
  'throw-game-on': require('../../assets/mascot/base/throw-game-on.webp'),
  'face-smile': require('../../assets/mascot/base/face-smile.webp'),
  'face-wink': require('../../assets/mascot/base/face-wink.webp'),
  'face-excited': require('../../assets/mascot/base/face-excited.webp'),
  'face-surprised': require('../../assets/mascot/base/face-surprised.webp'),
  'face-thinking': require('../../assets/mascot/base/face-thinking.webp'),
  'face-laughing': require('../../assets/mascot/base/face-laughing.webp'),
  'face-sad': require('../../assets/mascot/base/face-sad.webp'),
  'face-worried': require('../../assets/mascot/base/face-worried.webp'),
  'face-sleepy': require('../../assets/mascot/base/face-sleepy.webp'),
};

const halloween: Record<MascotPose, number> = {
  'hero-standing': require('../../assets/mascot/halloween/hero-standing.webp'),
  'wave-hello': require('../../assets/mascot/halloween/wave-hello.webp'),
  'oops-sorry': require('../../assets/mascot/halloween/oops-sorry.webp'),
  'waiting-watch': require('../../assets/mascot/halloween/waiting-watch.webp'),
  'hold-on': require('../../assets/mascot/halloween/hold-on.webp'),
  'trophy-champion': require('../../assets/mascot/halloween/trophy-champion.webp'),
  napping: require('../../assets/mascot/halloween/napping.webp'),
  'welcome-open-arms': require('../../assets/mascot/halloween/welcome-open-arms.webp'),
  'run-lets-go': require('../../assets/mascot/halloween/run-lets-go.webp'),
  'celebrate-jump': require('../../assets/mascot/halloween/celebrate-jump.webp'),
  'wink-nice': require('../../assets/mascot/halloween/wink-nice.webp'),
  'throw-game-on': require('../../assets/mascot/halloween/throw-game-on.webp'),
  'face-smile': require('../../assets/mascot/halloween/face-smile.webp'),
  'face-wink': require('../../assets/mascot/halloween/face-wink.webp'),
  'face-excited': require('../../assets/mascot/halloween/face-excited.webp'),
  'face-surprised': require('../../assets/mascot/halloween/face-surprised.webp'),
  'face-thinking': require('../../assets/mascot/halloween/face-thinking.webp'),
  'face-laughing': require('../../assets/mascot/halloween/face-laughing.webp'),
  'face-sad': require('../../assets/mascot/halloween/face-sad.webp'),
  'face-worried': require('../../assets/mascot/halloween/face-worried.webp'),
  'face-sleepy': require('../../assets/mascot/halloween/face-sleepy.webp'),
};

export const MASCOT_ASSETS: Record<SeasonId, Record<MascotPose, number>> = { base, halloween };
