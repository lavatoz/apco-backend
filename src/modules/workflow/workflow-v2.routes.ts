import { Router } from 'express';
import { 
  getProjectWorkflow, 
  initializeProjectWorkflow, 
  updateProjectWorkflowStage, 
  deleteWorkflowStageAttachment 
} from './workflow-v2.controller';

// mergeParams allows this sub-router to access parameters from the parent router (e.g. :id for project)
const router = Router({ mergeParams: true });

router.get('/', getProjectWorkflow);
router.post('/', initializeProjectWorkflow);
router.put('/:stageId', updateProjectWorkflowStage);
router.delete('/:stageId/attachment/:attachmentId', deleteWorkflowStageAttachment);

export default router;
