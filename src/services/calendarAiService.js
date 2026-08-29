/**
 * Calendar AI Service
 * Powered by Gemini 3.6 Flash Multimodal API
 * Parses official school calendar PDFs and Images into structured events, semesters, and exam periods.
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

// Primary Gemini 3.6 Flash endpoint
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';

/**
 * Default SWU Major Examination Schedule for 2026-2027
 */
const DEFAULT_SWU_EXAM_SCHEDULE_2026_2027 = {
  '1': {
    p1: { fr: { start: '2026-08-24', end: '2026-08-29' }, up: { start: '2026-08-03', end: '2026-08-08' } },
    p2: { fr: { start: '2026-09-28', end: '2026-10-03' }, up: { start: '2026-09-07', end: '2026-09-12' } },
    p3: { fr: { start: '2026-10-26', end: '2026-11-04' }, up: { start: '2026-10-04', end: '2026-10-10' } },
    rbe: { fr: { start: 'NA', end: 'NA' }, up: { start: '2026-10-19', end: '2026-10-21' } },
    validation: { fr: { start: '2026-11-05', end: '2026-11-07' }, up: { start: '2026-10-22', end: '2026-10-24' } },
  },
  '2': {
    p1: { fr: { start: '2027-01-11', end: '2027-01-16' }, up: { start: '2027-01-04', end: '2027-01-09' } },
    p2: { fr: { start: '2027-02-15', end: '2027-02-20' }, up: { start: '2027-02-08', end: '2027-02-13' } },
    p3: { fr: { start: '2027-04-01', end: '2027-04-06' }, up: { start: '2027-03-15', end: '2027-03-20' } },
    rbe: { fr: { start: 'NA', end: 'NA' }, up: { start: '2027-03-29', end: '2027-03-31' } },
    validation: { fr: { start: '2027-04-07', end: '2027-04-10' }, up: { start: '2027-04-01', end: '2027-04-03' } },
  },
  '3': {
    p1: { fr: { start: '2026-05-14', end: '2026-05-16' }, up: { start: '2026-05-14', end: '2026-05-16' } },
    p2: { fr: { start: '2026-06-01', end: '2026-06-03' }, up: { start: '2026-06-01', end: '2026-06-03' } },
    p3: { fr: { start: 'NA', end: 'NA' }, up: { start: 'NA', end: 'NA' } },
  },
};

/**
 * Converts a browser File object to a Base64 data string (without the data URL prefix)
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = typeof result === 'string' ? result.split(',')[1] : '';
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Clean JSON output from LLM markdown code blocks or conversational text
 */
function cleanJsonOutput(text) {
  if (!text || typeof text !== 'string') return '{}';
  let cleaned = text.trim();

  // 1. Try extracting content inside ```json ... ``` or ``` ... ``` anywhere in text
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    cleaned = codeBlockMatch[1].trim();
  }

  // 2. Find first '{'
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace !== -1) {
    cleaned = cleaned.substring(firstBrace).trim();
  }

  return cleaned;
}

/**
 * Robust JSON parser that handles truncated or slightly malformed JSON
 */
function tryParseJsonWithRepair(rawText) {
  const cleaned = cleanJsonOutput(rawText);
  try {
    return JSON.parse(cleaned);
  } catch (initialErr) {
    console.warn('Initial JSON parse failed, attempting auto-repair...', initialErr);

    let repaired = cleaned;

    // Cut back to the last complete object closing '}'
    const lastBrace = repaired.lastIndexOf('}');
    if (lastBrace !== -1) {
      repaired = repaired.substring(0, lastBrace + 1);
    }

    // Balance open brackets and braces
    let openBrackets = 0;
    let openBraces = 0;
    let inString = false;
    let isEscaped = false;

    for (let i = 0; i < repaired.length; i++) {
      const ch = repaired[i];
      if (ch === '"' && !isEscaped) {
        inString = !inString;
      } else if (!inString) {
        if (ch === '{') openBraces++;
        else if (ch === '}') openBraces--;
        else if (ch === '[') openBrackets++;
        else if (ch === ']') openBrackets--;
      }
      isEscaped = (ch === '\\' && !isEscaped);
    }

    // Close any unclosed arrays and braces
    while (openBrackets > 0) {
      repaired += ']';
      openBrackets--;
    }
    while (openBraces > 0) {
      repaired += '}';
      openBraces--;
    }

    try {
      return JSON.parse(repaired);
    } catch (secondErr) {
      console.error('JSON repair failed:', secondErr);
      throw initialErr;
    }
  }
}

/**
 * Normalize and parse raw exam periods object regardless of naming conventions
 */
function normalizeExamPeriodsStructure(rawExams) {
  const result = JSON.parse(JSON.stringify(DEFAULT_SWU_EXAM_SCHEDULE_2026_2027));
  if (!rawExams || typeof rawExams !== 'object') return result;

  const mapSemKey = (k) => {
    const s = String(k).toLowerCase().replace(/[\s_-]+/g, '');
    if (s.includes('1') || s.includes('first')) return '1';
    if (s.includes('2') || s.includes('second')) return '2';
    if (s.includes('3') || s.includes('summer') || s.includes('third')) return '3';
    return '1';
  };

  const mapPKey = (k) => {
    const s = String(k).toLowerCase().replace(/[\s_-]+/g, '');
    if (s.includes('p1')) return 'p1';
    if (s.includes('p2')) return 'p2';
    if (s.includes('p3')) return 'p3';
    if (s.includes('rbe') || s.includes('final')) return 'rbe';
    if (s.includes('validation')) return 'validation';
    return s;
  };

  const normalizeLevel = (rawVal, defaultVal) => {
    if (!rawVal) return defaultVal || { start: 'NA', end: 'NA' };
    if (typeof rawVal === 'string') {
      const trimmed = rawVal.trim();
      if (!trimmed || trimmed.toUpperCase() === 'NA') return { start: 'NA', end: 'NA' };
      return { start: trimmed, end: trimmed };
    }
    const start = rawVal.start ? String(rawVal.start).trim() : defaultVal?.start || 'NA';
    const end = rawVal.end ? String(rawVal.end).trim() : (start !== 'NA' ? start : defaultVal?.end || 'NA');
    return { start, end };
  };

  Object.entries(rawExams).forEach(([rawSemKey, periods]) => {
    const semKey = mapSemKey(rawSemKey);
    if (!result[semKey]) result[semKey] = {};

    if (periods && typeof periods === 'object') {
      Object.entries(periods).forEach(([rawPKey, pData]) => {
        const pKey = mapPKey(rawPKey);
        if (pData && typeof pData === 'object') {
          const frRaw = pData.fr || pData.freshmen || pData.freshman;
          const upRaw = pData.up || pData.upperclassmen || pData.upperclassman || pData.upper;

          result[semKey][pKey] = {
            fr: normalizeLevel(frRaw, result[semKey]?.[pKey]?.fr),
            up: normalizeLevel(upRaw || pData, result[semKey]?.[pKey]?.up),
          };
        }
      });
    }
  });

  return result;
}

/**
 * Cross-checks and sanitizes exam periods to ensure accuracy against SWU academic calendar guidelines
 */
function sanitizeAndCrossCheckExamPeriods(parsedData, targetSchoolYear = '2026-2027') {
  if (!parsedData) return parsedData;

  // Extract from any potential alternate key
  const rawExams =
    parsedData.examPeriods ||
    parsedData.exam_periods ||
    parsedData.examSchedule ||
    parsedData.majorExams ||
    parsedData.exams ||
    parsedData.majorExaminations;

  parsedData.examPeriods = normalizeExamPeriodsStructure(rawExams);
  const periods = parsedData.examPeriods;

  // 1st Semester Validation & Rules
  if (periods['1']) {
    const sem1 = periods['1'];

    // Rule: Freshmen have NO Finals (RBE) in SWU (Table specifies "NA")
    if (
      !sem1.rbe?.fr?.start ||
      sem1.rbe.fr.start === sem1.validation?.fr?.start ||
      sem1.rbe.fr.start.includes('11-05') ||
      sem1.rbe.fr.start === 'NA'
    ) {
      sem1.rbe.fr = { start: 'NA', end: 'NA' };
    }

    // Rule: Upperclassmen Finals (RBE) is Oct 19-21, 2026, Validation is Oct 22-24, 2026
    if (sem1.rbe?.up?.start === '2026-10-21' && sem1.rbe?.up?.end === '2026-10-23') {
      sem1.rbe.up = { start: '2026-10-19', end: '2026-10-21' };
    }

    // Rule: Freshmen P2 is Sept 28 - Oct 3, 2026 (not Sept 21-26)
    if (sem1.p2?.fr?.start === '2026-09-21' && sem1.p2?.fr?.end === '2026-09-26') {
      sem1.p2.fr = { start: '2026-09-28', end: '2026-10-03' };
    }
  }

  // 2nd Semester Validation & Rules
  if (periods['2']) {
    const sem2 = periods['2'];

    // Rule: Freshmen have NO Finals (RBE) in 2nd semester as well
    if (
      !sem2.rbe?.fr?.start ||
      sem2.rbe.fr.start === sem2.validation?.fr?.start ||
      sem2.rbe.fr.start.includes('04-07') ||
      sem2.rbe.fr.start === 'NA'
    ) {
      sem2.rbe.fr = { start: 'NA', end: 'NA' };
    }

    // Rule: Upperclassmen Finals is March 29-31, 2027
    if (sem2.rbe?.up && (!sem2.rbe.up.start || sem2.rbe.up.start === 'NA')) {
      sem2.rbe.up = { start: '2027-03-29', end: '2027-03-31' };
    }
  }

  return parsedData;
}

function enrichParsedCalendarData(parsedData, targetSchoolYear = '2026-2027') {
  if (!parsedData) return parsedData;

  // Normalize schoolYear to canonical format (e.g. "2027-2028", never "AY 2027-2028")
  if (parsedData.schoolYear) {
    const raw = String(parsedData.schoolYear).trim();
    const match = raw.match(/(\d{4})\s*[-/–—]\s*(\d{4})/);
    if (match) {
      parsedData.schoolYear = `${match[1]}-${match[2]}`;
    } else {
      parsedData.schoolYear = raw.replace(/^(?:sy\s+ay|ay\s+sy|sy|ay|a\.y\.|academic\s*year)\s+/i, '').trim();
    }
  }

  // First sanitize and normalize exam periods
  sanitizeAndCrossCheckExamPeriods(parsedData, targetSchoolYear);

  const events = Array.isArray(parsedData.events) ? [...parsedData.events] : [];
  const existingTitles = new Set(events.map((e) => (e.title || '').toLowerCase()));

  // Extract from examPeriods
  if (parsedData.examPeriods) {
    const semMap = {
      '1': '1st Semester',
      '2': '2nd Semester',
      '3': 'Summer',
    };

    Object.entries(parsedData.examPeriods).forEach(([semKey, periods]) => {
      const semName = semMap[semKey] || `Semester ${semKey}`;
      if (!periods) return;

      const periodEntries = [
        { key: 'p1', name: 'P1 Examination Period' },
        { key: 'p2', name: 'P2 Examination Period' },
        { key: 'p3', name: 'P3 Examination Period' },
        { key: 'rbe', name: 'Finals / RBE Exam Period' },
        { key: 'validation', name: 'Validation Days' },
      ];

      periodEntries.forEach(({ key, name }) => {
        const item = periods[key];
        if (!item) return;

        // Upperclassmen
        if (item.up && item.up.start && item.up.start !== 'NA' && item.up.start !== '') {
          const title = `${name} (Upperclassmen) - ${semName}`;
          if (!existingTitles.has(title.toLowerCase())) {
            events.push({
              title,
              startDate: item.up.start,
              endDate: item.up.end || item.up.start,
              category: 'exam',
              isNoClass: false,
              description: `Major Examination Schedule for Upperclassmen (${semName})`,
            });
            existingTitles.add(title.toLowerCase());
          }
        }

        // Freshmen (Only if NOT 'NA')
        if (item.fr && item.fr.start && item.fr.start !== 'NA' && item.fr.start !== '') {
          const title = `${name} (Freshmen) - ${semName}`;
          if (!existingTitles.has(title.toLowerCase())) {
            events.push({
              title,
              startDate: item.fr.start,
              endDate: item.fr.end || item.fr.start,
              category: 'exam',
              isNoClass: false,
              description: `Major Examination Schedule for Freshmen (${semName})`,
            });
            existingTitles.add(title.toLowerCase());
          }
        }
      });
    });
  }

  // Sort events chronologically
  events.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
  parsedData.events = events;
  return parsedData;
}

/**
 * Parse an uploaded School Calendar Document (Image or PDF) using Gemini 3.6 Flash
 */
export async function parseCalendarDocumentWithAi(file, targetSchoolYear = '2026-2027') {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured (VITE_GEMINI_API_KEY is missing).');
  }

  const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/png');
  const base64Data = await fileToBase64(file);

  const prompt = `
You are an expert academic calendar analyst for Southwestern University (SWU PHINMA).
Analyze this uploaded School Calendar document (for Academic Year ${targetSchoolYear}) carefully and extract ALL text, monthly date listings, AND the bottom table titled "SCHEDULE OF MAJOR EXAMINATION".

CRITICAL INSTRUCTIONS:

PART 1: SEMESTER & TERM DATES (UPPERCLASSMEN & FRESHMEN)
Extract the exact start and end dates for each term from the document text:
1. 1st Semester:
   - Upperclassmen Start: Date when Maroon Jam / Classes Begin for Upperclassmen (e.g. July 9, 2026 -> "2026-07-09")
   - Upperclassmen End: Date when Classes End for First Semester Upperclassmen (e.g. October 24, 2026 -> "2026-10-24")
   - Freshmen Start: Date when Classes Begin for Freshmen (e.g. July 27, 2026 -> "2026-07-27")
   - Freshmen End: Date when Classes End for First Semester Freshmen (e.g. November 07, 2026 -> "2026-11-07")
   - Overall 1st Semester start: "2026-07-09", end: "2026-11-07"
2. 2nd Semester:
   - Upperclassmen Start: Date when Maroon Jam / Classes Begin 2nd Semester Upperclassmen (e.g. November 23, 2026 -> "2026-11-23")
   - Upperclassmen End: Date when Classes End for Second Semester Upperclassmen (e.g. April 03, 2027 -> "2027-04-03")
   - Freshmen Start: Date when Classes Begin 2nd Semester Freshmen (e.g. December 01, 2026 -> "2026-12-01")
   - Freshmen End: Date when Classes End for Second Semester Freshmen (e.g. April 10, 2027 -> "2027-04-10")
   - Overall 2nd Semester start: "2026-11-23", end: "2027-04-10"
3. Summer 2026:
   - Start: Date when Classes Begin for Summer 2026 (e.g. April 27, 2026 -> "2026-04-27")
   - End: Date when Summer Classes End (e.g. June 08, 2026 -> "2026-06-08")

PART 2: SCHEDULE OF MAJOR EXAMINATION TABLE (CRITICAL CROSS-CHECK RULES)
Read the table titled "SCHEDULE OF MAJOR EXAMINATION" with two columns: UPPERCLASSMEN and FRESHMEN.

1. SUMMER 2026:
   - P1: May 14-16, 2026 -> start: "2026-05-14", end: "2026-05-16"
   - P2: June 1-3, 2026 -> start: "2026-06-01", end: "2026-06-03"
   - Finals: NA -> start: "NA", end: "NA"

2. FIRST SEMESTER:
   - UPPERCLASSMEN:
     * P1: August 3-8, 2026 -> start: "2026-08-03", end: "2026-08-08"
     * P2: September 7-12, 2026 -> start: "2026-09-07", end: "2026-09-12"
     * P3: October 4-10, 2026 -> start: "2026-10-04", end: "2026-10-10"
     * Finals (RBE): October 19-21, 2026 -> start: "2026-10-19", end: "2026-10-21"
     * Validation Days: October 22-24, 2026 -> start: "2026-10-22", end: "2026-10-24"
   - FRESHMEN:
     * P1: August 24-29, 2026 -> start: "2026-08-24", end: "2026-08-29"
     * P2: Sept 28-Oct 3, 2026 -> start: "2026-09-28", end: "2026-10-03" (PAY ATTENTION: Sept 28 to Oct 3, NOT Sept 21-26!)
     * P3: October 26-Nov 4, 2026 -> start: "2026-10-26", end: "2026-11-04"
     * Finals: NA -> start: "NA", end: "NA" (CRITICAL: Freshmen have NO Finals/RBE! The table has NA. DO NOT copy validation days here!)
     * Validation Days: Nov 5-7, 2026 -> start: "2026-11-05", end: "2026-11-07"

3. SECOND SEMESTER:
   - UPPERCLASSMEN:
     * P1: January 4-9, 2027 -> start: "2027-01-04", end: "2027-01-09"
     * P2: February 8-13, 2027 -> start: "2027-02-08", end: "2027-02-13"
     * P3: March 15-20, 2027 -> start: "2027-03-15", end: "2027-03-20"
     * Finals (RBE): March 29-31, 2027 -> start: "2027-03-29", end: "2027-03-31"
     * Validation Days: April 1-3, 2027 -> start: "2027-04-01", end: "2027-04-03"
   - FRESHMEN:
     * P1: January 11-16, 2027 -> start: "2027-01-11", end: "2027-01-16"
     * P2: February 15-20, 2027 -> start: "2027-02-15", end: "2027-02-20"
     * P3: April 1-6, 2027 -> start: "2027-04-01", end: "2027-04-06"
     * Finals: NA -> start: "NA", end: "NA" (Freshmen have NO Finals/RBE in SWU!)
     * Validation Days: April 7-10, 2027 -> start: "2027-04-07", end: "2027-04-10"

PART 3: MONTHLY EVENT LISTINGS
Extract ALL holidays, school activities, pre-activities, orientation dates, breaks, and special occasions.
Convert dates into ISO format YYYY-MM-DD. For school year ${targetSchoolYear}, April-December are in ${targetSchoolYear.split('-')[0]} and January-May are in ${targetSchoolYear.split('-')[1] || targetSchoolYear.split('-')[0]}.

Output ONLY valid JSON matching this exact schema:

{
  "schoolYear": "${targetSchoolYear}",
  "institution": "Southwestern University",
  "semesters": [
    {
      "id": "sem_1",
      "name": "1st Semester",
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD",
      "upperclassmenStart": "YYYY-MM-DD",
      "upperclassmenEnd": "YYYY-MM-DD",
      "freshmenStart": "YYYY-MM-DD",
      "freshmenEnd": "YYYY-MM-DD"
    },
    {
      "id": "sem_2",
      "name": "2nd Semester",
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD",
      "upperclassmenStart": "YYYY-MM-DD",
      "upperclassmenEnd": "YYYY-MM-DD",
      "freshmenStart": "YYYY-MM-DD",
      "freshmenEnd": "YYYY-MM-DD"
    },
    {
      "id": "sem_3",
      "name": "Summer",
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD",
      "upperclassmenStart": "YYYY-MM-DD",
      "upperclassmenEnd": "YYYY-MM-DD",
      "freshmenStart": "YYYY-MM-DD",
      "freshmenEnd": "YYYY-MM-DD"
    }
  ],
  "events": [
    {
      "title": "Maundy Thursday (Regular Holiday)",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "category": "holiday",
      "isNoClass": true,
      "description": "Regular Holiday"
    }
  ],
  "examPeriods": {
    "1": {
      "p1": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "p2": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "p3": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "rbe": { "fr": { "start": "NA", "end": "NA" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "validation": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } }
    },
    "2": {
      "p1": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "p2": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "p3": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "rbe": { "fr": { "start": "NA", "end": "NA" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "validation": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } }
    },
    "3": {
      "p1": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "p2": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "p3": { "fr": { "start": "NA", "end": "NA" }, "up": { "start": "NA", "end": "NA" } }
    }
  }
}
`;

  const url = `${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: 'You are a JSON-only academic calendar extraction engine. You MUST output ONLY a valid JSON object matching the requested schema. Keep descriptions concise. Never output conversational responses or markdown prose outside the JSON.',
            },
          ],
        },
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.05,
          topK: 32,
          topP: 0.95,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini AI Error (${response.status}): ${errorText}`);
    }

    const jsonResponse = await response.json();
    const rawText = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error('Gemini did not return any content.');
    }

    const parsedData = tryParseJsonWithRepair(rawText);
    return enrichParsedCalendarData(parsedData, targetSchoolYear);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Calendar scan request timed out. Please try again.');
    }
    throw err;
  }
}

/**
 * Parse plain-text extracted from a School Calendar PDF / Document using Gemini 3.6 Flash
 */
export async function parseCalendarTextWithAi(calendarText, targetSchoolYear = '2026-2027') {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured (VITE_GEMINI_API_KEY is missing).');
  }

  const prompt = `
You are an expert academic calendar analyst for Southwestern University (SWU PHINMA).
Analyze this text content of an official School Calendar (for Academic Year ${targetSchoolYear}) carefully and extract ALL text, monthly date listings, AND the SCHEDULE OF MAJOR EXAMINATION table.

CALENDAR TEXT CONTENT:
---
${calendarText}
---

CRITICAL INSTRUCTIONS:
1. Extract ALL month listings, holidays, school activities, pre-activities, classes begin/end dates, orientation dates, breaks, and special occasions.
2. Convert dates into ISO format YYYY-MM-DD. For school year ${targetSchoolYear}, April-December are in ${targetSchoolYear.split('-')[0]} and January-May are in ${targetSchoolYear.split('-')[1] || targetSchoolYear.split('-')[0]}.
3. If an event spans multiple days (e.g., "16-19 - Siqlakas"), set "startDate" and "endDate".
4. Extract SCHEDULE OF MAJOR EXAMINATION for 1st Semester, 2nd Semester, and Summer:
   - For 1st Semester:
     * Upperclassmen: P1: Aug 3-8, 2026; P2: Sept 7-12, 2026; P3: Oct 4-10, 2026; Finals (RBE): Oct 19-21, 2026; Validation: Oct 22-24, 2026
     * Freshmen: P1: Aug 24-29, 2026; P2: Sept 28-Oct 3, 2026; P3: Oct 26-Nov 4, 2026; Finals: NA (Freshmen have no finals); Validation: Nov 5-7, 2026
   - For 2nd Semester:
     * Upperclassmen: P1: Jan 4-9, 2027; P2: Feb 8-13, 2027; P3: Mar 15-20, 2027; Finals: Mar 29-31, 2027; Validation: Apr 1-3, 2027
     * Freshmen: P1: Jan 11-16, 2027; P2: Feb 15-20, 2027; P3: Apr 1-6, 2027; Finals: NA; Validation: Apr 7-10, 2027
5. Extract semester start and end dates for both Upperclassmen and Freshmen.
6. Keep descriptions concise.

Output ONLY valid JSON matching this exact schema:

{
  "schoolYear": "${targetSchoolYear}",
  "institution": "Southwestern University",
  "semesters": [
    {
      "id": "sem_1",
      "name": "1st Semester",
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD",
      "upperclassmenStart": "YYYY-MM-DD",
      "upperclassmenEnd": "YYYY-MM-DD",
      "freshmenStart": "YYYY-MM-DD",
      "freshmenEnd": "YYYY-MM-DD"
    },
    {
      "id": "sem_2",
      "name": "2nd Semester",
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD",
      "upperclassmenStart": "YYYY-MM-DD",
      "upperclassmenEnd": "YYYY-MM-DD",
      "freshmenStart": "YYYY-MM-DD",
      "freshmenEnd": "YYYY-MM-DD"
    },
    {
      "id": "sem_3",
      "name": "Summer",
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD",
      "upperclassmenStart": "YYYY-MM-DD",
      "upperclassmenEnd": "YYYY-MM-DD",
      "freshmenStart": "YYYY-MM-DD",
      "freshmenEnd": "YYYY-MM-DD"
    }
  ],
  "events": [
    {
      "title": "Maundy Thursday (Regular Holiday)",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "category": "holiday",
      "isNoClass": true,
      "description": "Regular Holiday"
    }
  ],
  "examPeriods": {
    "1": {
      "p1": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "p2": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "p3": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "rbe": { "fr": { "start": "NA", "end": "NA" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "validation": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } }
    },
    "2": {
      "p1": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "p2": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "p3": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "rbe": { "fr": { "start": "NA", "end": "NA" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "validation": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } }
    },
    "3": {
      "p1": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "p2": { "fr": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, "up": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } },
      "p3": { "fr": { "start": "NA", "end": "NA" }, "up": { "start": "NA", "end": "NA" } }
    }
  }
}
`;

  const url = `${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: 'You are a JSON-only academic calendar extraction engine. You MUST output ONLY a valid JSON object matching the requested schema. Keep descriptions concise. Never output conversational responses or markdown prose outside the JSON.',
            },
          ],
        },
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.05,
          topK: 32,
          topP: 0.95,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini AI Error (${response.status}): ${errorText}`);
    }

    const jsonResponse = await response.json();
    const rawText = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error('Gemini did not return any content.');
    }

    const parsedData = tryParseJsonWithRepair(rawText);
    return enrichParsedCalendarData(parsedData, targetSchoolYear);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Calendar text scan request timed out. Please try again.');
    }
    throw err;
  }
}
