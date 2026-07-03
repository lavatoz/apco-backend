import { Router } from 'express';
import { 
  getProjects, 
  getProjectById, 
  createProject, 
  updateProject, 
  assignStaff, 
  removeStaff, 
  deleteProject,
  updateProjectStage,
  updateStaffAssignedEvents
} from './projects.controller';
import {
  getProjectGalleryPhotos,
  togglePhotoReviewState,
  toggleFavoritePhoto,
  submitPhotoSelection,
  updateGalleryStatus,
  downloadSelectedPhotos
} from './gallery.controller';
import { authenticate } from '../../middleware/auth';
import { validateBody } from '../../middleware/validation';
import { CreateProjectSchema, UpdateProjectSchema, AssignStaffSchema, UpdateAssignedEventsSchema } from './projects.validation';
import workflowV2Routes from '../workflow/workflow-v2.routes';

const router = Router();

// Protect all project routes
router.use(authenticate);

// Gallery & Photo Selection Routes (Mounted before dynamic :id routes to prevent interceptions)
router.get('/:id/gallery-photos', getProjectGalleryPhotos);
router.post('/:id/gallery/:galleryPhotoId/favorite', toggleFavoritePhoto);
router.post('/:id/gallery/:galleryPhotoId/review', togglePhotoReviewState);
router.post('/:id/gallery/submit', submitPhotoSelection);
router.post('/:id/gallery/status', updateGalleryStatus);
router.get('/:id/gallery/download-selected', downloadSelectedPhotos);

// Base Project Routes
router.get('/', getProjects);
router.get('/:id', getProjectById);
router.post('/', validateBody(CreateProjectSchema), createProject);
router.put('/:id', validateBody(UpdateProjectSchema), updateProject);
router.put('/:id/stage', updateProjectStage);
router.use('/:id/workflow', workflowV2Routes);
router.post('/:id/assign', validateBody(AssignStaffSchema), assignStaff);
router.post('/:id/unassign', removeStaff);
router.put('/:id/staff/:userId/events', validateBody(UpdateAssignedEventsSchema), updateStaffAssignedEvents);
router.delete('/:id', deleteProject);

export default router;
