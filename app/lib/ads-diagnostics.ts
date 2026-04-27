import { Platform } from 'react-native';

/**
 * Enable verbose ads logging + the swipe-screen diagnostics overlay.
 * - `__DEV__` is on by default in dev builds.
 * - For TestFlight/production builds, set `EXPO_PUBLIC_ADS_DIAG=1` in EAS env and rebuild.
 *
 * Filter device logs by: `[AdsDiag]`
 */
export function isAdsDiagnosticsEnabled(): boolean {
  return (
    __DEV__ ||
    process.env.EXPO_PUBLIC_ADS_DIAG === '1' ||
    process.env.EXPO_PUBLIC_ADS_DIAG === 'true'
  );
}

export function maskAdUnitId(id: string): string {
  if (id.length <= 24) return id;
  return `${id.slice(0, 16)}…${id.slice(-8)}`;
}

/** Stable prefix for Console.app / Metro / Xcode: search `AdsDiag` */
export function adsDiagLog(phase: string, payload: Record<string, unknown> = {}): void {
  if (!isAdsDiagnosticsEnabled()) return;
  try {
    console.log(
      `[AdsDiag] ${phase}`,
      JSON.stringify({ platform: Platform.OS, ...payload, t: Date.now() })
    );
  } catch {
    console.log(`[AdsDiag] ${phase}`, payload);
  }
}

export type AdsDeckDiagSnapshot = {
  adUnitMasked: string;
  useRealAds: boolean;
  /** Runtime toggle: test (Google test id) vs real (your prod unit) vs env (build default). */
  adsMode: 'test' | 'real' | 'env';
  sdkInitSummary: string | null;
  lastPreload:
    | {
        slotId: string;
        ok: boolean;
        ms?: number;
        err?: string;
        headlineLen?: number;
        hasMedia?: boolean;
        responseId?: string;
      }
    | null;
  currentIndex: number;
  deckLen: number;
  currentKind: 'title' | 'ad' | 'none';
  currentAdSlotId?: string;
  nativeReadyForCurrent: boolean | null;
  stackOffset: number;
  stackTopDesc: string;
};
