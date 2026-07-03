import { prisma } from '../config/database';
import { AppError } from '../middleware/error';

/**
 * Assign a personnel member to an event
 */
export async function assignPersonnelToEvent(
  personnelId: string,
  eventId: string,
  assignedBy: string,
  notes?: string | null
) {
  // Check if personnel exists
  const personnel = await prisma.personnel.findUnique({
    where: { id: personnelId },
  });
  if (!personnel) {
    throw new AppError('Personnel member not found.', 404);
  }

  // Check if event exists
  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });
  if (!event) {
    throw new AppError('Event not found.', 404);
  }

  // Check if unique assignment already exists
  const existing = await prisma.personnelEventAssignment.findUnique({
    where: {
      personnelId_eventId: {
        personnelId,
        eventId,
      },
    },
  });
  if (existing) {
    throw new AppError('This personnel is already assigned to this event.', 400);
  }

  // Create new assignment
  return await prisma.personnelEventAssignment.create({
    data: {
      personnelId,
      eventId,
      assignedBy,
      notes: notes || null,
    },
    include: {
      event: true,
      personnel: true,
    },
  });
}

/**
 * Remove a personnel assignment from an event by personnel ID and event ID
 */
export async function removePersonnelFromEvent(personnelId: string, eventId: string) {
  const existing = await prisma.personnelEventAssignment.findUnique({
    where: {
      personnelId_eventId: {
        personnelId,
        eventId,
      },
    },
  });
  if (!existing) {
    throw new AppError('Assignment not found.', 404);
  }

  return await prisma.personnelEventAssignment.delete({
    where: {
      personnelId_eventId: {
        personnelId,
        eventId,
      },
    },
  });
}

/**
 * Remove a personnel assignment by assignment ID
 */
export async function removeAssignmentById(id: string) {
  const existing = await prisma.personnelEventAssignment.findUnique({
    where: { id },
  });
  if (!existing) {
    throw new AppError('Assignment not found.', 404);
  }

  return await prisma.personnelEventAssignment.delete({
    where: { id },
  });
}

/**
 * Retrieve all events assigned to a specific personnel member
 */
export async function getEventsForPersonnel(personnelId: string) {
  const personnel = await prisma.personnel.findUnique({
    where: { id: personnelId },
    include: {
      assignments: {
        include: {
          event: true,
        },
      },
    },
  });
  if (!personnel) {
    throw new AppError('Personnel member not found.', 404);
  }

  return personnel.assignments.map((a) => a.event);
}

/**
 * Retrieve all personnel assigned to a specific event
 */
export async function getPersonnelForEvent(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      personnelAssignments: {
        include: {
          personnel: true,
        },
      },
    },
  });
  if (!event) {
    throw new AppError('Event not found.', 404);
  }

  return event.personnelAssignments.map((a) => a.personnel);
}
