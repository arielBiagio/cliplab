/** WebCodecs uses pq/hlg; accept common metadata aliases as well. */
export function isHdrTransfer(transfer: string | null | undefined): boolean {
  return ['pq', 'hlg', 'smpte2084', 'arib-std-b67'].includes(transfer ?? '');
}
