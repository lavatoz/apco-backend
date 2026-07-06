import { Request, Response, NextFunction } from 'express';
import { MessagesService } from './messages.service';

export async function getProjectMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { projectId } = req.params;
    const user = req.user!;

    // Optional pagination checks if query params are provided
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const cursor = req.query.cursor ? (req.query.cursor as string) : undefined;

    const messages = await MessagesService.getMessages(projectId, user, { limit, cursor });

    res.status(200).json(messages);
  } catch (error) {
    next(error);
  }
}

export async function createProjectMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { projectId } = req.params;
    const user = req.user!;
    const { message } = req.body;

    const newMessage = await MessagesService.createMessage(projectId, user, message);

    res.status(201).json(newMessage);
  } catch (error) {
    next(error);
  }
}
