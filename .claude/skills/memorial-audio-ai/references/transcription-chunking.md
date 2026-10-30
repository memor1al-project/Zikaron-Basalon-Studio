# Audio Compression, Chunking & Transcription

Source: `website/services/transcriptionService.ts` (`compressAudioFile`, `splitAudioIntoChunks`, `transcribeAudioFile`, `transcribeAudio`).

**Depends on:** `@ffmpeg/ffmpeg` + `@ffmpeg/util` (same `initFFmpeg()` singleton as `memorial-video-ai/references/transcription.md` — reuse it, don't reload FFmpeg separately) and `@google/genai`. This file's `transcribeAudio()` is the exact same function documented in `memorial-video-ai/references/transcription.md`; it's referenced again here because audio-only uploads skip the video-specific extraction step and go straight to compress/chunk.

## Copy-paste example: compress, and split only if still too large

```ts
export async function compressAudioFile(audioFile: File): Promise<Blob> {
  const ff = await initFFmpeg();
  const ext = audioFile.name.split('.').pop()?.toLowerCase() || 'mp3';
  await ff.writeFile(`input.${ext}`, await fetchFile(audioFile));
  // 64kbps mono 16kHz — optimized for speech recognition, not listening quality
  await ff.exec(['-i', `input.${ext}`, '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', '-b:a', '64k', '-f', 'mp3', 'output.mp3']);
  return new Blob([await ff.readFile('output.mp3')], { type: 'audio/mp3' });
}

export async function splitAudioIntoChunks(audioFile: File, chunkDurationSeconds: number): Promise<{ chunks: Blob[]; totalDuration: number }> {
  const ff = await initFFmpeg();
  const ext = audioFile.name.split('.').pop()?.toLowerCase() || 'mp3';
  await ff.writeFile(`input.${ext}`, await fetchFile(audioFile));

  const totalDuration = await getAudioDurationFromBlob(new Blob([await fetchFile(audioFile)], { type: audioFile.type }))
    .catch(() => audioFile.size / (128 * 1024 / 8)); // fallback: rough estimate from file size at ~128kbps

  const numChunks = Math.ceil(totalDuration / chunkDurationSeconds);
  const chunks: Blob[] = [];
  for (let i = 0; i < numChunks; i++) {
    const outputFileName = `chunk_${i}.mp3`;
    await ff.exec(['-i', `input.${ext}`, '-ss', String(i * chunkDurationSeconds), '-t', String(chunkDurationSeconds),
                   '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', '-b:a', '64k', '-f', 'mp3', outputFileName]);
    chunks.push(new Blob([await ff.readFile(outputFileName)], { type: 'audio/mp3' }));
  }
  return { chunks, totalDuration };
}

// Orchestration used in the real pipeline (transcribeAudioFile):
// 1. compress the file
// 2. if compressed.size/(1024*1024) <= 20 → transcribeAudio(compressed) directly
// 3. else → splitAudioIntoChunks(original, ~300s) → transcribeAudio() each chunk → join transcripts with a separator
```

## Why compress before checking size, not after

Compressing first (64kbps mono 16kHz) shrinks most recordings well under the 20MB Gemini inline-audio ceiling on the first pass — chunking is the fallback for genuinely long recordings (an hour+), not the default path. Skipping straight to chunking wastes API calls on files that would have fit after simple compression.

## Portability checklist

1. `getAudioDurationFromBlob` uses an HTML5 `<audio>` element — browser-only. A server-side Node port needs `ffprobe` (or `fluent-ffmpeg`'s `ffprobe` wrapper) to get duration instead.
2. Chunk boundaries are naive time-slices (`chunkDurationSeconds` apart) — they can cut a sentence in half. Good enough for "get a full transcript," not good enough if you need clean per-chunk sentence boundaries; don't rely on chunk edges for anything downstream that needs sentence integrity.
3. When joining transcripts from multiple chunks, the real pipeline needs a visible separator/timestamp between chunks so a reader can tell where a chunk boundary fell, in case the join mid-sentence needs manual cleanup.
