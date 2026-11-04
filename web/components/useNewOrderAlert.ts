'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const SOUND_KEY = 'live-orders:sound';

/** Short two-tone beep with the Web Audio API: no sound file to ship. */
function beep(): void {
  const context = new AudioContext();
  [880, 1320].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.08;
    oscillator.connect(gain).connect(context.destination);
    const start = context.currentTime + index * 0.15;
    oscillator.start(start);
    oscillator.stop(start + 0.12);
  });
  setTimeout(() => void context.close(), 600);
}

/**
 * New-order signal: a beep (muted by default, remembered per browser) and "(n) Live Orders" in the
 * tab title while the tab is hidden, reset when the tab is shown again.
 */
export function useNewOrderAlert() {
  const appName = useTranslations('app')('name');
  const titleText = useTranslations('board');
  const [soundOn, setSoundOn] = useState(false);
  const unseen = useRef(0);

  useEffect(() => {
    try {
      setSoundOn(localStorage.getItem(SOUND_KEY) === 'on');
    } catch {
      // storage blocked: keep the sound off
    }
    const reset = () => {
      if (document.visibilityState === 'visible') {
        unseen.current = 0;
        document.title = appName;
      }
    };
    document.addEventListener('visibilitychange', reset);
    return () => document.removeEventListener('visibilitychange', reset);
  }, [appName]);

  const notify = useCallback(
    (count: number) => {
      if (soundOn) beep();
      if (document.visibilityState === 'hidden') {
        unseen.current += count;
        document.title = titleText('newOrders', { count: unseen.current, name: appName });
      }
    },
    [soundOn, appName, titleText],
  );

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      try {
        localStorage.setItem(SOUND_KEY, on ? 'off' : 'on');
      } catch {
        // storage blocked: the choice lasts until reload
      }
      return !on;
    });
  }, []);

  return useMemo(() => ({ soundOn, notify, toggleSound }), [soundOn, notify, toggleSound]);
}
