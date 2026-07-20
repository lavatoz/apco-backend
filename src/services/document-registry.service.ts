import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

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
    try {
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
    } catch (error) {
      console.error("Document Registry Error (generateDocumentId):", error);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error("Code:", error.code);
        console.error("Meta:", error.meta);
      }
      throw error;
    }
  }

  /**
   * Constructs the appropriate verification URL depending on environment
   */
  static getVerificationUrl(documentId: string): string {
    return `https://verify.artisains.com/verify/${documentId}`;
  }

  /**
   * Idempotent lookup to get or generate the Document ID and verification URL
   */
  static async getOrCreateDocumentId(
    documentNumber: string,
    documentType: string,
    prefix?: string
  ): Promise<{ documentId: string; verificationUrl: string }> {
    try {
      // 1. Check if a document registry entry already exists for this documentNumber and documentType
      const existing = await prisma.documentRegistry.findFirst({
        where: {
          documentNumber,
          documentType,
        },
      });

      if (existing) {
        console.log(`[DocumentRegistry] Found existing entry for ${documentType} ${documentNumber}:`, existing.documentId);
        return {
          documentId: existing.documentId,
          verificationUrl: existing.verificationUrl,
        };
      }

      // 2. Otherwise, generate a new one
      const documentId = await this.generateDocumentId(prefix);
      const verificationUrl = this.getVerificationUrl(documentId);
      return { documentId, verificationUrl };
    } catch (error) {
      console.error("Document Registry Error (getOrCreateDocumentId):", error);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error("Code:", error.code);
        console.error("Meta:", error.meta);
      }
      throw error;
    }
  }

  /**
   * Registers a new document in the registry.
   */
  static async registerDocument(
    documentId: string,
    input: DocumentRegistryCreateInput
  ) {
    const verificationUrl = this.getVerificationUrl(documentId);

    // Validate payload and check constraints
    const payload = {
      documentId,
      verificationUrl,
      documentNumber: input.documentNumber,
      documentType: input.documentType,
      clientId: input.clientId,
      projectId: input.projectId || null,
      companyId: input.companyId || null,
      sha256Hash: input.sha256Hash
    };

    // Log the payload before writing to the database
    console.log("Document Registry Registration Payload:", payload);

    // Verify all required values exist
    if (!payload.documentId) throw new Error("Missing required field: documentId");
    if (!payload.verificationUrl) throw new Error("Missing required field: verificationUrl");
    if (!payload.documentNumber) throw new Error("Missing required field: documentNumber");
    if (!payload.documentType) throw new Error("Missing required field: documentType");
    if (!payload.clientId) throw new Error("Missing required field: clientId");
    if (!payload.sha256Hash) throw new Error("Missing required field: sha256Hash");

    try {
      return await prisma.documentRegistry.upsert({
        where: { documentId },
        update: {
          verificationUrl: payload.verificationUrl,
          documentNumber: payload.documentNumber,
          documentType: payload.documentType,
          clientId: payload.clientId,
          projectId: payload.projectId,
          companyId: payload.companyId,
          sha256Hash: payload.sha256Hash,
          status: 'Active',
        },
        create: {
          documentId: payload.documentId,
          verificationUrl: payload.verificationUrl,
          documentNumber: payload.documentNumber,
          documentType: payload.documentType,
          clientId: payload.clientId,
          projectId: payload.projectId,
          companyId: payload.companyId,
          sha256Hash: payload.sha256Hash,
          status: 'Active',
        },
      });
    } catch (error) {
      console.error("Document Registry Error (registerDocument):", error);

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error("Code:", error.code);
        console.error("Meta:", error.meta);
      }

      throw error;
    }
  }
}
