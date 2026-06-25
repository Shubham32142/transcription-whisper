import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import FormData from 'form-data';
import { config } from '../config';
import { ApiKeysRepository } from '../repositories/apiKeys.repository';
import { normalizeToWav } from '../utils/ffmpeg';
import { TranscriptionJob, TranscriptionRequest, TranscriptionResult } from '../types';
import { randomUUID } from 'node:crypto';

const joinUrl = (baseUrl: string, endpointPath: string): string => {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  return `${normalizedBase}${normalizedPath}`;
};

/**
 * Transcriber Service
 * Handles audio file transcription using the ML service
 */
export const transcribeService = {
  /**
   * Transcribe an audio file to text
   */
  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const { filePath, language, task, model } = request;

    // Normalize audio to WAV format
    const normalizedPath = path.join(path.dirname(filePath), `${randomUUID()}.wav`);

    try {
      await normalizeToWav(filePath, normalizedPath);

      // Send to ML service
      const result = await transcribeWithMlService(normalizedPath, language, task, model);

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
    await ApiKeysRepository.recordUsage(apiKey);
  },

  /**
   * Get transcription history (placeholder)
   */
  getHistory(_apiKey: string): TranscriptionResult[] {
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
  model: string = 'distil-large-v3',
): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), path.basename(filePath));

  if (model) {
    form.append('model', model);
  }

  if (language && language !== 'auto') {
    form.append('language', language);
  }

  if (task && task !== 'transcribe') {
    form.append('task', task);
  }

  const headers = {
    ...form.getHeaders(),
    ...(config.ml.serviceToken ? { Authorization: `Bearer ${config.ml.serviceToken}` } : {}),
  };

  const response = await axios.post<TranscriptionResult>(
    joinUrl(config.ml.serviceUrl, config.ml.transcribePath),
    form,
    {
      headers,
      timeout: config.ml.requestTimeoutMs,
    },
  );

  return response.data;
}

export async function createTranscriptionJobWithMlService(
  filePath: string,
  fileName: string,
  language: string = 'auto',
  task: string = 'transcribe',
  model: string = 'distil-large-v3',
): Promise<TranscriptionJob> {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), fileName || path.basename(filePath));

  if (model) {
    form.append('model', model);
  }

  if (language) {
    form.append('language', language);
  }

  if (task) {
    form.append('task', task);
  }

  const headers = {
    ...form.getHeaders(),
    ...(config.ml.serviceToken ? { Authorization: `Bearer ${config.ml.serviceToken}` } : {}),
  };

  const response = await axios.post<TranscriptionJob>(
    joinUrl(config.ml.serviceUrl, `${config.ml.transcribePath}/jobs`),
    form,
    {
      headers,
      timeout: config.ml.requestTimeoutMs,
    },
  );

  return response.data;
}

export async function getTranscriptionJobFromMlService(jobId: string): Promise<TranscriptionJob> {
  const response = await axios.get<TranscriptionJob>(
    joinUrl(config.ml.serviceUrl, `${config.ml.transcribePath}/jobs/${jobId}`),
    {
      headers: config.ml.serviceToken ? { Authorization: `Bearer ${config.ml.serviceToken}` } : {},
      timeout: config.ml.jobPollTimeoutMs,
    },
  );

  return response.data;
}

export async function deleteTranscriptionJobFromMlService(
  jobId: string,
): Promise<{ id: string; deleted: boolean }> {
  const response = await axios.delete<{ id: string; deleted: boolean }>(
    joinUrl(config.ml.serviceUrl, `${config.ml.transcribePath}/jobs/${jobId}`),
    {
      headers: config.ml.serviceToken ? { Authorization: `Bearer ${config.ml.serviceToken}` } : {},
      timeout: config.ml.jobPollTimeoutMs,
    },
  );

  return response.data;
}
