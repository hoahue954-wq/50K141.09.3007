import { randomInt } from 'node:crypto';

export type CodeKind =
  | 'product'
  | 'category'
  | 'customer'
  | 'invoice'
  | 'disposal'
  | 'return'
  | 'purchaseOrder';

const CODE_FORMATS: Record<Exclude<CodeKind, 'product'>, { prefix: string; digits: number }> = {
  category: { prefix: 'DM', digits: 3 },
  customer: { prefix: 'KH', digits: 6 },
  invoice: { prefix: 'BH', digits: 6 },
  disposal: { prefix: 'PHH', digits: 6 },
  return: { prefix: 'PHD', digits: 6 },
  purchaseOrder: { prefix: 'PHN', digits: 6 },
};

function randomDigits(length: number, firstDigitNonZero = false): string {
  return Array.from({ length }, (_, index) =>
    String(index === 0 && firstDigitNonZero ? randomInt(1, 10) : randomInt(0, 10)),
  ).join('');
}

export async function generateCode(
  kind: CodeKind,
  isTaken?: (code: string) => Promise<boolean>,
): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = kind === 'product'
      ? randomDigits(13, true)
      : `${CODE_FORMATS[kind].prefix}${randomDigits(CODE_FORMATS[kind].digits)}`;
    if (!isTaken || !(await isTaken(candidate))) return candidate;
  }

  throw new Error(`Không thể tạo mã ${kind} duy nhất.`);
}
