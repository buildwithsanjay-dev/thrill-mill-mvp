import { useEffect, useState } from 'react';

// "Good Morning / Afternoon / Evening" for a given moment.
export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

// Live greeting: re-evaluated every minute, so it flips from Morning to
// Afternoon to Evening on its own while the app stays open.
export function useGreeting(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return greetingFor(now);
}
