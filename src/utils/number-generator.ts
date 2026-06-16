import { prisma } from '../config/database';
import { getNextDocumentNumber } from '../services/document-counter.service';

/**
 * Generates a company-based sequential document number
 * Format: <PREFIX>-<TYPE>-YYYY-XXXX
 */
export async function generateDocumentNumber(
  type: 'INV' | 'QUO' | 'AGR',
  prefix?: string
): Promise<string> {
  // 1. Resolve company prefix (fallback to default company, then 'APCO')
  let resolvedPrefix = prefix;
  if (!resolvedPrefix) {
    const defaultCompany = await prisma.companyProfile.findFirst({
      where: { isDefault: true, deletedAt: null },
    });
    resolvedPrefix = defaultCompany?.invoicePrefix || 'APCO';
  }

  // Delegate to DocumentCounter service for concurrent-safe generation
  return getNextDocumentNumber(type, resolvedPrefix);
}
