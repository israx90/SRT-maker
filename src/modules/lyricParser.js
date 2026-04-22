/**
 * Lyric Parser & Serializer
 * Native format for IRXs Lyric Studio
 * Handles parsing .lyric files and serializing back
 * 
 * Format spec:
 *   #LYRIC v1.0            ← Version header (required, first line)
 *   @SECTION TYPE start > end
 *   @SECTION CUSTOM "name" start > end
 *   #N start > end         ← Primary subtitle (layer 0)
 *   #N start > end [OVR]   ← Overlay subtitle (layer 1)
 *   Text lines follow...
 */

// ─── Time Utilities ───

/**
 * Convert milliseconds to lyric time format "MM:SS.mmm"
 */
export function msToLyricTime(ms) {
  if (ms < 0) ms = 0;
  const minutes = Math.floor(ms / 60000);
  ms %= 60000;
  const seconds = Math.floor(ms / 1000);
  const millis = Math.floor(ms % 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/**
 * Parse lyric time format "MM:SS.mmm" into milliseconds
 */
export function lyricTimeToMs(timeStr) {
  const match = timeStr.trim().match(/(\d{1,3}):(\d{2})\.(\d{3})/);
  if (!match) return 0;
  const [, m, s, ms] = match;
  return parseInt(m) * 60000 + parseInt(s) * 1000 + parseInt(ms);
}

// ─── Parser ───

/**
 * Parse a .lyric file content into structured data
 * @param {string} content - Raw .lyric file content
 * @returns {{ version: string, sections: Array, subtitles: Array }}
 */
export function parseLyric(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  let version = '1.0';
  const sections = [];
  const subtitles = [];

  let i = 0;

  // ─ Parse header ─
  if (lines.length > 0 && lines[0].trim().startsWith('#LYRIC')) {
    const vMatch = lines[0].match(/#LYRIC\s+v?([\d.]+)/);
    if (vMatch) version = vMatch[1];
    i = 1;
  }

  // ─ Parse body ─
  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip empty lines and visual separators
    if (line === '' || line === '---' || line === '===') {
      i++;
      continue;
    }

    // Section: @SECTION TYPE start > end  OR  @SECTION CUSTOM "name" start > end
    if (line.startsWith('@SECTION')) {
      const section = _parseSection(line);
      if (section) sections.push(section);
      i++;
      continue;
    }

    // Subtitle block: #N start > end [OVR]?
    const subHeaderMatch = line.match(/^#(\d+)\s+([\d:.]+)\s*>\s*([\d:.]+)\s*(\[OVR\])?$/);
    if (subHeaderMatch) {
      const startTime = lyricTimeToMs(subHeaderMatch[2]);
      const endTime = lyricTimeToMs(subHeaderMatch[3]);
      const layer = subHeaderMatch[4] ? 1 : 0;

      // Collect text lines until next block marker or end
      const textLines = [];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        const trimmed = nextLine.trim();
        // Stop at next block, section, or header
        if (trimmed.startsWith('#') || trimmed.startsWith('@SECTION')) break;
        // Skip separators within text collection
        if (trimmed === '---' || trimmed === '===') { i++; continue; }
        // Empty line after text = end of this block
        if (trimmed === '' && textLines.length > 0) { i++; break; }
        // Empty line before text = skip
        if (trimmed === '' && textLines.length === 0) { i++; continue; }
        textLines.push(nextLine.trimEnd()); // Preserve internal line content but trim trailing whitespace
        i++;
      }

      subtitles.push({
        startTime,
        endTime,
        text: textLines.join('\n'),
        layer,
      });
      continue;
    }

    // Unknown line — skip
    i++;
  }

  return { version, sections, subtitles };
}

/**
 * Parse a @SECTION line
 */
function _parseSection(line) {
  // @SECTION CUSTOM "My Name" 00:10.000 > 00:20.000
  const customMatch = line.match(
    /^@SECTION\s+CUSTOM\s+"([^"]+)"\s+([\d:.]+)\s*>\s*([\d:.]+)$/
  );
  if (customMatch) {
    return {
      type: 'CUSTOM',
      name: customMatch[1],
      startTime: lyricTimeToMs(customMatch[2]),
      endTime: lyricTimeToMs(customMatch[3]),
    };
  }

  // @SECTION TYPE 00:10.000 > 00:20.000
  const typeMatch = line.match(
    /^@SECTION\s+(\w+)\s+([\d:.]+)\s*>\s*([\d:.]+)$/
  );
  if (typeMatch) {
    return {
      type: typeMatch[1],
      name: '', // Will be resolved by SectionManager using type
      startTime: lyricTimeToMs(typeMatch[2]),
      endTime: lyricTimeToMs(typeMatch[3]),
    };
  }

  return null;
}

// ─── Serializer ───

/**
 * Serialize subtitles, sections into .lyric format string
 * @param {Array} subtitles - Subtitle objects from SubtitleManager
 * @param {Array} sections  - Section objects from SectionManager
 * @returns {string} .lyric formatted string
 */
export function serializeLyric(subtitles, sections) {
  const lines = [];

  // Header
  lines.push('#LYRIC v1.0');
  lines.push('');

  // Sort sections by start time
  const sortedSections = [...sections].sort((a, b) => a.startTime - b.startTime);

  // Sort subtitles by start time, then layer (primary first)
  const sortedSubs = [...subtitles].sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime - b.startTime;
    return (a.layer || 0) - (b.layer || 0);
  });

  // Build a timeline: interleave sections and subtitles
  // Collect all events with their start times
  const events = [];

  for (const sec of sortedSections) {
    events.push({ type: 'section', time: sec.startTime, data: sec });
  }

  for (const sub of sortedSubs) {
    events.push({ type: 'subtitle', time: sub.startTime, data: sub });
  }

  // Sort: sections first at same time, then by time
  events.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    if (a.type === 'section' && b.type !== 'section') return -1;
    if (a.type !== 'section' && b.type === 'section') return 1;
    return 0;
  });

  let subIndex = 1;

  for (const event of events) {
    if (event.type === 'section') {
      const sec = event.data;
      const start = msToLyricTime(sec.startTime);
      const end = msToLyricTime(sec.endTime);

      if (sec.type === 'CUSTOM') {
        lines.push(`@SECTION CUSTOM "${sec.name}" ${start} > ${end}`);
      } else {
        lines.push(`@SECTION ${sec.type} ${start} > ${end}`);
      }
      lines.push('');
    } else {
      const sub = event.data;
      const start = msToLyricTime(sub.startTime);
      const end = msToLyricTime(sub.endTime);
      const ovrTag = (sub.layer || 0) === 1 ? ' [OVR]' : '';

      lines.push(`#${subIndex} ${start} > ${end}${ovrTag}`);
      lines.push(sub.text);
      lines.push('');
      subIndex++;
    }
  }

  return lines.join('\n');
}
