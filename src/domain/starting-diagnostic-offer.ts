/**
 * Readiness only offers the starting diagnostic to a student with no answered
 * questions. After that it is a repeat prompt for something already done.
 */
export function shouldOfferStartingDiagnostic(attemptCount: number): boolean {
  return attemptCount === 0;
}
