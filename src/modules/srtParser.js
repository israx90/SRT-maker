/**
 * SRT Parser & Serializer
 * Handles parsing .srt files into subtitle objects and serializing back
 */

/**
 * Parse a time string "HH:MM:SS,mmm" into milliseconds
 */
export function parseTimeToMs(timeStr) {
  const match = timeStr.trim().match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return 0;
  const [, h, m, s, ms] = match;
  return parseInt(h) * 3600000 + parseInt(m) * 60000 + parseInt(s) * 1000 + parseInt(ms);
}

/**
 * Convert milliseconds to SRT time format "HH:MM:SS,mmm"
 */
export function msToSrtTime(ms) {
  if (ms < 0) ms = 0;
  const hours = Math.floor(ms / 3600000);
  ms %= 3600000;
  const minutes = Math.floor(ms / 60000);
  ms %= 60000;
  const seconds = Math.floor(ms / 1000);
  const millis = Math.floor(ms % 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

/**
 * Format milliseconds to display format "MM:SS.mmm"
 */
export function msToDisplay(ms) {
  if (ms < 0) ms = 0;
  const minutes = Math.floor(ms / 60000);
  ms %= 60000;
  const seconds = Math.floor(ms / 1000);
  const millis = Math.floor(ms % 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/**
 * Parse SRT text content into array of subtitle objects
 * @param {string} srtContent - Raw SRT file content
 * @returns {Array<{id: number, startTime: number, endTime: number, text: string}>}
 */
export function parseSRT(srtContent) {
  const subtitles = [];
  // Normalize line endings
  const content = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Split into blocks
  const blocks = content.split(/\n\n+/).filter(block => block.trim());

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // First line should be the sequence number
    const id = parseInt(lines[0].trim());
    if (isNaN(id)) continue;

    // Second line should be the timecode
    const timeMatch = lines[1].match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
    );
    if (!timeMatch) continue;

    const startTime = parseTimeToMs(timeMatch[1]);
    const endTime = parseTimeToMs(timeMatch[2]);

    // Remaining lines are the subtitle text
    const text = lines.slice(2).join('\n').trim();

    subtitles.push({ id, startTime, endTime, text });
  }

  return subtitles.sort((a, b) => a.startTime - b.startTime);
}

/**
 * Serialize subtitle objects array into SRT format string
 * @param {Array<{id: number, startTime: number, endTime: number, text: string}>} subtitles
 * @returns {string} SRT formatted string
 */
export function serializeSRT(subtitles) {
  return subtitles
    .sort((a, b) => a.startTime - b.startTime)
    .map((sub, index) => {
      const id = index + 1;
      const start = msToSrtTime(sub.startTime);
      const end = msToSrtTime(sub.endTime);
      return `${id}\n${start} --> ${end}\n${sub.text}`;
    })
    .join('\n\n') + '\n';
}

/**
 * Validate SRT content and return issues
 */
export function validateSRT(subtitles) {
  const issues = [];
  for (let i = 0; i < subtitles.length; i++) {
    const sub = subtitles[i];
    if (sub.endTime <= sub.startTime) {
      issues.push({ index: i, type: 'invalid_duration', message: `Subtítulo ${i + 1}: Tiempo final <= tiempo inicial` });
    }
    if (!sub.text.trim()) {
      issues.push({ index: i, type: 'empty_text', message: `Subtítulo ${i + 1}: Texto vacío` });
    }
    if (i > 0 && sub.startTime < subtitles[i - 1].endTime) {
      issues.push({
        index: i,
        type: 'overlap',
        message: `Subtítulo ${i + 1}: Se solapa con el subtítulo ${i}`,
        overlapMs: subtitles[i - 1].endTime - sub.startTime
      });
    }
  }
  return issues;
}
