import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export class DisplayIdGenerator {
  /**
   * Safe, sequential, concurrent-safe Display ID generation using the DocumentCounter table.
   * Format: <PREFIX>-<YYYY>-<4-DIGIT-SEQUENCE> (e.g. CLI-2026-0001)
   */
  static async getNextId(
    prefix: 'CLI' | 'PRJ' | 'QUO' | 'INV' | 'AGR' | 'EVT',
    tx?: Prisma.TransactionClient
  ): Promise<string> {
    const client = tx || prisma;
    const year = new Date().getFullYear();

    // Use Raw SQL for atomic locking and incrementing on the DocumentCounter table
    const result = await client.$queryRaw<Array<{ lastValue: number }>>`
      INSERT INTO "DocumentCounter" ("prefix", "type", "year", "lastValue")
      VALUES (${prefix}, 'DISPLAY_ID', ${year}, 1)
      ON CONFLICT ("prefix", "type", "year")
      DO UPDATE SET "lastValue" = "DocumentCounter"."lastValue" + 1
      RETURNING "lastValue";
    `;

    const lastValue = result[0]?.lastValue ?? 1;
    const formattedSeq = String(lastValue).padStart(4, '0');
    return `${prefix}-${year}-${formattedSeq}`;
  }
}
