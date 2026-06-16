import { prisma } from '../config/database';

/**
 * Service to atomically generate a sequential, concurrent-safe document number
 * Format: <PREFIX>-<TYPE>-YYYY-XXXX
 */
export async function getNextDocumentNumber(
  type: 'INV' | 'QUO' | 'AGR',
  prefix: string
): Promise<string> {
  // Normalize prefix: convert to uppercase, trim, and strip non-alphanumeric characters
  const cleanPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const year = new Date().getFullYear();

  // Run raw query for atomic insert/update in Postgres with locking.
  // Using parameterized queries ensures SQL injection safety.
  const result = await prisma.$queryRaw<Array<{ lastValue: number }>>`
    INSERT INTO "DocumentCounter" ("prefix", "type", "year", "lastValue")
    VALUES (${cleanPrefix}, ${type}, ${year}, 1)
    ON CONFLICT ("prefix", "type", "year")
    DO UPDATE SET "lastValue" = "DocumentCounter"."lastValue" + 1
    RETURNING "lastValue";
  `;

  const lastValue = result[0]?.lastValue ?? 1;

  // Zero-pad sequence to 4 digits (e.g. 0001)
  const formattedSeq = String(lastValue).padStart(4, '0');

  return `${cleanPrefix}-${type}-${year}-${formattedSeq}`;
}
