import mobileAds, { InitializationState, type AdapterStatus } from 'react-native-google-mobile-ads';

import { adsDiagLog } from './ads-diagnostics';

let initPromise: Promise<void> | null = null;
let sdkInitSummary: string | null = null;

export function getAdsSdkInitSummary(): string | null {
  return sdkInitSummary;
}

function summarizeAdapters(statuses: AdapterStatus[]): string {
  if (!statuses?.length) return '0 adapters';
  const ready = statuses.filter((s) => s.state === InitializationState.AdapterInitializationStateReady).length;
  return `${ready}/${statuses.length} adapters ready`;
}

/**
 * Initializes the Google Mobile Ads SDK once. Required before NativeAd / other requests
 * (especially on iOS). Safe to call from multiple places; returns the same promise.
 *
 * @see https://docs.page/invertase/react-native-google-mobile-ads
 */
export function ensureMobileAdsInitialized(): Promise<void> {
  if (initPromise == null) {
    initPromise = mobileAds()
      .initialize()
      .then((statuses) => {
        sdkInitSummary = summarizeAdapters(statuses);
        adsDiagLog('sdk_init_ok', {
          summary: sdkInitSummary,
          adapters: statuses.map((s) => ({
            name: s.name,
            state: s.state,
            desc: s.description,
          })),
        });
      })
      .catch((e: unknown) => {
        sdkInitSummary = 'init failed';
        adsDiagLog('sdk_init_err', { message: e instanceof Error ? e.message : String(e) });
        throw e;
      });
  }
  return initPromise;
}
