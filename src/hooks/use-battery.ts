'use client';

import { useEffect, useState } from 'react';

interface BatteryManager extends EventTarget {
  charging: boolean;
  level: number;
}

export function useBattery() {
  const [isLowBattery, setIsLowBattery] = useState(false);

  useEffect(() => {
    let battery: BatteryManager | null = null;

    const update = () => {
      if (!battery) return;
      setIsLowBattery(!battery.charging && battery.level < 0.2);
    };

    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    if (!nav.getBattery) return;

    nav.getBattery().then((b) => {
      battery = b;
      update();
      b.addEventListener('chargingchange', update);
      b.addEventListener('levelchange', update);
    }).catch(() => {
      // unsupported
    });

    return () => {
      if (battery) {
        battery.removeEventListener('chargingchange', update);
        battery.removeEventListener('levelchange', update);
      }
    };
  }, []);

  return { isLowBattery };
}
