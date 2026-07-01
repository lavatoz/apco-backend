import { PrismaClient, WorkflowStageType, WorkflowStageStatus } from '@prisma/client';

const prisma = new PrismaClient();

const STAGES_ORDER = [
  WorkflowStageType.CLIENT_ONBOARDING,
  WorkflowStageType.AGREEMENT,
  WorkflowStageType.ADVANCE_PAYMENT,
  WorkflowStageType.PRE_PRODUCTION,
  WorkflowStageType.SHOOT,
  WorkflowStageType.POST_PRODUCTION,
  WorkflowStageType.EDITING,
  WorkflowStageType.DELIVERY,
  WorkflowStageType.PROJECT_CLOSURE,
];

function mapLegacyStageToWorkflowType(stage?: string): WorkflowStageType {
  if (!stage) return WorkflowStageType.CLIENT_ONBOARDING;
  
  const normalized = stage.toLowerCase().trim();
  switch (normalized) {
    case 'booked':
    case 'planning':
      return WorkflowStageType.CLIENT_ONBOARDING;
    case 'agreement signed':
      return WorkflowStageType.AGREEMENT;
    case 'advance paid':
      return WorkflowStageType.ADVANCE_PAYMENT;
    case 'team assigned':
      return WorkflowStageType.PRE_PRODUCTION;
    case 'shoot completed':
    case 'shoot':
    case 'event_done':
      return WorkflowStageType.SHOOT;
    case 'selection received':
    case 'selection':
      return WorkflowStageType.POST_PRODUCTION;
    case 'editing':
      return WorkflowStageType.EDITING;
    case 'delivery ready':
    case 'delivery':
      return WorkflowStageType.DELIVERY;
    case 'delivered':
    case 'completed':
      return WorkflowStageType.PROJECT_CLOSURE;
    default:
      return WorkflowStageType.CLIENT_ONBOARDING;
  }
}

async function migrate() {
  console.log('🏁 Starting workflow migration for existing projects...');

  const projects = await prisma.project.findMany();
  console.log(`Found ${projects.length} project(s) to process.`);

  let migratedCount = 0;

  for (const project of projects) {
    const currentType = mapLegacyStageToWorkflowType(project.stage);
    const currentIndex = STAGES_ORDER.indexOf(currentType);

    console.log(`Processing project "${project.name}" (ID: ${project.id}) - Legacy Stage: "${project.stage}" -> Mapped: "${currentType}"`);

    for (let index = 0; index < STAGES_ORDER.length; index++) {
      const type = STAGES_ORDER[index];
      
      let status: WorkflowStageStatus = WorkflowStageStatus.PENDING;
      let startedAt: Date | null = null;
      let completedAt: Date | null = null;

      if (index < currentIndex) {
        status = WorkflowStageStatus.COMPLETED;
        startedAt = project.createdAt;
        completedAt = project.updatedAt;
      } else if (index === currentIndex) {
        if (project.status.toLowerCase() === 'completed') {
          status = WorkflowStageStatus.COMPLETED;
          startedAt = project.createdAt;
          completedAt = project.updatedAt;
        } else {
          status = WorkflowStageStatus.IN_PROGRESS;
          startedAt = project.createdAt;
        }
      } else {
        status = WorkflowStageStatus.PENDING;
      }

      await prisma.workflowStage.upsert({
        where: {
          projectId_stageType: {
            projectId: project.id,
            stageType: type,
          },
        },
        create: {
          projectId: project.id,
          stageType: type,
          displayOrder: index,
          status,
          startedAt,
          completedAt,
        },
        update: {}, // Keep existing stages intact if already present
      });
    }

    migratedCount++;
  }

  console.log(`✅ Successfully initialized workflow stages for ${migratedCount} project(s).`);
}

migrate()
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
