export async function claimPendingRecord(claim: () => Promise<number>): Promise<boolean> {
  return (await claim()) === 1;
}
