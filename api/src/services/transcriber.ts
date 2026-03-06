import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import FormData from 'form-data';
import { config } from '../config';
import { ApiKeysRepository } from '../repositories/apiKeys.repository';
import { normalizeToWav } from '../utils/ffmpeg';
import { TranscriptionRequest, TranscriptionResult } from '../types';
import { randomUUID } from 'node:crypto';

/**
 * Transcriber Service
 * Handles audio file transcription using the ML service
 */
export const transcribeService = {
  /**
   * Transcribe an audio file to text
   */
  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const { filePath, fileName, language, task } = request;

    // Normalize audio to WAV format
    const normalizedPath = path.join(path.dirname(filePath), `${randomUUID()}.wav`);

    try {
      await normalizeToWav(filePath, normalizedPath);

      // Send to ML service
      const result = await transcribeWithMlService(normalizedPath, language, task);

      return result;
    } finally {
      // Clean up normalized file
      try {
        await fs.promises.unlink(normalizedPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  },

  /**
   * Record API key usage
   */
  async recordUsage(apiKey: string): Promise<void> {
    ApiKeysRepository.recordUsage(apiKey);
  },

  /**
   * Get transcription history (placeholder)
   */
  async getHistory(apiKey: string): Promise<any[]> {
    // TODO: Implement transcription history
    return [];
  },
};

/**
 * Transcribe audio file using ML service
 * @internal
 */
export async function transcribeWithMlService(
  filePath: string,
  language: string = 'auto',
  task: string = 'transcribe',
): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), path.basename(filePath));

  if (language && language !== 'auto') {
    form.append('language', language);
  }

  if (task && task !== 'transcribe') {
    form.append('task', task);
  }

  const response = await axios.post<TranscriptionResult>(
    `${config.ml.serviceUrl}/transcribe`,
    form,
    {
      headers: form.getHeaders(),
      timeout: 1000 * 60 * 10, // 10 minutes
    },
  );

  return response.data;
}
