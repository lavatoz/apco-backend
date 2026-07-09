import { prisma } from '../../config/database';
import { DisplayIdGenerator } from '../../services/display-id.service';
import { createProjectFolderStructure } from '../../services/google-drive.service';
import { AppError } from '../../middleware/error';

export class ProjectsService {
  static async createProject(
    name: string,
    description: string | undefined,
    status: string,
    clientId: string
  ) {
    // Verify client exists
    const client = await prisma.client.findFirst({
      where: { id: clientId, deletedAt: null },
    });
    if (!client) {
      throw new AppError('Client record not found.', 400);
    }

    // Auto-provision Google Drive folder structures
    let folderStructure: any = {};
    try {
      folderStructure = await createProjectFolderStructure(client.name, name);
    } catch (driveError) {
      console.error('Google Drive folder structure provisioning failed:', driveError);
    }

    const project = await prisma.$transaction(async (tx) => {
      const projectCode = await DisplayIdGenerator.getNextId('PRJ', tx);

      const p = await tx.project.create({
        data: {
          name,
          description,
          status,
          clientId,
          projectCode,
          driveFolderId: folderStructure.driveFolderId || null,
          galleryFolderId: folderStructure.galleryFolderId || null,
          deliverablesFolderId: folderStructure.deliverablesFolderId || null,
          agreementsFolderId: folderStructure.agreementsFolderId || null,
          invoicesFolderId: folderStructure.invoicesFolderId || null,
          quotationsFolderId: folderStructure.quotationsFolderId || null,
        },
      });

      const stages = [
        'CLIENT_ONBOARDING',
        'AGREEMENT',
        'ADVANCE_PAYMENT',
        'PRE_PRODUCTION',
        'SHOOT',
        'POST_PRODUCTION',
        'EDITING',
        'DELIVERY',
        'PROJECT_CLOSURE',
      ];

      for (let i = 0; i < stages.length; i++) {
        await tx.workflowStage.create({
          data: {
            projectId: p.id,
            stageType: stages[i] as any,
            displayOrder: i,
            status: i === 0 ? 'IN_PROGRESS' : 'PENDING',
            startedAt: i === 0 ? new Date() : null,
          },
        });
      }

      return p;
    });

    return { project, folderStructure };
  }
}
