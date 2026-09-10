import { MaimaiNote, MaimaiTrack } from '../types';

export interface ParsedMaidataChart {
  difficulty: 'EASY' | 'BASIC' | 'ADVANCED' | 'EXPERT' | 'MASTER' | 'Re:MASTER' | 'CUSTOM';
  level: string;
  rawCode: string;
  noteCount: number;
  parsedNotes: MaimaiNote[];
}

export interface ParsedMaidata {
  title: string;
  artist: string;
  bpm: number;
  offset: number;
  charts: ParsedMaidataChart[];
}

/**
 * Normalizes full-width (Zenkaku) Japanese characters into standard ASCII (Hankaku).
 * Crucial for community maidata charts created using Japanese IMEs.
 */
export function normalizeSimaiText(raw: string): string {
  return raw
    // Zenkaku numbers -> Hankaku 0-9
    .replace(/[\uFF10-\uFF19]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    // Zenkaku uppercase -> A-Z
    .replace(/[\uFF21-\uFF3A]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    // Zenkaku lowercase -> a-z
    .replace(/[\uFF41-\uFF5A]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    // Japanese ideographic space
    .replace(/\u3000/g, ' ')
    // Full-width symbols
    .replace(/\uFF08/g, '(')
    .replace(/\uFF09/g, ')')
    .replace(/\uFF5B/g, '{')
    .replace(/\uFF5D/g, '}')
    .replace(/\uFF3B/g, '[')
    .replace(/\uFF3D/g, ']')
    .replace(/\uFF0C/g, ',')
    .replace(/\u3001/g, ',')
    .replace(/\uFF0F/g, '/')
    .replace(/\uFF06/g, '&')
    .replace(/\uFF1D/g, '=')
    .replace(/\uFF03/g, '#')
    .replace(/\uFF1A/g, ':')
    .replace(/\uFF0A/g, '*')
    .replace(/\uFF1C/g, '<')
    .replace(/\uFF1E/g, '>')
    .replace(/\uFF3E/g, '^')
    .replace(/\uFF0D/g, '-')
    .replace(/\uFF3F/g, '_');
}

/**
 * Reads a File as text, detecting UTF-16 LE/BE, UTF-8 (with or without BOM), Shift-JIS, or GBK.
 * Handles Windows Notepad files and Japanese/Chinese AstroDX charts without corruption.
 */
export async function readFileAsSimaiText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // 1. Check UTF-16LE BOM: 0xFF 0xFE
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer);
  }

  // 2. Check UTF-16BE BOM: 0xFE 0xFF
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer);
  }

  // 3. Check UTF-8 BOM: 0xEF 0xBB 0xBF
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer);
  }

  // 4. Check if UTF-16LE without BOM (common for Windows Notepad text files)
  let zeroCount = 0;
  const sampleLen = Math.min(120, bytes.length);
  for (let i = 1; i < sampleLen; i += 2) {
    if (bytes[i] === 0) zeroCount++;
  }
  if (zeroCount > sampleLen / 4) {
    try {
      const u16Text = new TextDecoder('utf-16le').decode(buffer);
      const lower = u16Text.toLowerCase();
      if (lower.includes('&title') || lower.includes('&inote') || lower.includes('&bpm') || lower.includes(',')) {
        return u16Text;
      }
    } catch {
      // ignore
    }
  }

  // 5. Try UTF-8
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
    const utf8Text = utf8Decoder.decode(buffer);
    const lower = utf8Text.toLowerCase();
    if (lower.includes('&title') || lower.includes('&inote') || lower.includes('&bpm') || lower.includes('&artist') || utf8Text.includes(',')) {
      return utf8Text;
    }
  } catch {
    // ignore
  }

  // 6. Try Shift-JIS for Japanese community charts
  try {
    const sjisDecoder = new TextDecoder('shift-jis');
    const sjisText = sjisDecoder.decode(buffer);
    const sjisLower = sjisText.toLowerCase();
    if (sjisLower.includes('&title') || sjisLower.includes('&inote') || sjisLower.includes('&bpm')) {
      return sjisText;
    }
  } catch {
    // ignore
  }

  // 7. Try GBK for Chinese charts
  try {
    const gbkDecoder = new TextDecoder('gbk');
    const gbkText = gbkDecoder.decode(buffer);
    if (gbkText.toLowerCase().includes('&title') || gbkText.toLowerCase().includes('&inote')) {
      return gbkText;
    }
  } catch {
    // ignore
  }

  // Fallback to UTF-8
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}

/**
 * Robust line-by-line tag parser modeled directly on AstroDX and SimaiSharp.
 * Accurately extracts multiline chart sections and metadata tags regardless of formatting.
 */
export function extractMaidataTags(text: string): Map<string, string> {
  const normalized = normalizeSimaiText(text).replace(/^\uFEFF/, '');
  const lines = normalized.split(/\r?\n/);
  const tagMap = new Map<string, string>();
  let currentKey = '';
  let currentValueLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Comment line check (only when not inside inote)
    if (!currentKey.startsWith('inote') && (trimmed.startsWith('||') || trimmed.startsWith('//'))) {
      continue;
    }

    if (trimmed.startsWith('&')) {
      // Save previous tag if any
      if (currentKey) {
        tagMap.set(currentKey, currentValueLines.join('\n').trim());
        currentValueLines = [];
      }

      // Parse &key=value or &key value
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        currentKey = trimmed.substring(1, eqIdx).trim().toLowerCase();
        const firstVal = trimmed.substring(eqIdx + 1);
        if (firstVal.trim().length > 0) {
          currentValueLines.push(firstVal);
        }
      } else {
        const spaceIdx = trimmed.search(/\s/);
        if (spaceIdx !== -1) {
          currentKey = trimmed.substring(1, spaceIdx).trim().toLowerCase();
          const firstVal = trimmed.substring(spaceIdx + 1);
          if (firstVal.trim().length > 0) currentValueLines.push(firstVal);
        } else {
          currentKey = trimmed.substring(1).trim().toLowerCase();
        }
      }
    } else {
      if (currentKey) {
        currentValueLines.push(rawLine);
      }
    }
  }

  // Save the final tag
  if (currentKey) {
    tagMap.set(currentKey, currentValueLines.join('\n').trim());
  }

  return tagMap;
}

/**
 * Parses maidata.txt headers and extracts all difficulties with note collections.
 */
export function parseMaidataHeader(text: string): ParsedMaidata {
  const normalized = normalizeSimaiText(text).replace(/^\uFEFF/, '').trim();
  const tagMap = extractMaidataTags(normalized);

  // Song metadata
  const title = tagMap.get('title') || tagMap.get('track') || tagMap.get('name') || 'Custom Maimai Track';
  const artist = tagMap.get('artist') || tagMap.get('composer') || tagMap.get('author') || 'Simai Custom';

  // BPM extraction
  let bpm = 150;
  const bpmRaw = tagMap.get('bpm') || tagMap.get('wholebpm') || tagMap.get('bpm_1') || tagMap.get('bpm_5');
  if (bpmRaw) {
    const parsedBpm = parseFloat(bpmRaw);
    if (!isNaN(parsedBpm) && parsedBpm > 0) bpm = parsedBpm;
  }

  // First offset (&first, &first_1, &offset)
  let offset = 0;
  const firstRaw = tagMap.get('first') || tagMap.get('first_1') || tagMap.get('offset') || tagMap.get('first_5');
  if (firstRaw) {
    const parsedOffset = parseFloat(firstRaw);
    if (!isNaN(parsedOffset)) offset = parsedOffset;
  }

  // Difficulty slots in Maimai / AstroDX:
  // 1 = EASY
  // 2 = BASIC
  // 3 = ADVANCED
  // 4 = EXPERT
  // 5 = MASTER
  // 6 = Re:MASTER
  // 7 = UTAGE / CUSTOM
  const diffConfigs: {
    keys: string[];
    difficulty: ParsedMaidataChart['difficulty'];
    defaultLv: string;
    lvKeys: string[];
  }[] = [
    {
      keys: ['inote_1', 'inote1', 'inote_easy', 'inote_lv1', 'inote_lv_1'],
      difficulty: 'EASY',
      defaultLv: '3',
      lvKeys: ['lv_1', 'lv1', 'level_1', 'level1']
    },
    {
      keys: ['inote_2', 'inote2', 'inote_basic', 'inote_lv2', 'inote_lv_2'],
      difficulty: 'BASIC',
      defaultLv: '6',
      lvKeys: ['lv_2', 'lv2', 'level_2', 'level2']
    },
    {
      keys: ['inote_3', 'inote3', 'inote_advanced', 'inote_lv3', 'inote_lv_3'],
      difficulty: 'ADVANCED',
      defaultLv: '9',
      lvKeys: ['lv_3', 'lv3', 'level_3', 'level3']
    },
    {
      keys: ['inote_4', 'inote4', 'inote_expert', 'inote_lv4', 'inote_lv_4'],
      difficulty: 'EXPERT',
      defaultLv: '11+',
      lvKeys: ['lv_4', 'lv4', 'level_4', 'level4']
    },
    {
      keys: ['inote_5', 'inote5', 'inote_master', 'inote_lv5', 'inote_lv_5'],
      difficulty: 'MASTER',
      defaultLv: '13',
      lvKeys: ['lv_5', 'lv5', 'level_5', 'level5']
    },
    {
      keys: ['inote_6', 'inote6', 'inote_remaster', 'inote_re:master', 'inote_lv6', 'inote_lv_6'],
      difficulty: 'Re:MASTER',
      defaultLv: '14',
      lvKeys: ['lv_6', 'lv6', 'level_6', 'level6']
    },
    {
      keys: ['inote_7', 'inote7', 'inote_utage', 'inote_custom', 'inote_lv7', 'inote_lv_7'],
      difficulty: 'CUSTOM',
      defaultLv: '14+',
      lvKeys: ['lv_7', 'lv7', 'level_7', 'level7']
    }
  ];

  const charts: ParsedMaidataChart[] = [];

  for (const cfg of diffConfigs) {
    let rawCode: string | undefined;
    for (const k of cfg.keys) {
      const val = tagMap.get(k);
      if (val && val.trim().length > 0) {
        rawCode = val;
        break;
      }
    }

    if (rawCode) {
      let level = cfg.defaultLv;
      for (const lk of cfg.lvKeys) {
        const lvVal = tagMap.get(lk);
        if (lvVal && lvVal.trim().length > 0) {
          level = lvVal.trim();
          break;
        }
      }

      const notes = parseSimaiToNotes(rawCode, bpm, offset);
      if (notes.length > 0) {
        charts.push({
          difficulty: cfg.difficulty,
          level,
          rawCode,
          noteCount: notes.length,
          parsedNotes: notes
        });
      }
    }
  }

  // Single &inote tag fallback (e.g. &inote=...)
  if (charts.length === 0 && tagMap.has('inote')) {
    const rawCode = tagMap.get('inote')!;
    if (rawCode.trim().length > 0) {
      const level = tagMap.get('lv') || tagMap.get('level') || '13';
      const notes = parseSimaiToNotes(rawCode, bpm, offset);
      if (notes.length > 0) {
        charts.push({
          difficulty: 'MASTER',
          level,
          rawCode,
          noteCount: notes.length,
          parsedNotes: notes
        });
      }
    }
  }

  // Raw Simai Code fallback (if no tags found, parse entire file as chart)
  if (charts.length === 0) {
    const notes = parseSimaiToNotes(normalized, bpm, offset);
    if (notes.length > 0) {
      charts.push({
        difficulty: 'MASTER',
        level: '12+',
        rawCode: normalized,
        noteCount: notes.length,
        parsedNotes: notes
      });
    }
  }

  return { title, artist, bpm, offset, charts };
}

/**
 * Parses raw Simai chart code into array of timestamped MaimaiNote.
 * Full support for AstroDX notation:
 * - Slides (straight, curve, arch, wifi, spin, chained, with tempo overrides)
 * - Holds (duration fractions, seconds, breaks, ex)
 * - Taps, Breaks, EX notes, and touch sensors (A-E)
 * - Simultaneous each-notes (/, `, or adjacent digits)
 * - Dynamic tempo (BPM) and division changes {DIV}
 */
export function parseSimaiToNotes(simaiCode: string, initialBpm: number = 140, firstOffset: number = 0): MaimaiNote[] {
  const notes: MaimaiNote[] = [];
  let currentBpm = initialBpm > 0 ? initialBpm : 140;
  let currentDivisor = 4; // default quarter notes
  let currentTime = Math.max(0, firstOffset);
  let noteCounter = 0;

  // 1. Normalize Zenkaku & remove comments
  let cleanCode = normalizeSimaiText(simaiCode)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\|\|.*$/gm, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  // Remove standalone 'E' (End of chart marker)
  cleanCode = cleanCode.replace(/(?:^|,|\s)E\s*$/, '').trim();

  // Split by commas (standard Simai time step delimiter)
  const chunks = cleanCode.split(',');

  for (const chunk of chunks) {
    let remaining = chunk.trim();
    if (remaining === '' || remaining === 'E') {
      const secondsPerBeat = 60 / currentBpm;
      currentTime += (secondsPerBeat * 4) / currentDivisor;
      continue;
    }

    // 1. BPM changes: e.g. (180) or (180.5)
    const bpmMatches = remaining.matchAll(/\(([0-9.]+)\)/g);
    for (const bm of bpmMatches) {
      const newBpm = parseFloat(bm[1]);
      if (!isNaN(newBpm) && newBpm > 0) {
        currentBpm = newBpm;
      }
    }
    remaining = remaining.replace(/\([0-9.]+\)/g, '');

    // 2. Divisor changes: e.g. {4}, {8}, {16}, {24}, {32}, {48}, {64}
    const divMatches = remaining.matchAll(/\{([0-9.]+)\}/g);
    for (const dm of divMatches) {
      const newDiv = parseFloat(dm[1]);
      if (!isNaN(newDiv) && newDiv > 0) {
        currentDivisor = newDiv;
      }
    }
    remaining = remaining.replace(/\{[0-9.]+\}/g, '').trim();

    if (!remaining) {
      const secondsPerBeat = 60 / currentBpm;
      currentTime += (secondsPerBeat * 4) / currentDivisor;
      continue;
    }

    // 3. Normalize each-note backtick (e.g. 1`5 -> 1/5)
    remaining = remaining.replace(/`/g, '/');

    // 4. Normalize Touch Notes (A1..A8, B1..B8, D1..D8, E1..E8 -> 1..8; C, C1..C2 -> 1)
    remaining = remaining.replace(/([ABDE])([1-8])/gi, '$2');
    remaining = remaining.replace(/C[1-8]?/gi, '1');

    // 5. Split simultaneous notes by '/'
    const subCommands = remaining.split('/').map(s => s.trim()).filter(Boolean);

    for (const sub of subCommands) {
      // Split chained slides / multi-slides by '*'
      const starParts = sub.split('*').map(s => s.trim()).filter(Boolean);

      for (let part of starParts) {
        // A. Slide extraction
        // Format: [1-8]([bx$]+)?(shape)[1-8]([bx$]+)?(chained segments)*(brackets)?(modifiers)?
        const slidePattern = /([1-8])([bx$]+)?([-^v<>pqszw]|pp|qq|V[0-9]?)([1-8])([bx$]+)?(?:(?:[-^v<>pqszw]|pp|qq|V[0-9]?)[1-8](?:[bx$]+)?)*(?:\[([^\]]+)\])?([bx$]+)?/g;
        let sMatch: RegExpExecArray | null;
        let slideFound = false;

        while ((sMatch = slidePattern.exec(part)) !== null) {
          slideFound = true;
          const fullMatch = sMatch[0];
          const startBtn = parseInt(sMatch[1], 10);

          // Find the last button digit in the slide path as the destination
          const buttonDigits = fullMatch.match(/[1-8]/g) || [];
          const endBtn = buttonDigits.length > 1 ? parseInt(buttonDigits[buttonDigits.length - 1], 10) : parseInt(sMatch[4], 10);

          const isBreak = fullMatch.includes('b');

          notes.push({
            id: `note_${++noteCounter}`,
            time: currentTime,
            button: startBtn,
            type: 'slide',
            endButton: endBtn,
            isBreak
          });
        }

        if (slideFound) {
          part = part.replace(slidePattern, ' ');
        }

        // B. Hold extraction
        // Format: [1-8](?:h(?:\[([^\]]+)\])?|\[([^\]]+)\])([bx$]+)?
        const holdPattern = /([1-8])(?:h(?:\[([^\]]+)\])?|\[([^\]]+)\])([bx$]+)?/g;
        let hMatch: RegExpExecArray | null;
        let holdFound = false;

        while ((hMatch = holdPattern.exec(part)) !== null) {
          holdFound = true;
          const btn = parseInt(hMatch[1], 10);
          const durationStr = hMatch[2] || hMatch[3];
          const isBreak = !!(hMatch[4] && hMatch[4].includes('b')) || (hMatch[0] && hMatch[0].includes('b'));
          let holdDuration = (60 / currentBpm) * (4 / currentDivisor);

          if (durationStr) {
            if (durationStr.includes(':')) {
              const colonParts = durationStr.split('#').pop()!.split(':');
              const div = parseFloat(colonParts[0]);
              const cnt = parseFloat(colonParts[1]);
              if (!isNaN(div) && div > 0 && !isNaN(cnt)) {
                holdDuration = (60 / currentBpm) * (4 / div) * cnt;
              }
            } else {
              const sec = parseFloat(durationStr.replace('#', ''));
              if (!isNaN(sec) && sec > 0) holdDuration = sec;
            }
          }

          notes.push({
            id: `note_${++noteCounter}`,
            time: currentTime,
            button: btn,
            type: 'hold',
            duration: holdDuration,
            isBreak
          });
        }

        if (holdFound) {
          part = part.replace(holdPattern, ' ');
        }

        // C. Tap / Break / EX / Touch extraction
        // Format: [1-8]([bxfm!@$?]*)|(?:[1-8])
        const tapPattern = /([1-8])([bxfm!@$?]*)/g;
        let tMatch: RegExpExecArray | null;

        while ((tMatch = tapPattern.exec(part)) !== null) {
          const btn = parseInt(tMatch[1], 10);
          const isBreak = tMatch[2] ? tMatch[2].includes('b') : false;
          notes.push({
            id: `note_${++noteCounter}`,
            time: currentTime,
            button: btn,
            type: isBreak ? 'break' : 'tap',
            isBreak
          });
        }
      }
    }

    // Advance time by the current division step
    const secondsPerBeat = 60 / currentBpm;
    const stepDuration = (secondsPerBeat * 4) / currentDivisor;
    currentTime += stepDuration;
  }

  // Filter out any invalid times and sort
  return notes.filter(n => !isNaN(n.time) && n.time !== Infinity).sort((a, b) => a.time - b.time);
}

// Built-in Cyberpunk & Maimai Arcade Presets
export const BUILTIN_TRACKS: MaimaiTrack[] = [
  {
    id: 'cyber_runner',
    title: 'CYBER RUNNER 2099',
    artist: 'NEON WAVE SOUND TEAM',
    bpm: 155,
    difficulty: 'EXPERT',
    level: '11',
    jacketColor: 'from-cyan-500 via-blue-600 to-indigo-900',
    totalNotes: 0,
    simaiCode: `(155){4}
    1,2,3,4,
    {8}
    5,6,7,8, 1,3,5,7,
    {4}
    1-5[4:1],, 2-6[4:1],,
    {8}
    3b,4b,5b,6b, 12,, 34,,
    56,, 78,, {16} 1,2,3,4,5,6,7,8,
    {4}
    1h[4:1], 3h[4:1], 5h[4:1], 7h[4:1],
    {8}
    1b,5b, 2b,6b, 3b,7b, 4b,8b,
    {4}
    1-5[4:1], 2-6[4:1], 3-7[4:1], 4-8[4:1],
    {8}
    13,, 24,, 57,, 68,,
    1b/5b,, 2b/6b,, 3b/7b,, 4b/8b,,
    {16}
    1,2,3,4, 5,6,7,8, 8,7,6,5, 4,3,2,1,
    {4}
    1h[4:2]b, 5h[4:2]b, E`,
    notes: []
  },
  {
    id: 'garakuta_cyber',
    title: 'GARAKUTA CYBER PLAY',
    artist: 't+pazolite style synth',
    bpm: 210,
    difficulty: 'MASTER',
    level: '13+',
    jacketColor: 'from-fuchsia-600 via-purple-700 to-black',
    totalNotes: 0,
    simaiCode: `(210){4}
    1b, 2b, 3b, 4b,
    {8}
    1,5, 2,6, 3,7, 4,8,
    {16}
    1,2,3,4, 5,6,7,8, 1,3,5,7, 2,4,6,8,
    {4}
    1-5[8:2]b, 2-6[8:2]b, 3-7[8:2]b, 4-8[8:2]b,
    {8}
    1h[4:1], 8h[4:1], 2h[4:1], 7h[4:1],
    {16}
    1,2, 3,4, 5,6, 7,8,
    1b,2b, 3b,4b, 5b,6b, 7b,8b,
    {8}
    14,, 58,, 23,, 67,,
    {4}
    1-5[4:1], 8-4[4:1], 2-6[4:1], 7-3[4:1],
    {16}
    1,2,3,4,5,6,7,8, 8,7,6,5,4,3,2,1,
    {4}
    1b/8b,, 2b/7b,, 3b/6b,, 4b/5b, E`,
    notes: []
  },
  {
    id: 'sakura_beat',
    title: 'NEO SAKURA DANCE',
    artist: 'Tokyo Cyber Orchestra',
    bpm: 132,
    difficulty: 'BASIC',
    level: '6',
    jacketColor: 'from-pink-500 via-rose-600 to-slate-900',
    totalNotes: 0,
    simaiCode: `(132){4}
    1, , 2, ,
    3, , 4, ,
    5, 6, 7, 8,
    {8}
    1,2, 3,4, 5,6, 7,8,
    {4}
    1h[4:2], , 5h[4:2], ,
    1-5[4:1], , 8-4[4:1], ,
    {8}
    1b, , 3b, , 5b, , 7b, ,
    12, , 34, , 56, , 78, ,
    {4}
    1b,, 5b,, E`,
    notes: []
  }
];

// Initialize notes for builtin tracks
BUILTIN_TRACKS.forEach(track => {
  if (track.simaiCode) {
    track.notes = parseSimaiToNotes(track.simaiCode, track.bpm);
    track.totalNotes = track.notes.length;
  }
});
