import { Router, Request, Response } from 'express';
import {
  summarizeMaterial,
  buildMaterialTimeline,
  composeMaterialStory,
  transcribeAudioClip,
  segmentTestimony,
  draftStoryFromText,
} from '../services/geminiMaterials';

const router = Router();

/**
 * Cost ceiling on transcription, mirroring MAX_TRANSCRIBE_SECONDS in the client's
 * transcriptionService. Audio reaching this route is always the client's own 64kbps mono
 * encode, so bytes convert to running time directly; the allowance is generous enough that
 * a legitimate fifteen-minute clip can't be rejected for being slightly over.
 */
const MAX_TRANSCRIBE_SECONDS = 15 * 60;
const MAX_TRANSCRIBE_BYTES = Math.ceil((MAX_TRANSCRIBE_SECONDS * 64 * 1024) / 8) * 1.2;

function getText(req: Request, res: Response): string | null {
  const { text } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'text is required' });
    return null;
  }
  return text;
}

router.post('/summarize', async (req, res) => {
  const text = getText(req, res);
  if (text === null) return;
  try {
    res.json(await summarizeMaterial(text));
  } catch (error) {
    console.error('[materials/summarize] Gemini request failed:', error);
    res.status(502).json({ error: 'AI request failed' });
  }
});

router.post('/timeline', async (req, res) => {
  const text = getText(req, res);
  if (text === null) return;
  try {
    res.json(await buildMaterialTimeline(text));
  } catch (error) {
    console.error('[materials/timeline] Gemini request failed:', error);
    res.status(502).json({ error: 'AI request failed' });
  }
});

router.post('/story', async (req, res) => {
  const text = getText(req, res);
  if (text === null) return;
  try {
    res.json(await composeMaterialStory(text));
  } catch (error) {
    console.error('[materials/story] Gemini request failed:', error);
    res.status(502).json({ error: 'AI request failed' });
  }
});

router.post('/transcribe', async (req, res) => {
  const { audioBase64, withTimestamps, clipDurationSeconds } = req.body ?? {};
  if (typeof audioBase64 !== 'string' || !audioBase64) {
    res.status(400).json({ error: 'audioBase64 is required' });
    return;
  }

  // The client refuses long recordings before it gets here, but that check runs in a
  // browser the user controls. This is the one that actually holds: without it, a single
  // crafted request can bill an arbitrary amount of Gemini audio to the project.
  const audioBytes = Math.floor((audioBase64.length * 3) / 4);
  if (audioBytes > MAX_TRANSCRIBE_BYTES) {
    res.status(413).json({
      error: `Audio too long. Transcription is limited to ${
        MAX_TRANSCRIBE_SECONDS / 60
      } minutes per request.`,
    });
    return;
  }

  try {
    res.json(
      await transcribeAudioClip(
        audioBase64,
        withTimestamps === true,
        typeof clipDurationSeconds === 'number' && clipDurationSeconds > 0 ? clipDurationSeconds : undefined
      )
    );
  } catch (error) {
    console.error('[materials/transcribe] Gemini request failed:', error);
    res.status(502).json({ error: 'AI request failed' });
  }
});

router.post('/segment', async (req, res) => {
  const { transcript, cues, durationSeconds, language } = req.body ?? {};
  if (typeof transcript !== 'string' || !transcript.trim()) {
    res.status(400).json({ error: 'transcript is required' });
    return;
  }
  if (typeof durationSeconds !== 'number' || !(durationSeconds > 0)) {
    res.status(400).json({ error: 'durationSeconds must be a positive number' });
    return;
  }
  try {
    res.json(
      await segmentTestimony({
        transcript,
        cues: Array.isArray(cues) ? cues : undefined,
        durationSeconds,
        language: typeof language === 'string' ? language : undefined,
      })
    );
  } catch (error) {
    console.error('[materials/segment] Gemini request failed:', error);
    res.status(502).json({ error: 'AI request failed' });
  }
});

router.post('/draft-story', async (req, res) => {
  const { text, template } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'text is required' });
    return;
  }
  if (!Array.isArray(template) || template.length === 0) {
    res.status(400).json({ error: 'template is required' });
    return;
  }
  try {
    res.json(await draftStoryFromText({ text, template }));
  } catch (error) {
    console.error('[materials/draft-story] Gemini request failed:', error);
    res.status(502).json({ error: 'AI request failed' });
  }
});

export default router;
