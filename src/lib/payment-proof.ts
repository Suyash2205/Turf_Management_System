export function isBase64ProofUrl(url: string | null | undefined): boolean {
  return !!url?.startsWith("data:");
}

/** Client-safe URL to view a payment proof (never exposes base64 data URLs). */
export function paymentProofUrl(paymentId: string): string {
  return `/api/payments/${paymentId}/proof`;
}
