import { useEffect, useState } from 'react';
import { addDays, sameDay, today } from './dates';

const CHECK = 'epizen:check-today';

/**
 * Makes every `useToday` look at the clock again now: for a moment when the day may have turned
 * without the window knowing, like the menu bar's panel opening on a window that slept hidden.
 */
export function checkToday() {
  window.dispatchEvent(new Event(CHECK));
}

/** Milliseconds to just past the coming midnight. */
const untilTomorrow = () => Math.max(1000, addDays(today(), 1).getTime() - Date.now() + 1000);

/**
 * Today, as a local midnight that moves on at midnight. Anything that means "today" (the home
 * screen, its Today, Week and Month buttons) reads this rather than the clock, so an app left
 * open overnight doesn't keep offering yesterday. It also looks again when the window gets
 * focus, or `checkToday` asks, since a Mac asleep over midnight holds its timers back.
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
    window.addEventListener(CHECK, check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', check);
      window.removeEventListener(CHECK, check);
    };
  }, []);
  return date;
}
