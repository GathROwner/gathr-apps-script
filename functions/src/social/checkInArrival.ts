/** Qualified evidence on the existing readiness session; never a separate grant. */
export const CHECK_IN_ARRIVAL_TTL_MS = 3 * 60_000;
export interface CheckInQualifiedArrival {
  sessionId: string;
  expiresAtMs: number;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAtMs: number;
  here: boolean;
  place: boolean;
}

export function storedQualifiedArrival(value: unknown, sessionId: string, nowMs: number): CheckInQualifiedArrival | null {
  if (!value || typeof value !== 'object') return null;
  const arrival = value as CheckInQualifiedArrival;
  return arrival.sessionId === sessionId
    && Number.isFinite(arrival.expiresAtMs) && arrival.expiresAtMs > nowMs
    && arrival.expiresAtMs <= nowMs + CHECK_IN_ARRIVAL_TTL_MS
    && Number.isFinite(arrival.latitude) && Math.abs(arrival.latitude) <= 90
    && Number.isFinite(arrival.longitude) && Math.abs(arrival.longitude) <= 180
    && Number.isFinite(arrival.accuracyMeters) && arrival.accuracyMeters >= 0 && arrival.accuracyMeters <= 50
    && Number.isSafeInteger(arrival.capturedAtMs) && arrival.capturedAtMs <= nowMs + 10_000
    && arrival.here === true && typeof arrival.place === 'boolean'
    && (!arrival.place || arrival.accuracyMeters <= 25)
    ? arrival : null;
}
