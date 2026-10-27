import { useEffect, useState } from 'react';
import { addDays, sameDay, today } from './dates';

/** Milliseconds to just past the coming midnight. */
const untilTomorrow = () => Math.max(1000, addDays(today(), 1).getTime() - Date.now() + 1000);

/**
 * Today, as a local midnight that moves on at midnight. Anything that means "today" (the home
 * screen, its Today, Week and Month buttons) reads this rather than the clock, so an app left
 * open overnight doesn't keep offering yesterday. It also looks again when the window gets
 * focus, since a Mac asleep over midnight holds its timers back.
 */
export function useToday(): Date {
  const [date, setDate] = useState(today);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      setDate((shown) => (sameDay(shown, today()) ? shown : today()));
      clearTimeout(timer);
      timer = setTimeout(check, untilTomorrow());
    };
    timer = setTimeout(check, untilTomorrow());
    window.addEventListener('focus', check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', check);
    };
  }, []);
  return date;
}
