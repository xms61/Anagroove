import { getGeminiApiKey, isGeminiJudgeConfigured } from '../config.js';
import { logger } from '../logger.js';



/**
 * Normalizes and validates the Negotiated Replacement Query Contract.
 * Guarantees that replacement queries emitted by LLM have valid, safe types.
 */
export function normalizeReplacementQuery(rawQuery = {}) {
  if (!rawQuery || typeof rawQuery !== 'object') {
    return null;
  }

  const normalized = {};

  if (typeof rawQuery.artist === 'string' && rawQuery.artist.trim()) {
    normalized.artist = rawQuery.artist.trim();
  }
  if (typeof rawQuery.trackTitle === 'string' && rawQuery.trackTitle.trim()) {
    normalized.trackTitle = rawQuery.trackTitle.trim();
  }
  if (typeof rawQuery.genre === 'string' && rawQuery.genre.trim()) {
    normalized.genre = rawQuery.genre.trim();
  }

  // searchTerms: Array of 1-3 strings
  const terms = [];
  if (Array.isArray(rawQuery.searchTerms)) {
    for (const t of rawQuery.searchTerms) {
      if (typeof t === 'string' && t.trim()) {
        terms.push(t.trim());
      }
    }
  } else if (typeof rawQuery.searchTerms === 'string' && rawQuery.searchTerms.trim()) {
    terms.push(rawQuery.searchTerms.trim());
  }

  // If no search terms provided, synthesize from artist/trackTitle/genre
  if (terms.length === 0) {
    if (normalized.artist && normalized.trackTitle) {
      terms.push(`${normalized.artist} ${normalized.trackTitle}`);
    } else if (normalized.artist) {
      terms.push(normalized.artist);
    } else if (normalized.genre) {
      terms.push(normalized.genre);
    }
  }

  normalized.searchTerms = terms.slice(0, 3);
  if (normalized.searchTerms.length === 0) {
    return null;
  }

  // yearRange
  if (rawQuery.yearRange && typeof rawQuery.yearRange === 'object') {
    const yr = {};
    const start = parseInt(rawQuery.yearRange.start, 10);
    const end = parseInt(rawQuery.yearRange.end, 10);
    if (!isNaN(start) && start >= 1950 && start <= 2030) yr.start = start;
    if (!isNaN(end) && end >= 1950 && end <= 2030) yr.end = end;
    if (yr.start !== undefined || yr.end !== undefined) {
      normalized.yearRange = yr;
    }
  }

  // targetStorefront
  const validStorefronts = new Set(['us', 'jp', 'kr', 'fr', 'de', 'br', 'gb']);
  if (typeof rawQuery.targetStorefront === 'string' && validStorefronts.has(rawQuery.targetStorefront.toLowerCase().trim())) {
    normalized.targetStorefront = rawQuery.targetStorefront.toLowerCase().trim();
  }

  // popularity
  const validPopularity = new Set(['pure', 'obscure', 'balanced', 'mainstream']);
  if (typeof rawQuery.popularity === 'string' && validPopularity.has(rawQuery.popularity.toLowerCase().trim())) {
    normalized.popularity = rawQuery.popularity.toLowerCase().trim();
  }

  return normalized;
}

/**
 * Validates and normalizes the full Negotiated Judgment Contract from LLM output.
 */
export function validateLLMJudgeResponse(rawJson, candidateCount = 0) {
  if (!rawJson || typeof rawJson !== 'object') {
    return {
      isSatisfied: true,
      verdictSummary: 'Invalid LLM response format; defaulting to approval.',
      rejectedTrackIndices: [],
      rejectionReasons: {},
      replacementQueries: [],
    };
  }

  const isSatisfied = Boolean(rawJson.isSatisfied);
  const verdictSummary = typeof rawJson.verdictSummary === 'string' ? rawJson.verdictSummary : '';

  // Parse & bounds-check rejected indices
  const rejectedSet = new Set();
  if (Array.isArray(rawJson.rejectedTrackIndices)) {
    for (const idx of rawJson.rejectedTrackIndices) {
      const num = Number(idx);
      if (Number.isInteger(num) && num >= 0 && num < candidateCount) {
        rejectedSet.add(num);
      }
    }
  }

  const rejectedTrackIndices = Array.from(rejectedSet).sort((a, b) => a - b);
  const rejectionReasons = {};
  if (rawJson.rejectionReasons && typeof rawJson.rejectionReasons === 'object') {
    for (const idx of rejectedTrackIndices) {
      if (typeof rawJson.rejectionReasons[String(idx)] === 'string') {
        rejectionReasons[String(idx)] = rawJson.rejectionReasons[String(idx)];
      } else if (typeof rawJson.rejectionReasons[idx] === 'string') {
        rejectionReasons[String(idx)] = rawJson.rejectionReasons[idx];
      }
    }
  }

  // Validate replacement queries against negotiated contract
  const replacementQueries = [];
  if (Array.isArray(rawJson.replacementQueries)) {
    for (const q of rawJson.replacementQueries) {
      const normalized = normalizeReplacementQuery(q);
      if (normalized) {
        replacementQueries.push(normalized);
      }
    }
  }

  // If there are rejected tracks but LLM erroneously reported isSatisfied = true, correct it
  const finalSatisfied = isSatisfied && rejectedTrackIndices.length === 0;

  return {
    isSatisfied: finalSatisfied,
    verdictSummary,
    rejectedTrackIndices,
    rejectionReasons,
    replacementQueries,
  };
}

/**
 * Builds the comprehensive prompt incorporating mode (theme + popularity or custom prompt + popularity).
 */
export function buildJudgePrompt(inputContract) {
  const {
    mode = 'theme',
    theme = { id: 'all', title: 'Mixed All-Time Hits' },
    customPrompt = '',
    popularity = 'balanced',
    targetWordCount = 10,
    candidateTracks = [],
  } = inputContract;

  const tracksSnippet = candidateTracks.map((t, i) => ({
    index: i,
    title: t.title,
    artist: t.artist,
    releaseDate: t.releaseDate || t.release_date || 'Unknown',
    genre: t.genre || t.selection?.genre || 'Unknown',
    answer: t.answer,
    clueType: t.clueType,
  }));

  const inputContextSummary = mode === 'custom_prompt'
    ? `MODE: Custom Free-Text Prompt\nCUSTOM PROMPT: "${customPrompt}"\nPOPULARITY PROFILE: ${popularity}`
    : `MODE: Preset Theme\nTHEME: "${theme.title}" (ID: ${theme.id})\nPOPULARITY PROFILE: ${popularity}`;

  return `You are the expert Music Crossword Judge for SpotySpice.
Your role is to critically evaluate a proposed batch of songs for a musical crossword puzzle, ensuring strict adherence to the user's input criteria.

=== USER INPUT CRITERIA ===
${inputContextSummary}
TARGET TRACK COUNT: ${targetWordCount}

=== PROPOSED CANDIDATE TRACKS ===
${JSON.stringify(tracksSnippet, null, 2)}

=== EVALUATION INSTRUCTIONS ===
1. THEMATIC / PROMPT FIDELITY:
   - If Custom Prompt mode:
     * Check temporal constraints: If prompt specifies a timeframe (e.g. "new gen kpop" = 2020+, "90s grunge before 1994", "classic 70s"), reject songs outside this window.
     * Check artist constraints: If prompt requests a specific artist (e.g. "songs by Daft Punk"), reject tracks by any other artist.
     * Check genre & cultural relevance: Reject non-fitting collisions or homonyms (e.g. "The Japanese House" for Japanese City Pop, or "DJ AniMe" for Anime).
   - If Preset Theme mode:
     * Verify that every track belongs to "${theme.title}".
2. POPULARITY PROFILE ALIGNMENT:
   - "obscure": Flag mega-popular billion-stream tracks; expect indie/b-sides/deep cuts.
   - "mainstream": Flag obscure or amateur tracks that casual listeners wouldn't recognize.
   - "balanced" / "pure": Organic catalog representation fitting the theme.
3. NEGOTIATED REPLACEMENT QUERY CONTRACT:
   If any track(s) are rejected, you MUST formulate targeted replacement queries conforming strictly to this JSON schema:
   {
     "isSatisfied": boolean,
     "verdictSummary": string,
     "rejectedTrackIndices": number[],
     "rejectionReasons": { "<index>": "specific reason for rejection" },
     "replacementQueries": [
       {
         "artist": "string (optional)",
         "trackTitle": "string (optional)",
         "genre": "string (optional)",
         "searchTerms": ["search term 1", "search term 2"],
         "yearRange": { "start": 2020, "end": 2026 },
         "targetStorefront": "us",
         "popularity": "balanced"
       }
     ]
   }

Respond ONLY with valid JSON conforming to the contract above.`;
}

export const GEMINI_MODEL_CASCADE = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
];

const MAX_ATTEMPTS_PER_MODEL = 4;

let customGeminiFetch = null;

/**
 * Allows test suites to inject mock Gemini fetch handlers.
 */
export function setGeminiFetchForTesting(fn) {
  customGeminiFetch = fn;
}

/**
 * Invokes the Gemini API with automatic retry per model and fallback ladder:
 * gemini-3.8-flash -> gemini-3.7-flash -> gemini-3.6-flash -> gemini-3.5-flash
 * Each model is retried up to MAX_ATTEMPTS_PER_MODEL (4) times before cascading.
 */
export async function queryGeminiWithFallback(promptText) {
  const apiKey = getGeminiApiKey();
  if (!apiKey || apiKey === 'TODO') {
    return {
      success: false,
      reason: 'KEY_NOT_CONFIGURED',
      modelUsed: null,
      data: null,
    };
  }

  const fetchFn = customGeminiFetch || fetch;

  for (let i = 0; i < GEMINI_MODEL_CASCADE.length; i++) {
    const model = GEMINI_MODEL_CASCADE[i];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          parts: [{ text: promptText }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    };

    let modelFailedDueTo404 = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        logger.info(
          'llm_judge',
          attempt === 1
            ? `Attempting evaluation with model ${model}...`
            : `Retrying evaluation with model ${model} (attempt ${attempt}/${MAX_ATTEMPTS_PER_MODEL})...`
        );
        const response = await fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          const json = await response.json();
          const rawContent = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawContent) {
            try {
              const parsed = JSON.parse(rawContent);
              logger.info('llm_judge', `Model ${model} responded successfully.`);
              return {
                success: true,
                modelUsed: model,
                data: parsed,
              };
            } catch (parseErr) {
              logger.warn('llm_judge', `Model ${model} returned unparseable JSON: ${parseErr.message}`);
            }
          }
        } else {
          const errText = await response.text().catch(() => '');
          logger.warn(
            'llm_judge',
            `Model ${model} attempt ${attempt}/${MAX_ATTEMPTS_PER_MODEL} failed with HTTP ${response.status}: ${errText.slice(0, 150)}`
          );
          if (response.status === 404) {
            // Non-existent or deprecated model endpoint; retrying will produce the exact same 404
            modelFailedDueTo404 = true;
            break;
          }
        }
      } catch (netErr) {
        logger.warn(
          'llm_judge',
          `Model ${model} attempt ${attempt}/${MAX_ATTEMPTS_PER_MODEL} network error: ${netErr.message}`
        );
      }

      if (attempt < MAX_ATTEMPTS_PER_MODEL && !modelFailedDueTo404) {
        if (!customGeminiFetch) {
          const backoffMs = Math.min(attempt * 800, 3000);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    if (i < GEMINI_MODEL_CASCADE.length - 1) {
      logger.info('llm_judge', `Falling back to next model: ${GEMINI_MODEL_CASCADE[i + 1]}`);
    }
  }

  logger.warn('llm_judge', 'All Gemini models in fallback cascade exhausted.');
  return {
    success: false,
    reason: 'ALL_MODELS_FAILED',
    modelUsed: null,
    data: null,
  };
}

/**
 * Evaluates candidate songs using Gemini LLM Judge with Negotiated Contract.
 */
export async function evaluateSongSelection(inputContract) {
  if (!isGeminiJudgeConfigured()) {
    logger.info('llm_judge', 'Gemini API key is not configured or set to TODO - LLM Judge in standby mode.');
    return {
      evaluated: false,
      reason: 'STANDBY_MODE',
      judgment: {
        isSatisfied: true,
        verdictSummary: 'LLM Judge in standby mode (key=TODO).',
        rejectedTrackIndices: [],
        rejectionReasons: {},
        replacementQueries: [],
      },
    };
  }

  const promptText = buildJudgePrompt(inputContract);
  const result = await queryGeminiWithFallback(promptText);

  if (!result.success || !result.data) {
    return {
      evaluated: false,
      reason: result.reason || 'FAILED',
      modelUsed: result.modelUsed,
      judgment: {
        isSatisfied: true,
        verdictSummary: 'Gemini unavailable; proceeding with standard selection.',
        rejectedTrackIndices: [],
        rejectionReasons: {},
        replacementQueries: [],
      },
    };
  }

  const validatedContract = validateLLMJudgeResponse(result.data, inputContract.candidateTracks?.length || 0);

  return {
    evaluated: true,
    modelUsed: result.modelUsed,
    judgment: validatedContract,
  };
}
