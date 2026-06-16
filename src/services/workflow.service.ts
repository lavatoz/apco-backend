import { prisma } from '../config/database';

interface LogWorkflowParams {
  projectId: string;
  eventType: string; // e.g., 'PROJECT_CREATED', 'MILESTONE_UPDATED', 'INVOICE_ISSUED', 'PAYMENT_RECEIVED', 'FILE_UPLOADED', 'PROJECT_COMPLETED'
  description: string;
  payload?: any;
}

/**
 * Helper to log a project workflow event timeline entry
 */
export async function logWorkflowEvent({
  projectId,
  eventType,
  description,
  payload = {},
}: LogWorkflowParams) {
  try {
    const event = await prisma.workflowEvent.create({
      data: {
        projectId,
        eventType,
        description,
        payload: payload ? JSON.parse(JSON.stringify(payload)) : undefined,
      },
    });
    return event;
  } catch (error) {
    console.error(`Failed to log workflow event for project ${projectId}:`, error);
    // Do not crash the parent transaction if logging a workflow event fails
    return null;
  }
}
