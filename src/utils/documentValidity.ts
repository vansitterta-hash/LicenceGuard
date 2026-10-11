/** Date eligibility is independent of a document's stored verification state. */
export function certificateValidity(expiry: string | null | undefined): 'CURRENT' | 'MISSING' | 'EXPIRED' {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry) || !Number.isFinite(Date.parse(expiry))
    || new Date(expiry).toISOString().slice(0, 10) !== expiry) return 'MISSING';
  return expiry < new Date().toISOString().slice(0, 10) ? 'EXPIRED' : 'CURRENT';
}
