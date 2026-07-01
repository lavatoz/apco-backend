import { PrismaClient, Role } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  console.log(`🚀 Starting database user cleanup script... [Mode: ${isDryRun ? 'DRY-RUN' : 'PRODUCTION'}]`);

  // 1. Identify users to delete
  // Scope: Only CLIENT and STAFF. In our enum system, this corresponds to Role.Client.
  const targetRoles = [Role.Client];
  const usersToDelete = await prisma.user.findMany({
    where: {
      role: {
        in: targetRoles,
      },
    },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      linkedClientId: true,
    },
  });

  if (usersToDelete.length === 0) {
    console.log('ℹ️ No users matching the deletion scope (CLIENT/STAFF) were found.');
    return;
  }

  // 2. Identify the primary System Admin account to reassign ownership
  const primaryAdmin = await prisma.user.findFirst({
    where: {
      role: Role.SystemAdmin,
    },
    orderBy: {
      createdAt: 'asc', // Primary is the oldest/first created System Admin
    },
  });

  if (!primaryAdmin) {
    throw new Error('❌ Critical Error: No primary SystemAdmin account found to reassign relations!');
  }

  console.log(`👑 Primary System Admin for reassignment: ${primaryAdmin.email} (ID: ${primaryAdmin.id})`);

  // 3. Print summary of deletion
  console.log(`\n📋 Deletion Summary:`);
  console.log(`Total users to delete: ${usersToDelete.length}`);
  const countsByRole: Record<string, number> = {};
  for (const user of usersToDelete) {
    countsByRole[user.role] = (countsByRole[user.role] || 0) + 1;
  }
  for (const [role, count] of Object.entries(countsByRole)) {
    console.log(`  - Role ${role}: ${count} users`);
  }

  // 4. Create backup file
  const backupData = usersToDelete.map(user => ({
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    linkedClientId: user.linkedClientId,
    backedUpAt: new Date().toISOString(),
  }));

  const backupFilePath = path.join(__dirname, '..', 'deleted_users_backup.json');

  if (isDryRun) {
    console.log(`\n💾 [Dry-run] Would write backup data for ${usersToDelete.length} users to: ${backupFilePath}`);
  } else {
    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');
    console.log(`\n💾 Successfully wrote backup file to: ${backupFilePath}`);
  }

  const userIds = usersToDelete.map(u => u.id);

  // 5. Query and display affected relation counts for dry-run/preview
  const auditLogsCount = await prisma.auditLog.count({ where: { userId: { in: userIds } } });
  const securityEventsCount = await prisma.securityEvent.count({ where: { userId: { in: userIds } } });
  const filesCount = await prisma.file.count({ where: { userId: { in: userIds } } });
  const tasksCount = await prisma.task.count({ where: { assignedUserId: { in: userIds } } });
  const staffAssignmentsCount = await prisma.staffAssignment.count({ where: { userId: { in: userIds } } });

  console.log(`\nRelations to reassign to System Admin (${primaryAdmin.email}):`);
  console.log(`  - AuditLogs: ${auditLogsCount}`);
  console.log(`  - SecurityEvents: ${securityEventsCount}`);
  console.log(`  - Files: ${filesCount}`);
  console.log(`  - Tasks: ${tasksCount}`);
  console.log(`  - StaffAssignments: ${staffAssignmentsCount}`);

  if (isDryRun) {
    console.log('\n🛑 Dry-run mode completed. No database changes were made.');
    return;
  }

  // 6. Perform Reassignments
  console.log('\n🔄 Reassigning foreign key relations to System Admin...');

  if (auditLogsCount > 0) {
    const res = await prisma.auditLog.updateMany({
      where: { userId: { in: userIds } },
      data: { userId: primaryAdmin.id },
    });
    console.log(`  - Reassigned ${res.count} AuditLog records.`);
  }

  if (securityEventsCount > 0) {
    const res = await prisma.securityEvent.updateMany({
      where: { userId: { in: userIds } },
      data: { userId: primaryAdmin.id },
    });
    console.log(`  - Reassigned ${res.count} SecurityEvent records.`);
  }

  if (filesCount > 0) {
    const res = await prisma.file.updateMany({
      where: { userId: { in: userIds } },
      data: { userId: primaryAdmin.id },
    });
    console.log(`  - Reassigned ${res.count} File records.`);
  }

  if (tasksCount > 0) {
    const res = await prisma.task.updateMany({
      where: { assignedUserId: { in: userIds } },
      data: { assignedUserId: primaryAdmin.id },
    });
    console.log(`  - Reassigned ${res.count} Task records.`);
  }

  if (staffAssignmentsCount > 0) {
    // For staff assignments, to prevent primary key/unique issues or logic bugs
    // (e.g. if the Admin is already assigned to the same project), we'll do them individually.
    const assignments = await prisma.staffAssignment.findMany({
      where: { userId: { in: userIds } },
    });

    let reassignedCount = 0;
    let deletedDuplicateCount = 0;

    for (const assignment of assignments) {
      // Check if admin is already assigned to this project
      const adminExists = await prisma.staffAssignment.findFirst({
        where: {
          projectId: assignment.projectId,
          userId: primaryAdmin.id,
        },
      });

      if (adminExists) {
        // Delete duplicate assignment
        await prisma.staffAssignment.delete({
          where: { id: assignment.id },
        });
        deletedDuplicateCount++;
      } else {
        // Reassign assignment to admin
        await prisma.staffAssignment.update({
          where: { id: assignment.id },
          data: { userId: primaryAdmin.id },
        });
        reassignedCount++;
      }
    }
    console.log(`  - StaffAssignments: Reassigned ${reassignedCount}, deleted ${deletedDuplicateCount} duplicate project assignments.`);
  }

  // 7. Delete the users
  console.log('\n❌ Deleting users from User table...');
  const deleteResult = await prisma.user.deleteMany({
    where: {
      id: { in: userIds },
    },
  });
  console.log(`  - Successfully deleted ${deleteResult.count} users.`);

  // 8. Reset failed login attempts and lockouts for remaining administrative accounts
  console.log('\n🔒 Resetting login attempts and lockouts for remaining Admin accounts...');
  // Admins to reset: SystemAdmin role
  const resetResult = await prisma.user.updateMany({
    where: {
      role: Role.SystemAdmin,
    },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
  console.log(`  - Reset login lockouts for ${resetResult.count} System Admin account(s).`);

  // 9. Verify at least one admin account exists and print remaining
  const remainingAdmins = await prisma.user.findMany({
    where: {
      role: Role.SystemAdmin,
    },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      status: true,
    },
  });

  if (remainingAdmins.length === 0) {
    throw new Error('❌ Critical Error: All admin accounts have been removed!');
  }

  console.log('\n✅ Verification: At least one Admin account exists.');
  console.log('Remaining Admin Accounts:');
  remainingAdmins.forEach(admin => {
    console.log(`  - [${admin.role}] ${admin.email} (ID: ${admin.id}, Status: ${admin.status})`);
  });

  console.log('\n🎉 Cleanup process successfully completed!');
}

main()
  .catch((err) => {
    console.error('\n❌ Error executing cleanup:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
