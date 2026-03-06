import type { Request, Response, NextFunction } from 'express';

const languagePattern = /^[a-z]{2,3}$/i;

export function validateTranscribeRequest(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as { language?: string; task?: string } | undefined;
  const languageRaw = body?.language;
  const taskRaw = body?.task;

  if (!req.file) {
    res.status(400).json({ success: false, error: 'Audio file is required' });
    return;
  }

  if (languageRaw && languageRaw !== 'auto' && !languagePattern.test(languageRaw)) {
    res.status(400).json({ success: false, error: 'Invalid language value' });
    return;
  }

  if (taskRaw && taskRaw !== 'transcribe' && taskRaw !== 'translate') {
    res.status(400).json({ success: false, error: 'Invalid task value' });
    return;
  }

  next();
}
