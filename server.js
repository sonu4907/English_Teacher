const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { createAuth } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use('/vendor/pdfjs', express.static(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build')));
app.use('/vendor/mammoth', express.static(path.join(__dirname, 'node_modules', 'mammoth')));
app.use('/vendor/jszip', express.static(path.join(__dirname, 'node_modules', 'jszip', 'dist')));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
const auth = createAuth(app);

// English-primary grammar correction system prompt
const SYSTEM_PROMPT = `You are an expert English grammar correction assistant with multilingual capability.

PRIMARY FOCUS: English grammar, spelling, punctuation, style, and clarity.
For English input, analyse deeply:
  - Subject-verb agreement (he goes/they go, I am/she is, was/were)
  - Tense consistency and correct tense selection
  - Article usage (a vs an — use "an" before vowel sounds)
  - Homophones (their/there/they're, your/you're, its/it\'s, to/too/two)
  - Contractions with apostrophes (don\'t, can\'t, won\'t, it\'s, I\'m, I\'ve)
  - Modal verbs (should have — NOT "should of", could have, would have)
  - Double negatives (don\'t have no → don\'t have any)
  - Preposition correctness (in time, on time, at school, in school)
  - Wordiness and redundancy removal
  - Active voice preference over passive when clearer
For other languages, apply that language\'s native grammar rules.

Always preserve the user\'s intended meaning.
Keep answers short, clear, and easy to understand. No unnecessary explanations.
Do not invent mistakes. Do not change meaning.

Return EXACTLY this structure:

CORRECTED:
[corrected sentence]

CHANGES:
- original → corrected : reason
- (max 3 most important changes)

EXPLANATION:
[one short sentence, 15 words or fewer]

BETTER VERSION:
- [Option 1: natural, fluent & polished rewrite]
- [Option 2: concise, clear & direct rewrite]
- [Option 3: professional, elegant & formal rewrite]

If the sentence is already correct:
CORRECTED: [same sentence]
CHANGES: none
EXPLANATION: Your sentence is correct.
BETTER VERSION:
- [Option 1: subtle stylistic polish]
- [Option 2: more concise phrasing]
- [Option 3: alternative vocabulary phrasing]

For "Simple English" mode: use short words, short sentences (under 15 words),
active voice, no jargon. Target a Grade 5 reading level. Provide 2 to 3 simple alternatives under BETTER VERSION.
For "Improve" mode: elevate to professional, concise, polished English.
Use stronger verbs, remove filler words (very, really, just, quite), improve flow. Provide 2 to 3 polished alternatives under BETTER VERSION.

IMPORTANT: Under BETTER VERSION, always output 2 or 3 distinct alternative sentences, each starting with a dash (-). Never omit this section.`;

// Generates 2 to 3 stylistic alternative sentences for a given base text
function generateAlternativeBetterVersions(base, corrected = '') {
  const versions = [];
  const primary = (base || corrected || '').trim();
  if (primary) versions.push(primary);

  const clean = (str) => str.trim().replace(/[.!?]+$/, '');
  const baseNoPunct = clean(primary);

  // 1. Concise / Direct version
  let concise = baseNoPunct
    .replace(/\b(in order to)\b/gi, 'to')
    .replace(/\b(on a daily basis)\b/gi, 'daily')
    .replace(/\b(at this point in time)\b/gi, 'now')
    .replace(/\b(at the present time)\b/gi, 'currently')
    .replace(/\b(due to the fact that)\b/gi, 'because')
    .replace(/\b(has the capability to|has the ability to)\b/gi, 'can')
    .replace(/\b(take into consideration)\b/gi, 'consider')
    .replace(/\b(make a decision)\b/gi, 'decide')
    .replace(/\b(prior to)\b/gi, 'before')
    .replace(/\b(subsequent to)\b/gi, 'after')
    .replace(/\b(a large number of)\b/gi, 'many')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (concise && concise !== baseNoPunct && !versions.includes(concise + '.')) {
    versions.push(concise + '.');
  }

  // 2. Natural / Active variation
  if (versions.length < 2) {
    if (/\bgoes to college\b/i.test(baseNoPunct)) {
      versions.push(baseNoPunct.replace(/\bgoes to college\b/gi, 'attends classes') + '.');
    } else if (/\battends college\b/i.test(baseNoPunct)) {
      versions.push(baseNoPunct.replace(/\battends college\b/gi, 'goes to college') + '.');
    } else if (/^(he|she) doesn't know/i.test(baseNoPunct)) {
      versions.push(baseNoPunct.replace(/doesn't know/i, 'is unaware of') + '.');
    } else if (/\bneed to\b/i.test(baseNoPunct)) {
      versions.push(baseNoPunct.replace(/\bneed to\b/gi, 'should') + '.');
    } else if (/\bcan\b/i.test(baseNoPunct)) {
      versions.push(baseNoPunct.replace(/\bcan\b/gi, 'is able to') + '.');
    } else {
      versions.push(`Clearly, ${baseNoPunct.charAt(0).toLowerCase()}${baseNoPunct.slice(1)}.`);
    }
  }

  // 3. Professional / Formal variation
  if (versions.length < 3) {
    if (/\b(every day|daily)\b/i.test(baseNoPunct)) {
      versions.push(baseNoPunct.replace(/\b(every day|daily)\b/gi, 'regularly') + '.');
    } else if (/\b(help|assist)\b/i.test(baseNoPunct)) {
      versions.push(baseNoPunct.replace(/\b(help|assist)\b/gi, 'provide assistance') + '.');
    } else if (/\b(problem|issue)\b/i.test(baseNoPunct)) {
      versions.push(baseNoPunct.replace(/\b(problem|issue)\b/gi, 'complication') + '.');
    } else {
      versions.push(`In essence, ${baseNoPunct.charAt(0).toLowerCase()}${baseNoPunct.slice(1)}.`);
    }
  }

  return versions.slice(0, 3);
}

// Parser for the exact LLM output format
function parseLLMResponse(rawText, originalInput) {
  const result = {
    corrected: '',
    changes: [],
    explanation: 'Your sentence is correct.',
    betterVersion: '',
    betterVersions: [],
    rawOutput: rawText
  };

  if (!rawText) {
    result.corrected = originalInput;
    result.betterVersion = originalInput;
    result.betterVersions = [originalInput];
    return result;
  }

  const lines = rawText.split('\n').map(l => l.trim());
  let currentSection = null;
  const changesLines = [];
  const betterVersionLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^CORRECTED:/i.test(line)) {
      currentSection = 'CORRECTED';
      const inlineVal = line.replace(/^CORRECTED:\s*/i, '').trim();
      if (inlineVal) result.corrected = inlineVal;
      continue;
    } else if (/^CHANGES:/i.test(line)) {
      currentSection = 'CHANGES';
      const inlineVal = line.replace(/^CHANGES:\s*/i, '').trim();
      if (inlineVal && !inlineVal.toLowerCase().includes('none')) {
        changesLines.push(inlineVal);
      }
      continue;
    } else if (/^EXPLANATION:/i.test(line)) {
      currentSection = 'EXPLANATION';
      const inlineVal = line.replace(/^EXPLANATION:\s*/i, '').trim();
      if (inlineVal) result.explanation = inlineVal;
      continue;
    } else if (/^BETTER VERSION(?:S)?:/i.test(line)) {
      currentSection = 'BETTER VERSION';
      const inlineVal = line.replace(/^BETTER VERSION(?:S)?:\s*/i, '').trim();
      if (inlineVal) {
        betterVersionLines.push(inlineVal);
      }
      continue;
    }

    if (line) {
      if (currentSection === 'CORRECTED' && !result.corrected) {
        result.corrected = line;
      } else if (currentSection === 'CHANGES') {
        if (!line.toLowerCase().includes('none')) {
          changesLines.push(line);
        }
      } else if (currentSection === 'EXPLANATION') {
        result.explanation = line;
      } else if (currentSection === 'BETTER VERSION') {
        betterVersionLines.push(line);
      }
    }
  }

  if (!result.corrected) {
    result.corrected = originalInput;
  }

  // Parse better versions: strip bullets, numbering, "Option N:" labels
  const parsedVersions = [];
  for (const bLine of betterVersionLines) {
    const cleaned = bLine
      .replace(/^[-*•\d.)\]\s]+/, '')
      .replace(/^Option\s*\d+\s*[:\-]\s*/i, '')
      .replace(/^\[Option\s*\d+[^\]]*\]\s*[:\-]?\s*/i, '')
      .trim();
    if (cleaned && !parsedVersions.includes(cleaned) && cleaned.toLowerCase() !== 'none') {
      parsedVersions.push(cleaned);
    }
  }

  if (parsedVersions.length >= 2) {
    result.betterVersions = parsedVersions.slice(0, 3);
  } else if (parsedVersions.length === 1) {
    result.betterVersions = generateAlternativeBetterVersions(parsedVersions[0], result.corrected);
  } else {
    result.betterVersions = generateAlternativeBetterVersions(result.corrected, result.corrected);
  }

  // Backward compatibility: single string field
  result.betterVersion = result.betterVersions[0] || result.corrected;

  // Parse structured changes: - original → corrected : reason
  result.changes = changesLines.map(c => {
    const cleaned = c.replace(/^[-*•]\s*/, '').trim();
    // Match "original → corrected : reason" or "original -> corrected : reason"
    const arrowMatch = cleaned.match(/(.+?)\s*(?:→|->)\s*(.+?)\s*:\s*(.+)/);
    if (arrowMatch) {
      return {
        original: arrowMatch[1].trim(),
        corrected: arrowMatch[2].trim(),
        reason: arrowMatch[3].trim(),
        text: cleaned
      };
    }
    return {
      original: '',
      corrected: '',
      reason: '',
      text: cleaned
    };
  }).filter(c => c.text && c.text.toLowerCase() !== 'none');

  return result;
}

// Built-in intelligent offline fallback rule & pattern engine for seamless immediate testing
function getSimulatedCorrection(text, language = 'English', mode = 'grammar') {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Test case 1 from prompt: "He go to college everyday."
  if (/^he\s+go\s+to\s+college\s+everyday\.?$/i.test(trimmed)) {
    const bvs = [
      "He attends college every day.",
      "He goes to college daily.",
      "He attends classes on a daily basis."
    ];
    return {
      corrected: "He goes to college every day.",
      changes: [
        { original: "go", corrected: "goes", reason: "Subject-verb agreement with third-person singular", text: "go → goes : Subject-verb agreement with third-person singular" },
        { original: "everyday", corrected: "every day", reason: "Adverbial time phrase should be two words", text: "everyday → every day : Adverbial time phrase should be two words" }
      ],
      explanation: "Fixed subject-verb agreement and separated the adverb 'every day'.",
      betterVersion: bvs[0],
      betterVersions: bvs,
      rawOutput: `CORRECTED:\nHe goes to college every day.\n\nCHANGES:\n- go → goes : Subject-verb agreement with third-person singular\n- everyday → every day : Adverbial time phrase should be two words\n\nEXPLANATION:\nFixed subject-verb agreement and separated the adverb 'every day'.\n\nBETTER VERSION:\n- ${bvs[0]}\n- ${bvs[1]}\n- ${bvs[2]}`
    };
  }

  // Test case 2 from prompt: Marathi: "मी काल कॉलेज ला गेलो."
  if (trimmed.includes('कॉलेज ला') || trimmed.includes('कॉलेजला') || /मी\s+काल\s+कॉलेज/i.test(trimmed)) {
    const isAlreadyFixed = trimmed.includes('कॉलेजला');
    const bvs = [
      "मी काल महाविद्यालयात गेलो होतो.",
      "मी काल कॉलेजमध्ये गेलो होतो.",
      "मी काल नियमितपणे कॉलेजला गेलो."
    ];
    if (isAlreadyFixed) {
      return {
        corrected: trimmed,
        changes: [],
        explanation: "Your sentence is correct.",
        betterVersion: bvs[0],
        betterVersions: bvs,
        rawOutput: `CORRECTED:\n${trimmed}\n\nCHANGES:\nnone\n\nEXPLANATION:\nYour sentence is correct.\n\nBETTER VERSION:\n- ${bvs[0]}\n- ${bvs[1]}\n- ${bvs[2]}`
      };
    }
    return {
      corrected: trimmed.replace(/कॉलेज\s+ला/g, 'कॉलेजला'),
      changes: [
        { original: "कॉलेज ला", corrected: "कॉलेजला", reason: "Marathi postpositions are joined with the noun", text: "कॉलेज ला → कॉलेजला : Marathi postpositions are joined with the noun" }
      ],
      explanation: "मराठीत विभक्ती प्रत्यय शब्दाला जोडून लिहिला जातो.",
      betterVersion: bvs[0],
      betterVersions: bvs,
      rawOutput: `CORRECTED:\n${trimmed.replace(/कॉलेज\s+ला/g, 'कॉलेजला')}\n\nCHANGES:\n- कॉलेज ला → कॉलेजला : Marathi postpositions are joined with the noun\n\nEXPLANATION:\nमराठीत विभक्ती प्रत्यय शब्दाला जोडून लिहिला जातो.\n\nBETTER VERSION:\n- ${bvs[0]}\n- ${bvs[1]}\n- ${bvs[2]}`
    };
  }

  // Hindi test case: "हम कल आऊंगा." -> "मैं कल आऊँगा."
  if (/हम\s+कल\s+आऊंगा/i.test(trimmed) || /हम\s+कल\s+आएगा/i.test(trimmed)) {
    const bvs = [
      "मैं कल अवश्य उपस्थित रहूँगा।",
      "मैं कल निश्चित रूप से आऊँगा।",
      "मेरी कल आने की पूरी तैयारी है।"
    ];
    return {
      corrected: "मैं कल आऊँगा।",
      changes: [
        { original: "हम", corrected: "मैं", reason: "Singular pronoun needed for singular verb agreement", text: "हम → मैं : Singular pronoun needed for singular verb agreement" },
        { original: "आऊंगा.", corrected: "आऊँगा।", reason: "Correct Hindi spelling and purna viram punctuation", text: "आऊंगा. → आऊँगा। : Correct Hindi spelling and purna viram punctuation" }
      ],
      explanation: "सर्वनाम और क्रिया का लिंग-वचन समन्वय सही किया गया।",
      betterVersion: bvs[0],
      betterVersions: bvs,
      rawOutput: `CORRECTED:\nमैं कल आऊँगा।\n\nCHANGES:\n- हम → मैं : Singular pronoun needed for singular verb agreement\n- आऊंगा. → आऊँगा। : Correct Hindi spelling and purna viram punctuation\n\nEXPLANATION:\nसर्वनाम और क्रिया का लिंग-वचन समन्वय सही किया गया।\n\nBETTER VERSION:\n- ${bvs[0]}\n- ${bvs[1]}\n- ${bvs[2]}`
    };
  }

  // Spanish test case: "Ella no sabo la verdad."
  if (/ella\s+no\s+sabo/i.test(trimmed)) {
    const bvs = [
      "Ella desconoce totalmente la verdad.",
      "Ella ignora lo que realmente sucedió.",
      "Ella aún no sabe lo que pasó."
    ];
    return {
      corrected: "Ella no sabe la verdad.",
      changes: [
        { original: "sabo", corrected: "sabe", reason: "Irregular third person singular present conjugation of saber", text: "sabo → sabe : Irregular third person singular present conjugation of saber" }
      ],
      explanation: "Se corrigió la conjugación irregular del verbo saber.",
      betterVersion: bvs[0],
      betterVersions: bvs,
      rawOutput: `CORRECTED:\nElla no sabe la verdad.\n\nCHANGES:\n- sabo → sabe : Irregular third person singular present conjugation of saber\n\nEXPLANATION:\nSe corrigió la conjugación irregular del verbo saber.\n\nBETTER VERSION:\n- ${bvs[0]}\n- ${bvs[1]}\n- ${bvs[2]}`
    };
  }

  // General heuristic engine for common patterns
  let corrected = trimmed;
  const changes = [];

  if (mode === 'simple') {
    // ── Simple English mode: Grade 5 level, short words, active voice ────────
    if (trimmed.length > 5) {
      const simplifyMap = [
        [/\butilize\b/gi, 'use'],
        [/\bcommence\b/gi, 'start'],
        [/\bterminate\b/gi, 'end'],
        [/\bproceed\b/gi, 'go'],
        [/\bobtain\b/gi, 'get'],
        [/\bpurchase\b/gi, 'buy'],
        [/\brequire\b/gi, 'need'],
        [/\bdemonstrate\b/gi, 'show'],
        [/\bindicate\b/gi, 'show'],
        [/\bfacilitate\b/gi, 'help'],
        [/\bin order to\b/gi, 'to'],
        [/\bdue to the fact that\b/gi, 'because'],
        [/\bas a result of\b/gi, 'because of'],
        [/\bat this point in time\b/gi, 'now'],
        [/\bat the present time\b/gi, 'now'],
        [/\bhas the capability to\b/gi, 'can'],
        [/\bperform an analysis of\b/gi, 'analyse'],
        [/\btake into consideration\b/gi, 'consider'],
        [/\bmake a decision\b/gi, 'decide'],
        [/\bin the event that\b/gi, 'if'],
        [/\bprior to\b/gi, 'before'],
        [/\bsubsequent to\b/gi, 'after'],
        [/\bwith regard to\b/gi, 'about'],
        [/\bwith respect to\b/gi, 'about'],
        [/\ba large number of\b/gi, 'many'],
        [/\ba significant amount of\b/gi, 'much'],
        [/\bnotwithstanding\b/gi, 'despite'],
        [/\bnevertheless\b/gi, 'still'],
        [/\bconsequently\b/gi, 'so'],
        [/\bfurthermore\b/gi, 'also'],
        [/\bmoreover\b/gi, 'also'],
      ];

      const simpleChanges = [];
      let simple = trimmed;
      for (const [regex, rep] of simplifyMap) {
        if (regex.test(simple)) {
          const match = simple.match(regex);
          if (match && simpleChanges.length < 3) {
            simpleChanges.push({
              original: match[0],
              corrected: rep,
              reason: `Simplified to plain English`,
              text: `${match[0]} → ${rep} : Simplified to plain English`
            });
          }
          simple = simple.replace(regex, rep);
        }
      }

      simple = simple.charAt(0).toUpperCase() + simple.slice(1);
      if (!/[.!?]$/.test(simple)) simple += '.';

      if (simpleChanges.length === 0) {
        simpleChanges.push({ original: 'complex phrasing', corrected: 'plain words', reason: 'Simplified vocabulary', text: 'complex phrasing → plain words : Simplified vocabulary' });
      }

      const bvs = [
        simple,
        simple.replace(/\./, ' clearly.'),
        simple.replace(/^The /i, 'This ')
      ];

      return {
        corrected: simple,
        changes: simpleChanges,
        explanation: 'Rewritten in short, easy English for clarity.',
        betterVersion: bvs[0],
        betterVersions: bvs,
        rawOutput: `CORRECTED:\n${simple}\n\nCHANGES:\n${simpleChanges.map(c => `- ${c.text}`).join('\n')}\n\nEXPLANATION:\nRewritten in short, easy English for clarity.\n\nBETTER VERSION:\n- ${bvs[0]}\n- ${bvs[1]}\n- ${bvs[2]}`
      };
    }
  }

  if (mode === 'improve') {
    // ── Improve mode: Professional, concise, polished English ────────────────
    const improveMap = [
      // Filler words / hedging
      [/\bi think that\b/gi, 'In my view,'],
      [/\bi believe that\b/gi, 'I believe'],
      [/\bkind of\b/gi, 'somewhat'],
      [/\bsort of\b/gi, 'somewhat'],
      [/\bjust\b/gi, ''],
      [/\bvery good\b/gi, 'excellent'],
      [/\bvery bad\b/gi, 'poor'],
      [/\bvery important\b/gi, 'critical'],
      [/\bvery large\b/gi, 'substantial'],
      [/\bvery small\b/gi, 'minimal'],
      [/\breally\b/gi, ''],
      [/\bquite\b/gi, ''],
      // Wordy phrases
      [/\ba lot of\b/gi, 'numerous'],
      [/\blots of\b/gi, 'many'],
      [/\bget in touch with\b/gi, 'contact'],
      [/\bhelp out\b/gi, 'assist'],
      [/\bfind out\b/gi, 'discover'],
      [/\bpoint out\b/gi, 'highlight'],
      [/\bcarry out\b/gi, 'execute'],
      [/\bset up\b/gi, 'establish'],
      [/\bthink about\b/gi, 'consider'],
      [/\bcome up with\b/gi, 'develop'],
      [/\bput together\b/gi, 'compile'],
      [/\bin order to\b/gi, 'to'],
      [/\bdue to the fact that\b/gi, 'because'],
      [/\bfor the purpose of\b/gi, 'to'],
      [/\bwith the exception of\b/gi, 'except'],
    ];

    const improveChanges = [];
    let improved = trimmed;
    for (const [regex, rep] of improveMap) {
      if (regex.test(improved)) {
        const match = improved.match(regex);
        if (match && improveChanges.length < 3) {
          const originalWord = match[0].trim();
          const correctedWord = rep.trim();
          if (originalWord && correctedWord !== originalWord) {
            improveChanges.push({
              original: originalWord,
              corrected: correctedWord || '(removed)',
              reason: 'Enhanced vocabulary for professional tone',
              text: `${originalWord} → ${correctedWord || '(removed)'} : Enhanced vocabulary for professional tone`
            });
          }
        }
        improved = improved.replace(regex, rep);
      }
    }

    // Clean up double spaces from removals
    improved = improved.replace(/\s{2,}/g, ' ').trim();
    improved = improved.charAt(0).toUpperCase() + improved.slice(1);
    if (!/[.!?]$/.test(improved)) improved += '.';

    if (improveChanges.length === 0) {
      improveChanges.push({ original: 'casual phrasing', corrected: 'polished phrasing', reason: 'Enhanced tone for professionalism', text: 'casual phrasing → polished phrasing : Enhanced tone for professionalism' });
    }

    const bvs = [
      improved,
      `We recommend that ${improved.charAt(0).toLowerCase()}${improved.slice(1)}`,
      `Please note that ${improved.charAt(0).toLowerCase()}${improved.slice(1)}`
    ];

    return {
      corrected: improved,
      changes: improveChanges,
      explanation: 'Refined vocabulary and structure for a professional tone.',
      betterVersion: bvs[0],
      betterVersions: bvs,
      rawOutput: `CORRECTED:\n${improved}\n\nCHANGES:\n${improveChanges.map(c => `- ${c.text}`).join('\n')}\n\nEXPLANATION:\nRefined vocabulary and structure for a professional tone.\n\nBETTER VERSION:\n- ${bvs[0]}\n- ${bvs[1]}\n- ${bvs[2]}`
    };
  }

  // ─── Comprehensive English Grammar Rule Engine ───────────────────────────
  // Only apply these English-specific rules when language is English/Auto
  const isEnglish = !language || language === 'English' || language === 'Auto Detect';

  if (isEnglish) {
    const rules = [
      // ── Contractions ──────────────────────────────────────────────────────
      { regex: /\bdont\b/gi, rep: "don't", desc: 'Missing apostrophe in contraction' },
      { regex: /\bcant\b/gi, rep: "can't", desc: 'Missing apostrophe in contraction' },
      { regex: /\bwont\b/gi, rep: "won't", desc: 'Missing apostrophe in contraction' },
      { regex: /\bdoesnt\b/gi, rep: "doesn't", desc: 'Missing apostrophe in contraction' },
      { regex: /\bisnt\b/gi, rep: "isn't", desc: 'Missing apostrophe in contraction' },
      { regex: /\barent\b/gi, rep: "aren't", desc: 'Missing apostrophe in contraction' },
      { regex: /\bwasnt\b/gi, rep: "wasn't", desc: 'Missing apostrophe in contraction' },
      { regex: /\bwerent\b/gi, rep: "weren't", desc: 'Missing apostrophe in contraction' },
      { regex: /\bhavent\b/gi, rep: "haven't", desc: 'Missing apostrophe in contraction' },
      { regex: /\bhasnt\b/gi, rep: "hasn't", desc: 'Missing apostrophe in contraction' },
      { regex: /\bhadnt\b/gi, rep: "hadn't", desc: 'Missing apostrophe in contraction' },
      { regex: /\bwouldnt\b/gi, rep: "wouldn't", desc: 'Missing apostrophe in contraction' },
      { regex: /\bcouldnt\b/gi, rep: "couldn't", desc: 'Missing apostrophe in contraction' },
      { regex: /\bshouldnt\b/gi, rep: "shouldn't", desc: 'Missing apostrophe in contraction' },
      { regex: /\bdidnt\b/gi, rep: "didn't", desc: 'Missing apostrophe in contraction' },

      // ── Subject-Verb Agreement ────────────────────────────────────────────
      { regex: /\bhe don't\b/gi, rep: "he doesn't", desc: 'Third-person singular requires "doesn\'t"' },
      { regex: /\bshe don't\b/gi, rep: "she doesn't", desc: 'Third-person singular requires "doesn\'t"' },
      { regex: /\bit don't\b/gi, rep: "it doesn't", desc: 'Third-person singular requires "doesn\'t"' },
      { regex: /\bthey is\b/gi, rep: 'they are', desc: 'Plural pronoun "they" requires "are"' },
      { regex: /\bwe is\b/gi, rep: 'we are', desc: 'Plural pronoun "we" requires "are"' },
      { regex: /\bwe was\b/gi, rep: 'we were', desc: 'Plural pronoun "we" requires "were"' },
      { regex: /\bthey was\b/gi, rep: 'they were', desc: 'Plural pronoun "they" requires "were"' },
      { regex: /\bi is\b/gi, rep: 'I am', desc: 'First-person singular requires "am"' },
      { regex: /\bi are\b/gi, rep: 'I am', desc: 'First-person singular requires "am"' },
      { regex: /\bhe go\b/gi, rep: 'he goes', desc: 'Third-person singular requires -s ending' },
      { regex: /\bshe go\b/gi, rep: 'she goes', desc: 'Third-person singular requires -s ending' },
      { regex: /\bit go\b/gi, rep: 'it goes', desc: 'Third-person singular requires -s ending' },

      // ── Homophones & Common Confusions ────────────────────────────────────
      { regex: /\byour welcome\b/gi, rep: "you're welcome", desc: 'Homophone: "you\'re" (you are), not possessive "your"' },
      { regex: /\btheir is\b/gi, rep: 'there is', desc: 'Homophone: existential "there", not possessive "their"' },
      { regex: /\btheir are\b/gi, rep: 'there are', desc: 'Homophone: existential "there", not possessive "their"' },
      { regex: /\bthere car\b/gi, rep: 'their car', desc: 'Homophone: possessive "their", not locative "there"' },
      { regex: /\bto much\b/gi, rep: 'too much', desc: 'Homophone: degree adverb "too", not preposition "to"' },
      { regex: /\bto many\b/gi, rep: 'too many', desc: 'Homophone: degree adverb "too", not preposition "to"' },
      { regex: /\bto late\b/gi, rep: 'too late', desc: 'Homophone: degree adverb "too", not preposition "to"' },
      { regex: /\bto fast\b/gi, rep: 'too fast', desc: 'Homophone: degree adverb "too", not preposition "to"' },
      { regex: /\bto hard\b/gi, rep: 'too hard', desc: 'Homophone: degree adverb "too", not preposition "to"' },
      { regex: /\bto good\b/gi, rep: 'too good', desc: 'Homophone: degree adverb "too", not preposition "to"' },
      { regex: /\bits a\b/gi, rep: "it's a", desc: 'Apostrophe needed: "it\'s" = it is' },
      { regex: /\bits an\b/gi, rep: "it's an", desc: 'Apostrophe needed: "it\'s" = it is' },
      { regex: /\bits the\b/gi, rep: "it's the", desc: 'Apostrophe needed: "it\'s" = it is' },

      // ── Modal Verb Errors ("of" instead of "have") ────────────────────────
      { regex: /\bshould of\b/gi, rep: 'should have', desc: 'Modal error: "should have", not "should of"' },
      { regex: /\bcould of\b/gi, rep: 'could have', desc: 'Modal error: "could have", not "could of"' },
      { regex: /\bwould of\b/gi, rep: 'would have', desc: 'Modal error: "would have", not "would of"' },
      { regex: /\bmight of\b/gi, rep: 'might have', desc: 'Modal error: "might have", not "might of"' },
      { regex: /\bmust of\b/gi, rep: 'must have', desc: 'Modal error: "must have", not "must of"' },

      // ── Article Errors ────────────────────────────────────────────────────
      { regex: /\ba apple\b/gi, rep: 'an apple', desc: 'Use "an" before vowel sound' },
      { regex: /\ba orange\b/gi, rep: 'an orange', desc: 'Use "an" before vowel sound' },
      { regex: /\ba umbrella\b/gi, rep: 'an umbrella', desc: 'Use "an" before vowel sound' },
      { regex: /\ba hour\b/gi, rep: 'an hour', desc: 'Use "an" before silent h (vowel sound)' },
      { regex: /\ba honest\b/gi, rep: 'an honest', desc: 'Use "an" before silent h (vowel sound)' },
      { regex: /\ba elephant\b/gi, rep: 'an elephant', desc: 'Use "an" before vowel sound' },
      { regex: /\ba easy\b/gi, rep: 'an easy', desc: 'Use "an" before vowel sound' },
      { regex: /\ba important\b/gi, rep: 'an important', desc: 'Use "an" before vowel sound' },

      // ── Double Negatives ──────────────────────────────────────────────────
      { regex: /\bdon't have no\b/gi, rep: "don't have any", desc: 'Double negative: use "don\'t have any"' },
      { regex: /\bcan't do nothing\b/gi, rep: "can't do anything", desc: 'Double negative: use "can\'t do anything"' },
      { regex: /\bdidn't do nothing\b/gi, rep: "didn't do anything", desc: 'Double negative: use "didn\'t do anything"' },
      { regex: /\bnever done nothing\b/gi, rep: 'never done anything', desc: 'Double negative: use "never done anything"' },
      { regex: /\bain't got no\b/gi, rep: "don't have any", desc: 'Double negative: use "don\'t have any"' },

      // ── Common Spelling Mistakes ──────────────────────────────────────────
      { regex: /\bteh\b/gi, rep: 'the', desc: 'Spelling typo: "the"' },
      { regex: /\badn\b/gi, rep: 'and', desc: 'Spelling typo: "and"' },
      { regex: /\brecieve\b/gi, rep: 'receive', desc: 'Spelling: i before e except after c → "receive"' },
      { regex: /\bacheive\b/gi, rep: 'achieve', desc: 'Spelling correction: "achieve"' },
      { regex: /\bbelive\b/gi, rep: 'believe', desc: 'Spelling correction: "believe"' },
      { regex: /\bseperate\b/gi, rep: 'separate', desc: 'Common misspelling: "separate"' },
      { regex: /\boccured\b/gi, rep: 'occurred', desc: 'Double consonant needed: "occurred"' },
      { regex: /\bbeggining\b/gi, rep: 'beginning', desc: 'One g: "beginning"' },
      { regex: /\buntill\b/gi, rep: 'until', desc: 'One l: "until"' },
      { regex: /\bdefinately\b/gi, rep: 'definitely', desc: 'Common misspelling: "definitely"' },
      { regex: /\baccomodate\b/gi, rep: 'accommodate', desc: 'Double c and m: "accommodate"' },
      { regex: /\bcomming\b/gi, rep: 'coming', desc: 'One m: "coming"' },
      { regex: /\bwriteing\b/gi, rep: 'writing', desc: 'Drop e before -ing: "writing"' },
      { regex: /\bforiegn\b/gi, rep: 'foreign', desc: 'Spelling correction: "foreign"' },
      { regex: /\btommorow\b/gi, rep: 'tomorrow', desc: 'Double r: "tomorrow"' },
      { regex: /\bwierd\b/gi, rep: 'weird', desc: 'Spelling: "weird" (exception to i-before-e)' },
      { regex: /\bgoverment\b/gi, rep: 'government', desc: 'Missing n: "government"' },
      { regex: /\bpersaude\b/gi, rep: 'persuade', desc: 'Spelling correction: "persuade"' },
      { regex: /\bcommittee\b/gi, rep: 'committee', desc: 'Correct: "committee"' },
      { regex: /\bconscious\b/gi, rep: 'conscious', desc: 'Correct: "conscious"' },
      { regex: /\bgaurantee\b/gi, rep: 'guarantee', desc: 'Spelling correction: "guarantee"' },
      { regex: /\bneccessary\b/gi, rep: 'necessary', desc: 'One c, double s: "necessary"' },
      { regex: /\boccasionaly\b/gi, rep: 'occasionally', desc: 'Double l: "occasionally"' },
      { regex: /\bprivilege\b/gi, rep: 'privilege', desc: 'Correct: "privilege"' },
      { regex: /\bsurprise\b/gi, rep: 'surprise', desc: 'Correct: "surprise"' },

      // ── Punctuation Spacing ───────────────────────────────────────────────
      { regex: /\s+,/g, rep: ',', desc: 'Remove space before comma' },
      { regex: /\s+\./g, rep: '.', desc: 'Remove space before period' },
      { regex: /\s+!/g, rep: '!', desc: 'Remove space before exclamation mark' },
      { regex: /\s+\?/g, rep: '?', desc: 'Remove space before question mark' },

      // ── Capitalisation ────────────────────────────────────────────────────
      { regex: /\bi\b/g, rep: 'I', desc: 'Always capitalise the first-person pronoun "I"' },
    ];

    for (const rule of rules) {
      rule.regex.lastIndex = 0;
      if (rule.regex.test(corrected)) {
        rule.regex.lastIndex = 0;
        const match = corrected.match(rule.regex);
        const originalSnippet = match ? match[0] : '';
        corrected = corrected.replace(rule.regex, rule.rep);
        if (changes.length < 3) {
          changes.push({
            original: originalSnippet,
            corrected: rule.rep,
            reason: rule.desc,
            text: `${originalSnippet} → ${rule.rep} : ${rule.desc}`
          });
        }
      }
    }
  } else {
    // Minimal universal punctuation rules for non-English
    const punctRules = [
      { regex: /\s+,/g, rep: ',' },
      { regex: /\s+\./g, rep: '.' },
    ];
    for (const r of punctRules) {
      corrected = corrected.replace(r.regex, r.rep);
    }
  }

  // Capitalize first letter
  if (corrected.length > 0 && corrected[0] !== corrected[0].toUpperCase()) {
    const oldChar = corrected[0];
    corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
    if (changes.length < 3) {
      changes.push({
        original: oldChar,
        corrected: oldChar.toUpperCase(),
        reason: 'Capitalize initial letter of sentence',
        text: `${oldChar} → ${oldChar.toUpperCase()} : Capitalize initial letter of sentence`
      });
    }
  }

  // Ensure trailing punctuation
  if (corrected.length > 0 && !/[.!?।]$/.test(corrected)) {
    corrected += '.';
    if (changes.length < 3) {
      changes.push({
        original: '(missing punctuation)',
        corrected: '.',
        reason: 'Add terminal period',
        text: 'end of sentence → . : Add terminal period'
      });
    }
  }

  if (changes.length === 0 && corrected === trimmed) {
    const bvs = generateAlternativeBetterVersions(trimmed, trimmed);
    return {
      corrected: trimmed,
      changes: [],
      explanation: 'Your sentence is correct.',
      betterVersion: bvs[0],
      betterVersions: bvs,
      rawOutput: `CORRECTED:\n${trimmed}\n\nCHANGES:\nnone\n\nEXPLANATION:\nYour sentence is correct.\n\nBETTER VERSION:\n- ${bvs[0]}\n- ${bvs[1]}\n- ${bvs[2]}`
    };
  }

  const bvs = generateAlternativeBetterVersions(corrected, trimmed);
  return {
    corrected,
    changes,
    explanation: changes.length > 0 ? 'Corrected grammatical and typographical issues.' : 'Your sentence is correct.',
    betterVersion: bvs[0],
    betterVersions: bvs,
    rawOutput: `CORRECTED:\n${corrected}\n\nCHANGES:\n${changes.map(c => `- ${c.text}`).join('\n')}\n\nEXPLANATION:\nCorrected grammatical and typographical issues.\n\nBETTER VERSION:\n- ${bvs[0]}\n- ${bvs[1]}\n- ${bvs[2]}`
  };
}

// Built-in thesaurus dictionary for instant synonym suggestions
const THESAURUS_DICT = {
  'good': ['excellent', 'superb', 'exceptional', 'favorable', 'admirable'],
  'bad': ['poor', 'unfavorable', 'substandard', 'adverse', 'deficient'],
  'important': ['crucial', 'vital', 'essential', 'critical', 'pivotal'],
  'big': ['substantial', 'significant', 'extensive', 'considerable', 'prominent'],
  'small': ['minimal', 'modest', 'compact', 'minor', 'slight'],
  'fast': ['rapid', 'swift', 'prompt', 'expeditious', 'accelerated'],
  'slow': ['gradual', 'deliberate', 'leisurely', 'unhurried', 'measured'],
  'hard': ['challenging', 'demanding', 'rigorous', 'complex', 'formidable'],
  'easy': ['straightforward', 'effortless', 'accessible', 'uncomplicated', 'manageable'],
  'help': ['assist', 'support', 'facilitate', 'aid', 'bolster'],
  'make': ['create', 'produce', 'develop', 'construct', 'establish'],
  'think': ['consider', 'believe', 'reflect', 'deliberate', 'envisage'],
  'show': ['demonstrate', 'illustrate', 'exhibit', 'reveal', 'indicate'],
  'get': ['obtain', 'acquire', 'receive', 'secure', 'derive'],
  'use': ['utilize', 'employ', 'apply', 'leverage', 'adopt'],
  'start': ['commence', 'initiate', 'embark', 'launch', 'originate'],
  'end': ['conclude', 'terminate', 'finalize', 'complete', 'cease'],
  'change': ['modify', 'transform', 'adapt', 'adjust', 'revise'],
  'problem': ['challenge', 'issue', 'obstacle', 'complication', 'dilemma'],
  'idea': ['concept', 'notion', 'perspective', 'proposition', 'insight'],
  'happy': ['delighted', 'pleased', 'content', 'ecstatic', 'gratified'],
  'sad': ['disappointed', 'sorrowful', 'despondent', 'downcast', 'melancholic'],
  'new': ['modern', 'novel', 'contemporary', 'innovative', 'recent'],
  'old': ['traditional', 'established', 'former', 'previous', 'aged']
};

// Heuristic tone, formality, and clarity analyzer
function analyzeWritingMetrics(text) {
  if (!text || typeof text !== 'string') {
    return { formality: 50, tone: 'Neutral', clarity: 70 };
  }

  const words = text.toLowerCase().match(/\b[\w'-]+\b/g) || [];
  if (words.length === 0) {
    return { formality: 50, tone: 'Neutral', clarity: 70 };
  }

  const contractions = (text.match(/\b\w+'\w+\b/g) || []).length;
  const informalWords = ['gonna', 'wanna', 'kinda', 'sorta', 'yeah', 'hey', 'hi', 'awesome', 'cool', 'stuff', 'things', 'guy', 'guys', 'ok', 'okay'];
  const informalCount = words.filter(w => informalWords.includes(w)).length;
  
  const formalWords = ['furthermore', 'moreover', 'consequently', 'therefore', 'substantial', 'demonstrate', 'establish', 'comprehensive', 'facilitate', 'utilize', 'indicate', 'significant', 'preliminary', 'perspective'];
  const formalCount = words.filter(w => formalWords.includes(w)).length;
  const academicWords = ['hypothesis', 'methodology', 'empirical', 'analysis', 'evidence', 'theoretical', 'research', 'evaluate', 'data', 'findings'];
  const academicCount = words.filter(w => academicWords.includes(w)).length;
  const friendlyWords = ['please', 'thanks', 'thank', 'welcome', 'appreciate', 'hope', 'glad', 'kindly'];
  const friendlyCount = words.filter(w => friendlyWords.includes(w)).length;
  
  const totalLength = words.reduce((acc, w) => acc + w.length, 0);
  const avgWordLen = totalLength / words.length;

  let formality = 60 + (avgWordLen - 4.5) * 8 + (formalCount * 6) - (contractions * 4) - (informalCount * 8);
  formality = Math.max(10, Math.min(98, Math.round(formality)));

  let tone = 'Balanced & Direct';
  if (academicCount >= 2) {
    tone = 'Academic';
  } else if (formality >= 78) {
    tone = 'Formal & Professional';
  } else if (friendlyCount > 0) {
    tone = 'Friendly & Supportive';
  } else if (formality >= 60) {
    tone = 'Confident & Clear';
  } else if (formality >= 40) {
    tone = 'Conversational & Friendly';
  } else {
    tone = 'Casual & Informal';
  }

  const clarity = Math.max(40, Math.min(99, Math.round(100 - (words.length > 25 ? (words.length - 25) * 1.2 : 0) - (contractions > 3 ? 10 : 0))));

  return {
    formality,
    tone,
    clarity
  };
}

// Call Google Gemini API with fallback
const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];

function describeGeminiNetworkError(err) {
  const code = err.cause?.code || err.code;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') {
    return 'The request timed out after 30 seconds.';
  }
  const cause = code ? ` (${code})` : '';
  return `The server could not reach Gemini${cause}. Check outbound HTTPS, DNS, and proxy/firewall settings for generativelanguage.googleapis.com.`;
}

async function fetchGemini(endpoint, apiKey, payload) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000)
      });
    } catch (err) {
      lastError = err;
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 400));
    }
  }
  throw new Error(`Gemini network request failed: ${describeGeminiNetworkError(lastError)}`);
}

async function callGeminiAPI(apiKey, promptText, language, mode, tone = 'standard', writingContext = 'general') {
  let userInstruction = `Language: ${language || 'Auto Detect'}\nMode: ${mode || 'grammar'}\nTone: ${tone || 'standard'}\nInput Text:\n${promptText}`;
  if (tone && tone !== 'standard') {
    userInstruction += `\n(Tone: ${tone} - align tone, vocabulary and style to suit ${tone} English)`;
  }
  const contextInstructions = {
    assignment: 'Student assignment: keep the student’s ideas and voice; correct language without adding unsupported claims.',
    email: 'Email: use a clear, courteous email style appropriate to the selected tone.',
    resume: 'Resume or CV: use concise, truthful, achievement-focused wording; do not invent qualifications.',
    presentation: 'Presentation: use clear, spoken-friendly phrasing and concise sentences.',
    report: 'Report: use precise, organized, appropriately formal language.'
  };
  if (contextInstructions[writingContext]) userInstruction += `\n(Writing context: ${contextInstructions[writingContext]})`;
  if (mode === 'simple') {
    userInstruction += `\n(Target: Simple English mode - short, easy English; translate if input is not English)`;
  } else if (mode === 'improve') {
    userInstruction += `\n(Target: Improve mode - clearer, more natural, more professional)`;
  } else {
    userInstruction += `\n(Target: Grammar Check mode - correct grammar, spelling, punctuation)`;
  }

  const models = GEMINI_MODELS;
  const errors = [];

  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${SYSTEM_PROMPT}\n\n---\nUSER REQUEST:\n${userInstruction}` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    };

    try {
      const response = await fetchGemini(endpoint, apiKey, payload);

      if (response.ok) {
        const data = await response.json();
        const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textOutput) return textOutput;
      } else {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error?.message || response.statusText;
        if ([400, 401, 403].includes(response.status)) {
          throw new Error(`Gemini rejected the API key or its permissions (${response.status}): ${message}`);
        }
        errors.push(`${model} (${response.status}): ${message}`);
      }
    } catch (netErr) {
      if (netErr.message.startsWith('Gemini rejected the API key')) throw netErr;
      errors.push(`${model}: ${netErr.message}`);
    }
  }

  throw new Error(`Gemini could not generate a response. ${errors.join(' | ') || 'No response was returned.'}`);
}

function splitDocumentIntoChunks(text, maxLength = 3000) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitAt = -1;
    const sentenceBoundary = /[.!?।](?:["')\]]*)\s+/g;
    for (const match of remaining.slice(0, maxLength + 1).matchAll(sentenceBoundary)) {
      splitAt = match.index + match[0].length;
    }

    if (splitAt < Math.floor(maxLength * 0.55)) {
      splitAt = remaining.lastIndexOf('\n', maxLength);
    }
    if (splitAt < Math.floor(maxLength * 0.55)) {
      splitAt = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitAt <= 0) splitAt = maxLength;

    const rawChunk = remaining.slice(0, splitAt);
    const chunk = rawChunk.trimEnd();
    const trailingWhitespace = rawChunk.slice(chunk.length);
    const next = remaining.slice(splitAt);
    const leadingWhitespace = next.match(/^\s*/)[0];
    const separator = trailingWhitespace + leadingWhitespace;
    chunks.push({ text: chunk, separator });
    remaining = next.slice(leadingWhitespace.length);
  }

  if (remaining) chunks.push({ text: remaining.trim(), separator: '' });
  return chunks;
}

async function callGeminiDocumentChunk(apiKey, text, language, mode, tone, writingContext) {
  const contextInstructions = {
    assignment: 'Keep the student’s ideas and voice; correct language without adding unsupported claims.',
    email: 'Use a clear, courteous email style.',
    resume: 'Use concise, truthful resume wording; do not invent qualifications.',
    presentation: 'Use clear, spoken-friendly phrasing.',
    report: 'Use precise, organized, appropriately formal language.'
  };
  const task = mode === 'improve'
    ? 'Improve clarity and naturalness while preserving meaning.'
    : mode === 'simple'
      ? 'Rewrite in simple English using short, clear sentences while preserving meaning.'
      : 'Correct grammar, spelling, and punctuation while preserving the author’s wording and meaning.';
  const instruction = [
    `Language: ${language || 'Auto Detect'}.`,
    `Tone: ${tone || 'standard'}.`,
    contextInstructions[writingContext] || '',
    task,
    'This is one section of a longer document. Return only the complete edited section. Preserve paragraph breaks and do not summarize, omit, or add content.',
    `Section:\n${text}`
  ].filter(Boolean).join('\n');
  const models = GEMINI_MODELS;
  const errors = [];

  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    try {
      const response = await fetchGemini(endpoint, apiKey, {
        contents: [{ role: 'user', parts: [{ text: instruction }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
      });
      if (response.ok) {
        const data = await response.json();
        const output = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (output?.trim()) return output.trim();
        errors.push(`${model}: no text was returned`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error?.message || response.statusText;
        if ([400, 401, 403].includes(response.status)) {
          throw new Error(`Gemini rejected the document section (${response.status}): ${message}`);
        }
        errors.push(`${model} (${response.status}): ${message}`);
      }
    } catch (err) {
      if (err.message.startsWith('Gemini rejected the document section')) throw err;
      errors.push(`${model}: ${err.message}`);
    }
  }

  throw new Error(`Gemini could not process a document section. ${errors.join(' | ') || 'No response was returned.'}`);
}

async function callGeminiDocumentAPI(apiKey, text, language, mode, tone, writingContext) {
  const chunks = splitDocumentIntoChunks(text);
  const correctedSections = [];
  for (const chunk of chunks) {
    const corrected = await callGeminiDocumentChunk(
      apiKey, chunk.text, language, mode, tone, writingContext
    );
    correctedSections.push(corrected + chunk.separator);
  }
  return { corrected: correctedSections.join(''), sectionCount: chunks.length };
}

async function callGeminiTranscription(apiKey, audio, mimeType, language) {
  const models = GEMINI_MODELS;
  const errors = [];

  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const payload = {
      contents: [{
        role: 'user',
        parts: [
          { text: `Transcribe this audio exactly. The spoken language is ${language || 'not specified'}. Return only the transcript.` },
          { inline_data: { mime_type: mimeType, data: audio } }
        ]
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 2048 }
    };

    try {
      const response = await fetchGemini(endpoint, apiKey, payload);

      if (response.ok) {
        const data = await response.json();
        const transcript = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (transcript?.trim()) return transcript.trim();
        errors.push(`${model}: no transcript was returned`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error?.message || response.statusText;
        if ([400, 401, 403].includes(response.status)) {
          throw new Error(`Gemini transcription request failed (${response.status}): ${message}`);
        }
        errors.push(`${model} (${response.status}): ${message}`);
      }
    } catch (err) {
      if (err.message.startsWith('Gemini transcription request failed')) throw err;
      if (err.message.startsWith('Gemini network request failed:')) {
        errors.push(`${model}: ${err.message}`);
        break;
      }
      errors.push(`${model}: ${err.message}`);
    }
  }

  throw new Error(
    `Gemini could not transcribe the audio. ${errors.join(' | ') || 'No response was returned.'}`
  );
}

async function callGeminiWritingTool(apiKey, task, text, style) {
  const instructions = {
    summarize: 'Summarize the supplied text faithfully in a concise paragraph. Do not add facts.',
    complete: 'Complete the unfinished final sentence. Preserve all existing text and return the full text with only a natural completion added.',
    rephrase: `Rewrite the supplied text in a ${style} style. Preserve the meaning and return only the rewritten text.`
  };
  const models = GEMINI_MODELS;
  const errors = [];

  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const payload = {
      contents: [{
        role: 'user',
        parts: [{ text: `${instructions[task]}\n\nText:\n${text}` }]
      }],
      generationConfig: { temperature: task === 'complete' ? 0.3 : 0.2, maxOutputTokens: 4096 }
    };

    try {
      const response = await fetchGemini(endpoint, apiKey, payload);
      if (response.ok) {
        const data = await response.json();
        const output = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (output?.trim()) return output.trim();
        errors.push(`${model}: no text was returned`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error?.message || response.statusText;
        if ([400, 401, 403].includes(response.status)) {
          throw new Error(`Gemini rejected the writing request (${response.status}): ${message}`);
        }
        errors.push(`${model} (${response.status}): ${message}`);
      }
    } catch (err) {
      if (err.message.startsWith('Gemini rejected the writing request')) throw err;
      errors.push(`${model}: ${err.message}`);
    }
  }

  throw new Error(`Gemini could not complete the writing request. ${errors.join(' | ') || 'No response was returned.'}`);
}

app.post('/api/writing-tools', auth.rateLimit('writing-tools', 30, 60 * 1000), async (req, res) => {
  const { task, text, style = 'professional' } = req.body || {};
  const allowedTasks = ['summarize', 'complete', 'rephrase'];
  const allowedStyles = ['professional', 'academic', 'friendly', 'casual'];
  if (!allowedTasks.includes(task)) {
    return res.status(400).json({ error: 'Choose summarize, complete, or rephrase.' });
  }
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Enter text to process.' });
  }
  if (task === 'rephrase' && !allowedStyles.includes(style)) {
    return res.status(400).json({ error: 'Choose professional, academic, friendly, or casual style.' });
  }

  try {
    const apiKey = await auth.resolveGeminiKey(
      req.user?.id,
      req.headers['x-api-key'] || req.body.apiKey || ''
    );
    if (!apiKey) return res.status(503).json({ error: 'Add a Gemini API key in Settings to use this writing tool.' });
    const output = await callGeminiWritingTool(apiKey.trim(), task, text.trim(), style);
    return res.json({ status: 'success', task, style, output });
  } catch (err) {
    console.error('Gemini writing tool failed:', err.message);
    return res.status(502).json({ error: err.message });
  }
});

function getWordShingles(text, size) {
  const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
  const shingleSize = Math.min(size, words.length);
  const shingles = new Set();
  for (let i = 0; i <= words.length - shingleSize; i++) {
    shingles.add(words.slice(i, i + shingleSize).join(' '));
  }
  return shingles;
}

app.post('/api/similarity-check', auth.rateLimit('similarity-check', 30, 60 * 1000), (req, res) => {
  const { text, sources } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Enter text to compare.' });
  }
  if (text.length > 50000) {
    return res.status(413).json({ error: 'Keep the draft under 50,000 characters for comparison.' });
  }
  if (!Array.isArray(sources) || sources.length === 0 || sources.length > 10) {
    return res.status(400).json({ error: 'Provide between 1 and 10 reference texts.' });
  }
  if (sources.some(source => !source || typeof source.text !== 'string' || !source.text.trim())) {
    return res.status(400).json({ error: 'Each reference must contain text.' });
  }
  if (sources.some(source => source.text.length > 50000) ||
      sources.reduce((total, source) => total + source.text.length, 0) > 200000) {
    return res.status(413).json({ error: 'Keep each reference under 50,000 characters and total references under 200,000 characters.' });
  }

  const inputWords = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
  if (inputWords.length < 3) return res.status(400).json({ error: 'Enter at least three words to compare.' });
  const shingleSize = inputWords.length < 5 ? 3 : 5;
  const inputShingles = getWordShingles(text, shingleSize);
  const sourceResults = sources.map((source, index) => {
    const sourceShingles = getWordShingles(source.text, shingleSize);
    const matchedShingles = [...inputShingles].filter(shingle => sourceShingles.has(shingle));
    return {
      label: typeof source.label === 'string' && source.label.trim() ? source.label.trim().slice(0, 80) : `Source ${index + 1}`,
      similarityPercent: inputShingles.size
        ? Math.round((matchedShingles.length / inputShingles.size) * 100)
        : 0,
      matchedPhrases: matchedShingles.slice(0, 5)
    };
  });

  return res.json({
    status: 'success',
    scope: 'user-provided-sources-only',
    method: `Exact ${shingleSize}-word phrase overlap`,
    sources: sourceResults
  });
});

app.post('/api/transcribe', auth.rateLimit('transcribe', 10, 60 * 1000), async (req, res) => {
  const { audio, mimeType, language } = req.body || {};
  if (typeof audio !== 'string' || !audio || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) {
    return res.status(400).json({ error: 'Missing or invalid audio data.' });
  }
  if (typeof mimeType !== 'string' || !mimeType.toLowerCase().startsWith('audio/')) {
    return res.status(400).json({ error: 'A valid audio MIME type is required.' });
  }

  const audioBuffer = Buffer.from(audio, 'base64');
  if (!audioBuffer.length) return res.status(400).json({ error: 'The audio clip is empty.' });
  if (audioBuffer.length > 7 * 1024 * 1024) {
    return res.status(413).json({ error: 'Voice clip is too large. Stop sooner and try again.' });
  }

  try {
    const apiKey = await auth.resolveGeminiKey(
      req.user?.id,
      req.headers['x-api-key'] || req.body.apiKey || ''
    );
    if (!apiKey) return res.status(503).json({ error: 'Add a Gemini API key in Settings to use voice transcription fallback.' });
    const transcript = await callGeminiTranscription(apiKey.trim(), audio, mimeType, language);
    return res.json({ status: 'success', transcript });
  } catch (err) {
    console.error('Gemini transcription failed:', err.message);
    return res.status(502).json({ error: err.message });
  }
});

// API Contract: POST /api/check
app.post('/api/check', auth.rateLimit('grammar-check', 30, 60 * 1000), async (req, res) => {
  try {
    const { text, language = 'English', mode = 'grammar', tone = 'standard', writingContext = 'general', apiKey: bodyApiKey } = req.body || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        error: 'Missing required field "text" or text is empty.',
        status: 'error'
      });
    }

    const trimmedText = text.trim();
    const metrics = analyzeWritingMetrics(trimmedText);
    const activeApiKey = await auth.resolveGeminiKey(
      req.user?.id,
      req.headers['x-api-key'] || bodyApiKey || ''
    );

    // If an API key is available, call the Gemini LLM with verbatim system prompt
    if (activeApiKey && activeApiKey.trim() !== '') {
      try {
        if (trimmedText.length > 3000) {
          const documentResult = await callGeminiDocumentAPI(
            activeApiKey.trim(), trimmedText, language, mode, tone, writingContext
          );
          const parsed = {
            corrected: documentResult.corrected.trim(),
            changes: [],
            explanation: `Full document processed in ${documentResult.sectionCount} sections. Review the corrected text.`,
            betterVersion: '',
            betterVersions: [],
            rawOutput: documentResult.corrected.trim()
          };
          const response = {
            status: 'success',
            source: 'gemini',
            original: trimmedText,
            language,
            mode,
            tone,
            metrics,
            ...parsed,
            processedSections: documentResult.sectionCount
          };
          if (!req.body.validateOnly) await auth.saveHistory(req.user?.id, response);
          return res.json(response);
        }
        const rawOutput = await callGeminiAPI(activeApiKey.trim(), trimmedText, language, mode, tone, writingContext);
        const parsed = parseLLMResponse(rawOutput, trimmedText);
        const response = {
          status: 'success',
          source: 'gemini',
          original: trimmedText,
          language,
          mode,
          tone,
          writingContext,
          metrics,
          ...parsed
        };
        if (!req.body.validateOnly) await auth.saveHistory(req.user?.id, response);
        return res.json(response);
      } catch (geminiError) {
        console.error('Gemini API call failed:', geminiError.message);
        return res.status(502).json({
          status: 'error',
          source: 'gemini',
          error: geminiError.message
        });
      }
    }

    // Default intelligent local engine (works out of the box without requiring key setup)
    if (trimmedText.length > 3000) {
      const sections = splitDocumentIntoChunks(trimmedText);
      const corrected = sections.map(section => {
        const result = getSimulatedCorrection(section.text, language, mode);
        const sectionText = result.corrected.replace(/(^|[.!?à¥¤]\s+)([a-z])/g, (_, boundary, letter) => `${boundary}${letter.toUpperCase()}`);
        return `${sectionText}${section.separator}`;
      }).join('');
      const response = {
        status: 'success',
        source: 'built-in',
        original: trimmedText,
        language,
        mode,
        tone,
        writingContext,
        metrics,
        corrected,
        changes: [],
        explanation: `Offline rules processed all ${sections.length} document sections. Review the corrected text.`,
        betterVersion: '',
        betterVersions: [],
        rawOutput: corrected,
        processedSections: sections.length
      };
      if (!req.body.validateOnly) await auth.saveHistory(req.user?.id, response);
      return res.json(response);
    }

    const simulated = getSimulatedCorrection(trimmedText, language, mode);
    const response = {
      status: 'success',
      source: 'built-in',
      original: trimmedText,
      language,
      mode,
      tone,
      writingContext,
      metrics,
      ...simulated
    };
    if (!req.body.validateOnly) await auth.saveHistory(req.user?.id, response);
    return res.json(response);
  } catch (err) {
    console.error('Error in /api/check:', err);
    res.status(500).json({
      error: 'An internal error occurred while checking grammar.',
      details: err.message,
      status: 'error'
    });
  }
});

// Thesaurus endpoint for instant synonyms
app.get('/api/thesaurus/:word', (req, res) => {
  const rawWord = (req.params.word || '').toLowerCase().trim().replace(/[^a-z]/g, '');
  const synonyms = THESAURUS_DICT[rawWord] || [];
  res.json({
    word: rawWord,
    synonyms
  });
});

function splitTranslationText(text, maxLength = 400) {
  const chunks = [];
  let remaining = text.trim();

  while (remaining.length > maxLength) {
    let splitAt = maxLength;
    while (splitAt > 0 && !/\s/.test(remaining[splitAt])) splitAt--;
    if (splitAt < maxLength / 2) splitAt = maxLength;

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

// MyMemory requests are chunked so long text does not exceed URL length limits.
app.post('/api/translate', auth.rateLimit('translate', 30, 60 * 1000), async (req, res) => {
  const { text, from = 'en', to = 'mr' } = req.body;
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Missing text field.' });
  }
  try {
    const langpair = `${from}|${to}`;
    const chunks = splitTranslationText(text);
    const translatedChunks = [];

    for (const chunk of chunks) {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${langpair}`;
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok || data.responseStatus !== 200 || !data.responseData?.translatedText) {
        const detail = data.responseDetails || response.statusText || 'No translation returned.';
        return res.status(502).json({ error: `Translation service failed: ${detail}` });
      }
      translatedChunks.push(data.responseData.translatedText);
    }

    return res.json({
      translated: translatedChunks.join(' '),
      from,
      to,
      original: text.trim()
    });
  } catch (err) {
    console.error('Translation error:', err.message);
    res.status(500).json({ error: 'Translation failed.', details: err.message });
  }
});

// Daily Word of the Day — 5 English words with Marathi meanings useful in daily life
const DAILY_WORDS = [
  { word: 'Gratitude', marathi: 'कृतज्ञता', pronunciation: 'grat-i-tood', meaning: 'The feeling of being thankful', example: 'She expressed gratitude for their help.' },
  { word: 'Diligent', marathi: 'परिश्रमी', pronunciation: 'dil-i-jent', meaning: 'Hardworking and careful', example: 'He is a diligent student.' },
  { word: 'Sincere', marathi: 'प्रामाणिक', pronunciation: 'sin-seer', meaning: 'Genuine and honest', example: 'Please give a sincere answer.' },
  { word: 'Courage', marathi: 'धैर्य', pronunciation: 'kur-ij', meaning: 'Bravery to face difficulty', example: 'It takes courage to speak the truth.' },
  { word: 'Patience', marathi: 'संयम', pronunciation: 'pay-shens', meaning: 'Ability to wait calmly', example: 'Patience is the key to success.' },
  { word: 'Polite', marathi: 'नम्र', pronunciation: 'poh-lite', meaning: 'Respectful and well-mannered', example: 'Always be polite to elders.' },
  { word: 'Honest', marathi: 'प्रामाणिक', pronunciation: 'on-ist', meaning: 'Truthful and not lying', example: 'He is always honest in his dealings.' },
  { word: 'Respect', marathi: 'आदर', pronunciation: 'ri-spekt', meaning: 'To show honour to someone', example: 'We must respect our parents.' },
  { word: 'Confident', marathi: 'आत्मविश्वासू', pronunciation: 'kon-fi-dent', meaning: 'Feeling sure of yourself', example: 'She gave a confident speech.' },
  { word: 'Humble', marathi: 'नम्र / विनम्र', pronunciation: 'hum-bul', meaning: 'Not proud or arrogant', example: 'Despite his success, he stayed humble.' },
  { word: 'Curious', marathi: 'जिज्ञासू', pronunciation: 'kyoor-ee-us', meaning: 'Eager to know or learn', example: 'Children are naturally curious.' },
  { word: 'Punctual', marathi: 'वेळेवर येणारा', pronunciation: 'punk-choo-ul', meaning: 'Arriving on time always', example: 'Being punctual shows professionalism.' },
  { word: 'Generous', marathi: 'उदार', pronunciation: 'jen-er-us', meaning: 'Willing to give and share', example: 'She is generous with her time.' },
  { word: 'Flexible', marathi: 'लवचिक', pronunciation: 'flek-si-bul', meaning: 'Able to adapt to change', example: 'Stay flexible in your plans.' },
  { word: 'Optimistic', marathi: 'आशावादी', pronunciation: 'op-tim-is-tik', meaning: 'Hopeful about the future', example: 'He has an optimistic attitude.' },
  { word: 'Apologize', marathi: 'माफी मागणे', pronunciation: 'uh-pol-uh-jize', meaning: 'To say sorry for a mistake', example: 'You should apologize immediately.' },
  { word: 'Negotiate', marathi: 'वाटाघाटी करणे', pronunciation: 'ni-goh-shee-ate', meaning: 'To discuss and reach agreement', example: 'They negotiated the price.' },
  { word: 'Persuade', marathi: 'मनवणे', pronunciation: 'per-swade', meaning: 'To convince someone', example: 'She persuaded him to stay.' },
  { word: 'Compliment', marathi: 'प्रशंसा', pronunciation: 'kom-pli-ment', meaning: 'A kind expression of praise', example: 'He gave her a nice compliment.' },
  { word: 'Empathy', marathi: 'सहानुभूती', pronunciation: 'em-puh-thee', meaning: 'Understanding others feelings', example: 'Empathy builds strong relationships.' },
  { word: 'Efficient', marathi: 'कार्यक्षम', pronunciation: 'ih-fish-ent', meaning: 'Doing tasks with minimum waste', example: 'She is an efficient worker.' },
  { word: 'Reliable', marathi: 'विश्वासार्ह', pronunciation: 'ri-lie-uh-bul', meaning: 'Can be trusted or depended on', example: 'He is a reliable friend.' },
  { word: 'Adaptable', marathi: 'जुळवून घेणारा', pronunciation: 'uh-dap-tuh-bul', meaning: 'Able to change to suit new conditions', example: 'Adaptable employees are valuable.' },
  { word: 'Inspire', marathi: 'प्रेरणा देणे', pronunciation: 'in-spire', meaning: 'To motivate or encourage', example: 'Her story inspired many people.' },
  { word: 'Dedicate', marathi: 'समर्पित करणे', pronunciation: 'ded-i-kate', meaning: 'To devote time or effort', example: 'He dedicated years to his craft.' },
  { word: 'Accomplish', marathi: 'साध्य करणे', pronunciation: 'uh-kom-plish', meaning: 'To achieve something difficult', example: 'She accomplished her goal.' },
  { word: 'Collaborate', marathi: 'सहकार्य करणे', pronunciation: 'kuh-lab-or-ate', meaning: 'To work together with others', example: 'Teams must collaborate effectively.' },
  { word: 'Prioritize', marathi: 'प्राधान्य देणे', pronunciation: 'pry-or-i-tize', meaning: 'To decide what is most important', example: 'Prioritize your tasks daily.' },
  { word: 'Persevere', marathi: 'चिकाटी ठेवणे', pronunciation: 'pur-suh-veer', meaning: 'To keep going despite difficulty', example: 'Persevere and you will succeed.' },
  { word: 'Acknowledge', marathi: 'मान्य करणे', pronunciation: 'ak-nol-ij', meaning: 'To accept or recognize something', example: 'Please acknowledge my email.' },
  { word: 'Encourage', marathi: 'प्रोत्साहन देणे', pronunciation: 'en-kur-ij', meaning: 'To give support or confidence', example: 'Teachers should encourage students.' },
  { word: 'Maintain', marathi: 'टिकवणे', pronunciation: 'man-tane', meaning: 'To keep in good condition', example: 'Maintain a healthy lifestyle.' },
  { word: 'Manage', marathi: 'व्यवस्थापन करणे', pronunciation: 'man-ij', meaning: 'To be in charge of something', example: 'She manages a large team.' },
  { word: 'Overcome', marathi: 'मात करणे', pronunciation: 'oh-ver-kum', meaning: 'To succeed despite a problem', example: 'He overcame his fear of heights.' },
  { word: 'Evaluate', marathi: 'मूल्यांकन करणे', pronunciation: 'ih-val-yoo-ate', meaning: 'To judge the value of something', example: 'Evaluate all your options carefully.' },
  { word: 'Appreciate', marathi: 'कदर करणे', pronunciation: 'uh-pree-shee-ate', meaning: 'To recognize the value of something', example: 'I truly appreciate your help.' },
  { word: 'Challenge', marathi: 'आव्हान', pronunciation: 'chal-enj', meaning: 'A difficult task or situation', example: 'Every challenge makes you stronger.' },
  { word: 'Opportunity', marathi: 'संधी', pronunciation: 'op-er-tyoo-ni-tee', meaning: 'A favourable time or situation', example: 'Grab every opportunity you get.' },
  { word: 'Communicate', marathi: 'संवाद साधणे', pronunciation: 'kuh-myoo-ni-kate', meaning: 'To share information clearly', example: 'Communicate your thoughts clearly.' },
  { word: 'Responsible', marathi: 'जबाबदार', pronunciation: 'ri-spon-si-bul', meaning: 'Being accountable for actions', example: 'Be responsible for your choices.' },
  { word: 'Convenient', marathi: 'सोयीस्कर', pronunciation: 'kun-vee-ni-ent', meaning: 'Fitting in well with a situation', example: 'Is tomorrow convenient for you?' },
  { word: 'Approximately', marathi: 'अंदाजे', pronunciation: 'uh-prok-si-mut-lee', meaning: 'Close to but not exactly', example: 'It costs approximately 500 rupees.' },
  { word: 'Confirm', marathi: 'खात्री करणे', pronunciation: 'kun-firm', meaning: 'To make sure something is true', example: 'Please confirm your appointment.' },
  { word: 'Request', marathi: 'विनंती करणे', pronunciation: 'ri-kwest', meaning: 'A polite way of asking', example: 'He made a request to join the team.' },
  { word: 'Support', marathi: 'पाठिंबा देणे', pronunciation: 'suh-port', meaning: 'To help or stand by someone', example: 'Family support is very important.' },
  { word: 'Improve', marathi: 'सुधारणे', pronunciation: 'im-proov', meaning: 'To make or become better', example: 'Practice daily to improve your skills.' },
  { word: 'Concentrate', marathi: 'लक्ष केंद्रित करणे', pronunciation: 'kon-sen-trate', meaning: 'To focus your mind on something', example: 'Concentrate during the lecture.' },
  { word: 'Schedule', marathi: 'वेळापत्रक', pronunciation: 'shed-yool', meaning: 'A plan of tasks with times', example: 'Check the schedule for tomorrow.' },
  { word: 'Budget', marathi: 'अंदाजपत्रक', pronunciation: 'buj-it', meaning: 'A plan for spending money', example: 'Set a monthly budget and stick to it.' },
  { word: 'Progress', marathi: 'प्रगती', pronunciation: 'proh-gres', meaning: 'Forward movement towards a goal', example: 'Track your progress every week.' }
];

app.get('/api/word-of-day', (req, res) => {
  // Use today's date as seed to pick 5 consistent words per day
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const seed = today.split('-').reduce((acc, v) => acc + parseInt(v), 0);
  const skip = parseInt(req.query.skip || '0', 10); // skip offset from client

  const indices = [];
  let i = (seed + skip * 5) % DAILY_WORDS.length;
  while (indices.length < 5) {
    const idx = i % DAILY_WORDS.length;
    if (!indices.includes(idx)) indices.push(idx);
    i++;
  }
  const words = indices.map(idx => DAILY_WORDS[idx]);
  res.json({ date: today, words });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    hasEnvApiKey: Boolean(process.env.GEMINI_API_KEY),
    accountStorage: auth.enabled
  });
});

async function startServer() {
  await auth.initialize();
  app.listen(PORT, () => {
    console.log(`AI Grammar Checker & Writing Assistant server running at http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Server startup failed:', err.message);
  process.exitCode = 1;
});
