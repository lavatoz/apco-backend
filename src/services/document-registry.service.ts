import { prisma } from '../config/database';
import { env } from '../config/env';

export interface DocumentRegistryCreateInput {
  documentNumber: string;
  documentType: string;
  clientId: string;
  projectId?: string | null;
  companyId?: string | null;
  sha256Hash: string;
}

/**
 * Service to handle document registry operations and verification URL generation.
 */
export class DocumentRegistryService {
  /**
   * Generates a unique Document ID automatically from the Document Registry counter.
   * Format: <PREFIX>-DOC-YYYY-XXXXXX (6 digits, e.g. APCO-DOC-2026-000123)
   */
  static async generateDocumentId(prefix?: string): Promise<string> {
    let resolvedPrefix = prefix;
    if (!resolvedPrefix) {
      const defaultCompany = await prisma.companyProfile.findFirst({
        where: { isDefault: true, deletedAt: null },
      });
      resolvedPrefix = defaultCompany?.invoicePrefix || 'APCO';
    }

    const cleanPrefix = resolvedPrefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const year = new Date().getFullYear();

    // Insert/update in DocumentCounter using DOC prefix and year
    const result = await prisma.$queryRaw<Array<{ lastValue: number }>>`
      INSERT INTO "DocumentCounter" ("prefix", "type", "year", "lastValue")
      VALUES (${cleanPrefix}, 'DOC', ${year}, 1)
      ON CONFLICT ("prefix", "type", "year")
      DO UPDATE SET "lastValue" = "DocumentCounter"."lastValue" + 1
      RETURNING "lastValue";
    `;

    const lastValue = result[0]?.lastValue ?? 1;
    const formattedSeq = String(lastValue).padStart(6, '0');

    return `${cleanPrefix}-DOC-${year}-${formattedSeq}`;
  }

  /**
   * Constructs the appropriate verification URL depending on environment
   */
  static getVerificationUrl(documentId: string): string {
    if (env.NODE_ENV === 'production') {
      return `https://verify.artisains.com/${documentId}`;
    }
    return `http://localhost:3000/verify/${documentId}`;
  }

  /**
   * Registers a new document in the registry.
   */
  static async registerDocument(
    documentId: string,
    input: DocumentRegistryCreateInput
  ) {
    const verificationUrl = this.getVerificationUrl(documentId);

    return await prisma.documentRegistry.upsert({
      where: { documentId },
      update: {
        verificationUrl,
        documentNumber: input.documentNumber,
        documentType: input.documentType,
        clientId: input.clientId,
        projectId: input.projectId || null,
        companyId: input.companyId || null,
        sha256Hash: input.sha256Hash,
        status: 'Active',
      },
      create: {
        documentId,
        verificationUrl,
        documentNumber: input.documentNumber,
        documentType: input.documentType,
        clientId: input.clientId,
        projectId: input.projectId || null,
        companyId: input.companyId || null,
        sha256Hash: input.sha256Hash,
        status: 'Active',
      },
    });
  }
}
