import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// ===================== SHARED: Claude API helper =====================
async function callClaude(messages, system, maxTokens = 1200) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, system, messages }),
    });
    const data = await response.json();
    if (data.content && data.content[0] && data.content[0].text) return data.content[0].text;
    throw new Error('empty response');
  } catch (e) {
    console.error('Claude API error:', e);
    return null;
  }
}

function extractJSON(text) {
  if (!text) return null;
  let clean = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
  try { return JSON.parse(clean); } catch (e) {
    const match = clean.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) { try { return JSON.parse(match[0]); } catch (e2) { return null; } }
    return null;
  }
}


// ============ FROM data.js ============

// ===================== STATIC CONTENT DATABASE =====================
// Genders: 'm' (der), 'f' (die), 'n' (das), 'pl' (plural-only / no singular article needed)

const GENDER_META = {
  m: { article: 'der', color: '#3B6FA0', label: 'der' },
  f: { article: 'die', color: '#B5533C', label: 'die' },
  n: { article: 'das', color: '#5B8C5A', label: 'das' },
  pl: { article: 'die (Pl.)', color: '#8A6BAE', label: 'die (Pl.)' },
};

const VOCAB_CATEGORIES = [
  {
    id: 'shopping', name: 'Einkaufen', nameEn: 'Shopping',
    words: [
      { de: 'Geschäft', gender: 'n', plural: 'Geschäfte', en: 'shop, store', example: 'Das Geschäft öffnet um neun Uhr.', exampleEn: 'The shop opens at nine.', synonyms: ['Laden'], opposites: [], collocations: ['ein Geschäft eröffnen', 'im Geschäft einkaufen'] },
      { de: 'Preis', gender: 'm', plural: 'Preise', en: 'price', example: 'Der Preis ist sehr hoch.', exampleEn: 'The price is very high.', synonyms: ['Kosten'], opposites: [], collocations: ['der Preis steigt', 'im Preis enthalten'] },
      { de: 'Rechnung', gender: 'f', plural: 'Rechnungen', en: 'bill, invoice', example: 'Kann ich die Rechnung bekommen?', exampleEn: 'Can I get the bill?', synonyms: ['Beleg'], opposites: [], collocations: ['die Rechnung bezahlen'] },
      { de: 'Kasse', gender: 'f', plural: 'Kassen', en: 'checkout, cash register', example: 'Bitte zahlen Sie an der Kasse.', exampleEn: 'Please pay at the checkout.', synonyms: [], opposites: [], collocations: ['an der Kasse bezahlen'] },
      { de: 'Angebot', gender: 'n', plural: 'Angebote', en: 'offer, deal', example: 'Das ist ein gutes Angebot.', exampleEn: 'That is a good offer.', synonyms: ['Aktion'], opposites: [], collocations: ['im Angebot'] },
      { de: 'Kunde', gender: 'm', plural: 'Kunden', en: 'customer (male)', example: 'Der Kunde wartet an der Kasse.', exampleEn: 'The customer is waiting at the checkout.', synonyms: [], opposites: [], collocations: ['Kundenservice'] },
      { de: 'Quittung', gender: 'f', plural: 'Quittungen', en: 'receipt', example: 'Brauchen Sie eine Quittung?', exampleEn: 'Do you need a receipt?', synonyms: [], opposites: [], collocations: [] },
      { de: 'umtauschen', gender: null, plural: null, en: 'to exchange (goods)', example: 'Ich möchte die Jacke umtauschen.', exampleEn: 'I would like to exchange the jacket.', synonyms: [], opposites: [], collocations: ['Ware umtauschen'], isVerb: true },
    ],
  },
  {
    id: 'food', name: 'Essen', nameEn: 'Food',
    words: [
      { de: 'Brot', gender: 'n', plural: 'Brote', en: 'bread', example: 'Ich kaufe frisches Brot.', exampleEn: 'I buy fresh bread.', synonyms: [], opposites: [], collocations: ['Brot backen'] },
      { de: 'Milch', gender: 'f', plural: null, en: 'milk', example: 'Die Milch ist im Kühlschrank.', exampleEn: 'The milk is in the fridge.', synonyms: [], opposites: [], collocations: [] },
      { de: 'Gemüse', gender: 'n', plural: null, en: 'vegetables', example: 'Ich esse viel Gemüse.', exampleEn: 'I eat a lot of vegetables.', synonyms: [], opposites: ['Obst'], collocations: ['frisches Gemüse'] },
      { de: 'Rezept', gender: 'n', plural: 'Rezepte', en: 'recipe', example: 'Hast du ein gutes Rezept?', exampleEn: 'Do you have a good recipe?', synonyms: [], opposites: [], collocations: [] },
      { de: 'Mahlzeit', gender: 'f', plural: 'Mahlzeiten', en: 'meal', example: 'Drei Mahlzeiten am Tag sind gesund.', exampleEn: 'Three meals a day are healthy.', synonyms: [], opposites: [], collocations: [] },
      { de: 'satt', gender: null, plural: null, en: 'full (not hungry)', example: 'Ich bin satt, danke.', exampleEn: 'I am full, thanks.', synonyms: [], opposites: ['hungrig'], collocations: [] },
    ],
  },
  {
    id: 'family', name: 'Familie', nameEn: 'Family',
    words: [
      { de: 'Geschwister', gender: 'pl', plural: 'Geschwister', en: 'siblings', example: 'Ich habe zwei Geschwister.', exampleEn: 'I have two siblings.', synonyms: [], opposites: [], collocations: [] },
      { de: 'Enkelkind', gender: 'n', plural: 'Enkelkinder', en: 'grandchild', example: 'Die Großmutter liebt ihr Enkelkind.', exampleEn: 'The grandmother loves her grandchild.', synonyms: [], opposites: [], collocations: [] },
      { de: 'Ehepaar', gender: 'n', plural: 'Ehepaare', en: 'married couple', example: 'Das Ehepaar wohnt nebenan.', exampleEn: 'The married couple lives next door.', synonyms: [], opposites: [], collocations: [] },
      { de: 'Verwandte', gender: 'pl', plural: 'Verwandte', en: 'relatives', example: 'Meine Verwandten kommen zu Besuch.', exampleEn: 'My relatives are coming to visit.', synonyms: [], opposites: [], collocations: [] },
    ],
  },
  {
    id: 'work', name: 'Arbeit', nameEn: 'Work',
    words: [
      { de: 'Bewerbung', gender: 'f', plural: 'Bewerbungen', en: 'job application', example: 'Ich habe meine Bewerbung abgeschickt.', exampleEn: 'I sent my job application.', synonyms: [], opposites: [], collocations: ['eine Bewerbung schreiben'] },
      { de: 'Vorstellungsgespräch', gender: 'n', plural: 'Vorstellungsgespräche', en: 'job interview', example: 'Das Vorstellungsgespräch ist am Montag.', exampleEn: 'The job interview is on Monday.', synonyms: [], opposites: [], collocations: [] },
      { de: 'Kollege', gender: 'm', plural: 'Kollegen', en: 'colleague (male)', example: 'Mein Kollege hilft mir gern.', exampleEn: 'My colleague likes to help me.', synonyms: [], opposites: [], collocations: [] },
      { de: 'Gehalt', gender: 'n', plural: 'Gehälter', en: 'salary', example: 'Das Gehalt wird monatlich bezahlt.', exampleEn: 'The salary is paid monthly.', synonyms: ['Lohn'], opposites: [], collocations: [] },
      { de: 'Kündigung', gender: 'f', plural: 'Kündigungen', en: 'notice of termination', example: 'Er hat die Kündigung bekommen.', exampleEn: 'He received the notice of termination.', synonyms: [], opposites: [], collocations: [] },
    ],
  },
  {
    id: 'housing', name: 'Wohnen', nameEn: 'Housing',
    words: [
      { de: 'Miete', gender: 'f', plural: 'Mieten', en: 'rent', example: 'Die Miete ist diesen Monat gestiegen.', exampleEn: 'The rent has gone up this month.', synonyms: [], opposites: [], collocations: ['Miete zahlen'] },
      { de: 'Vermieter', gender: 'm', plural: 'Vermieter', en: 'landlord', example: 'Der Vermieter repariert die Heizung.', exampleEn: 'The landlord is fixing the heating.', synonyms: [], opposites: ['Mieter'], collocations: [] },
      { de: 'Umzug', gender: 'm', plural: 'Umzüge', en: 'move (relocation)', example: 'Der Umzug war sehr stressig.', exampleEn: 'The move was very stressful.', synonyms: [], opposites: [], collocations: [] },
      { de: 'Nebenkosten', gender: 'pl', plural: 'Nebenkosten', en: 'utility costs', example: 'Die Nebenkosten sind im Mietpreis enthalten.', exampleEn: 'Utility costs are included in the rent.', synonyms: [], opposites: [], collocations: [] },
    ],
  },
  {
    id: 'health', name: 'Gesundheit', nameEn: 'Health',
    words: [
      { de: 'Termin', gender: 'm', plural: 'Termine', en: 'appointment', example: 'Ich habe einen Termin beim Arzt.', exampleEn: 'I have a doctor\'s appointment.', synonyms: [], opposites: [], collocations: ['einen Termin vereinbaren'] },
      { de: 'Krankenkasse', gender: 'f', plural: 'Krankenkassen', en: 'health insurance fund', example: 'Welcher Krankenkasse sind Sie versichert?', exampleEn: 'Which health insurance fund are you with?', synonyms: [], opposites: [], collocations: [] },
      { de: 'Rezept', gender: 'n', plural: 'Rezepte', en: 'prescription', example: 'Der Arzt schreibt ein Rezept.', exampleEn: 'The doctor writes a prescription.', synonyms: [], opposites: [], collocations: [] },
      { de: 'Schmerz', gender: 'm', plural: 'Schmerzen', en: 'pain', example: 'Ich habe Schmerzen im Rücken.', exampleEn: 'I have pain in my back.', synonyms: [], opposites: [], collocations: [] },
    ],
  },
  {
    id: 'environment', name: 'Umwelt', nameEn: 'Environment',
    words: [
      { de: 'Mülltrennung', gender: 'f', plural: null, en: 'waste separation', example: 'Mülltrennung ist in Deutschland wichtig.', exampleEn: 'Waste separation is important in Germany.', synonyms: [], opposites: [], collocations: [] },
      { de: 'Umweltschutz', gender: 'm', plural: null, en: 'environmental protection', example: 'Umweltschutz beginnt im Alltag.', exampleEn: 'Environmental protection starts in daily life.', synonyms: [], opposites: [], collocations: [] },
      { de: 'erneuerbar', gender: null, plural: null, en: 'renewable', example: 'Erneuerbare Energie wird immer wichtiger.', exampleEn: 'Renewable energy is becoming more important.', synonyms: [], opposites: [], collocations: ['erneuerbare Energie'] },
    ],
  },
  {
    id: 'banking', name: 'Bank', nameEn: 'Banking',
    words: [
      { de: 'Konto', gender: 'n', plural: 'Konten', en: 'account', example: 'Ich eröffne ein neues Konto.', exampleEn: 'I am opening a new account.', synonyms: [], opposites: [], collocations: ['Konto eröffnen'] },
      { de: 'Überweisung', gender: 'f', plural: 'Überweisungen', en: 'bank transfer', example: 'Die Überweisung dauert zwei Tage.', exampleEn: 'The bank transfer takes two days.', synonyms: [], opposites: [], collocations: [] },
      { de: 'Gebühr', gender: 'f', plural: 'Gebühren', en: 'fee', example: 'Die Bank verlangt eine Gebühr.', exampleEn: 'The bank charges a fee.', synonyms: [], opposites: [], collocations: [] },
    ],
  },
];

const VERB_CATEGORIES = [
  {
    id: 'regular', name: 'Regelmäßige Verben', nameEn: 'Regular Verbs',
    verbs: [
      { inf: 'arbeiten', en: 'to work', type: 'regular',
        present: { ich: 'arbeite', du: 'arbeitest', er: 'arbeitet', wir: 'arbeiten', ihr: 'arbeitet', sie: 'arbeiten' },
        perfekt: 'hat gearbeitet', praeteritum: 'arbeitete',
        example: 'Ich arbeite jeden Tag bis 17 Uhr.', commonMistake: 'Don\'t forget the extra "e" in "du arbeitest" — stems ending in -t add an extra e.' },
      { inf: 'wohnen', en: 'to live (reside)', type: 'regular',
        present: { ich: 'wohne', du: 'wohnst', er: 'wohnt', wir: 'wohnen', ihr: 'wohnt', sie: 'wohnen' },
        perfekt: 'hat gewohnt', praeteritum: 'wohnte',
        example: 'Wir wohnen seit drei Jahren hier.', commonMistake: 'Learners often confuse "wohnen" (reside) with "leben" (be alive/live life).' },
      { inf: 'kaufen', en: 'to buy', type: 'regular',
        present: { ich: 'kaufe', du: 'kaufst', er: 'kauft', wir: 'kaufen', ihr: 'kauft', sie: 'kaufen' },
        perfekt: 'hat gekauft', praeteritum: 'kaufte',
        example: 'Sie kauft frisches Obst.', commonMistake: 'The Perfekt uses "hat", not "ist" — kaufen is not a motion verb.' },
    ],
  },
  {
    id: 'irregular', name: 'Unregelmäßige Verben', nameEn: 'Irregular Verbs',
    verbs: [
      { inf: 'fahren', en: 'to drive/go (vehicle)', type: 'irregular',
        present: { ich: 'fahre', du: 'fährst', er: 'fährt', wir: 'fahren', ihr: 'fahrt', sie: 'fahren' },
        perfekt: 'ist gefahren', praeteritum: 'fuhr',
        example: 'Er fährt jeden Morgen mit dem Bus.', commonMistake: 'Vowel changes a→ä in du/er forms; uses "ist" in Perfekt because it\'s a motion verb.' },
      { inf: 'essen', en: 'to eat', type: 'irregular',
        present: { ich: 'esse', du: 'isst', er: 'isst', wir: 'essen', ihr: 'esst', sie: 'essen' },
        perfekt: 'hat gegessen', praeteritum: 'aß',
        example: 'Wir essen um sechs Uhr Abendessen.', commonMistake: 'du and er/sie/es are identical: "isst" — easy to misspell as "isst" vs "ist".' },
      { inf: 'nehmen', en: 'to take', type: 'irregular',
        present: { ich: 'nehme', du: 'nimmst', er: 'nimmt', wir: 'nehmen', ihr: 'nehmt', sie: 'nehmen' },
        perfekt: 'hat genommen', praeteritum: 'nahm',
        example: 'Ich nehme den Zug um acht Uhr.', commonMistake: 'Stem vowel changes e→i in du/er, and consonant doubles: nimm-.' },
    ],
  },
  {
    id: 'modal', name: 'Modalverben', nameEn: 'Modal Verbs',
    verbs: [
      { inf: 'können', en: 'can / to be able to', type: 'modal',
        present: { ich: 'kann', du: 'kannst', er: 'kann', wir: 'können', ihr: 'könnt', sie: 'können' },
        perfekt: 'hat gekonnt', praeteritum: 'konnte',
        example: 'Ich kann gut Deutsch sprechen.', commonMistake: 'Modal verbs push the main verb to the end of the sentence in infinitive form.' },
      { inf: 'müssen', en: 'must / to have to', type: 'modal',
        present: { ich: 'muss', du: 'musst', er: 'muss', wir: 'müssen', ihr: 'müsst', sie: 'müssen' },
        perfekt: 'hat gemusst', praeteritum: 'musste',
        example: 'Du musst pünktlich sein.', commonMistake: 'No umlaut in singular forms: muss, musst, muss (not müss-).' },
    ],
  },
  {
    id: 'separable', name: 'Trennbare Verben', nameEn: 'Separable Verbs',
    verbs: [
      { inf: 'aufstehen', en: 'to get up', type: 'separable',
        present: { ich: 'stehe ... auf', du: 'stehst ... auf', er: 'steht ... auf', wir: 'stehen ... auf', ihr: 'steht ... auf', sie: 'stehen ... auf' },
        perfekt: 'ist aufgestanden', praeteritum: 'stand ... auf',
        example: 'Ich stehe jeden Tag um sieben Uhr auf.', commonMistake: 'The prefix "auf" moves to the end of the main clause: "Ich stehe auf", not "Ich aufstehe".' },
      { inf: 'einkaufen', en: 'to shop, go shopping', type: 'separable',
        present: { ich: 'kaufe ... ein', du: 'kaufst ... ein', er: 'kauft ... ein', wir: 'kaufen ... ein', ihr: 'kauft ... ein', sie: 'kaufen ... ein' },
        perfekt: 'hat eingekauft', praeteritum: 'kaufte ... ein',
        example: 'Wir kaufen samstags ein.', commonMistake: 'In subordinate clauses (after "weil", "dass") the verb stays together at the end: "weil wir einkaufen".' },
    ],
  },
  {
    id: 'reflexive', name: 'Reflexive Verben', nameEn: 'Reflexive Verbs',
    verbs: [
      { inf: 'sich freuen', en: 'to be happy/glad', type: 'reflexive',
        present: { ich: 'freue mich', du: 'freust dich', er: 'freut sich', wir: 'freuen uns', ihr: 'freut euch', sie: 'freuen sich' },
        perfekt: 'hat sich gefreut', praeteritum: 'freute sich',
        example: 'Ich freue mich auf das Wochenende.', commonMistake: 'The reflexive pronoun must match the subject: "ich ... mich", "du ... dich", not always "sich".' },
      { inf: 'sich erinnern', en: 'to remember', type: 'reflexive',
        present: { ich: 'erinnere mich', du: 'erinnerst dich', er: 'erinnert sich', wir: 'erinnern uns', ihr: 'erinnert euch', sie: 'erinnern sich' },
        perfekt: 'hat sich erinnert', praeteritum: 'erinnerte sich',
        example: 'Erinnerst du dich an mich?', commonMistake: 'Takes the preposition "an" + Akkusativ: "sich erinnern an etwas".' },
    ],
  },
];

const GRAMMAR_TOPICS = [
  {
    id: 'nominativ-akkusativ', category: 'Cases', name: 'Nominativ & Akkusativ',
    explanation: 'Nominativ marks the subject (who/what does the action). Akkusativ marks the direct object (who/what receives the action). Der/die/das change in Akkusativ: der→den, die→die, das→das.',
    examples: [
      { de: 'Der Mann kauft den Apfel.', en: 'The man buys the apple.', note: '"Der Mann" = subject (Nominativ), "den Apfel" = object (Akkusativ, der→den)' },
      { de: 'Die Frau sieht das Kind.', en: 'The woman sees the child.', note: 'die and das stay the same in Akkusativ' },
    ],
  },
  {
    id: 'dativ', category: 'Cases', name: 'Dativ',
    explanation: 'Dativ marks the indirect object (to/for whom). Articles change: der→dem, die→der, das→dem, die(pl)→den. Many verbs require Dativ: helfen, geben, danken, gefallen.',
    examples: [
      { de: 'Ich gebe dem Mann das Buch.', en: 'I give the man the book.', note: 'der→dem in Dativ' },
      { de: 'Das Geschenk gefällt der Frau.', en: 'The woman likes the gift.', note: '"gefallen" always takes Dativ' },
    ],
  },
  {
    id: 'wechselpraep', category: 'Prepositions', name: 'Wechselpräpositionen',
    explanation: 'Two-way prepositions (an, auf, hinter, in, neben, über, unter, vor, zwischen) take Akkusativ for movement/direction (wohin?) and Dativ for location (wo?).',
    examples: [
      { de: 'Ich lege das Buch auf den Tisch.', en: 'I put the book on the table.', note: 'Movement → Akkusativ (auf den)' },
      { de: 'Das Buch liegt auf dem Tisch.', en: 'The book is lying on the table.', note: 'Location → Dativ (auf dem)' },
    ],
  },
  {
    id: 'subordinate', category: 'Sentence Structure', name: 'Nebensätze (Subordinate Clauses)',
    explanation: 'In subordinate clauses introduced by weil, dass, wenn, obwohl, the conjugated verb moves to the very end of the clause.',
    examples: [
      { de: 'Ich bleibe zu Hause, weil ich krank bin.', en: 'I am staying home because I am sick.', note: 'Verb "bin" goes to the end after "weil"' },
      { de: 'Er sagt, dass er morgen kommt.', en: 'He says that he is coming tomorrow.', note: 'Verb "kommt" goes to the end after "dass"' },
    ],
  },
  {
    id: 'conjunctions', category: 'Conjunctions', name: 'Konjunktionen: weil vs. denn vs. deshalb',
    explanation: '"weil" sends the verb to the end (subordinate). "denn" keeps normal word order (coordinate). "deshalb" triggers inversion (verb comes right after it, then subject).',
    examples: [
      { de: 'Ich lerne Deutsch, weil ich in Österreich arbeite.', en: 'I am learning German because I work in Austria.', note: 'weil → verb at end' },
      { de: 'Ich lerne Deutsch, denn ich arbeite in Österreich.', en: 'I am learning German, for I work in Austria.', note: 'denn → normal order' },
      { de: 'Ich arbeite in Österreich, deshalb lerne ich Deutsch.', en: 'I work in Austria, therefore I am learning German.', note: 'deshalb → verb-subject inversion' },
    ],
  },
  {
    id: 'adjektivendungen', category: 'Adjective Endings', name: 'Adjektivendungen (basic)',
    explanation: 'Adjective endings depend on the article type and case. After "der/die/das" (definite), endings are weak. After "ein/eine/ein" (indefinite), endings vary slightly more.',
    examples: [
      { de: 'der große Mann', en: 'the tall man', note: 'Nominativ, masculine, weak ending -e' },
      { de: 'ein großer Mann', en: 'a tall man', note: 'Indefinite article needs the ending the article lacks: -er' },
    ],
  },
  {
    id: 'komparativ', category: 'Comparative/Superlative', name: 'Komparativ & Superlativ',
    explanation: 'Comparative: add -er (schnell→schneller). Superlative: am + -sten (am schnellsten). Many one-syllable words also get an umlaut: groß→größer→am größten.',
    examples: [
      { de: 'Das Auto ist schneller als das Fahrrad.', en: 'The car is faster than the bike.', note: 'Comparative + als' },
      { de: 'Der Zug ist am schnellsten.', en: 'The train is the fastest.', note: 'Superlative: am + -sten' },
    ],
  },
  {
    id: 'passiv', category: 'Passive Voice', name: 'Passiv (basic)',
    explanation: 'Passive voice (werden + Partizip II) shifts focus from the doer to the action. Common in notices and announcements, frequent in ÖSD reading texts.',
    examples: [
      { de: 'Die Tür wird um 18 Uhr geschlossen.', en: 'The door is closed at 6pm.', note: 'werden (present) + Partizip II' },
      { de: 'Das Geschäft wurde letzte Woche eröffnet.', en: 'The shop was opened last week.', note: 'wurde (Präteritum) + Partizip II' },
    ],
  },
  {
    id: 'futur', category: 'Future Tense', name: 'Futur I',
    explanation: 'Future is formed with werden + Infinitiv, but in everyday German, present tense + a time word (morgen, nächste Woche) is often used instead.',
    examples: [
      { de: 'Ich werde morgen ankommen.', en: 'I will arrive tomorrow.', note: 'werden + Infinitiv' },
      { de: 'Ich komme morgen an.', en: 'I am arriving tomorrow.', note: 'Present tense often replaces future in spoken German' },
    ],
  },
  {
    id: 'imperativ', category: 'Imperative', name: 'Imperativ',
    explanation: 'Used for commands/instructions, very common in notices and exam texts. du-form drops the -st ending; Sie-form inverts verb and pronoun.',
    examples: [
      { de: 'Mach die Tür zu!', en: 'Close the door!', note: 'du-Imperativ: machst→mach' },
      { de: 'Bitte füllen Sie das Formular aus.', en: 'Please fill out the form.', note: 'Sie-Imperativ: verb first' },
    ],
  },
];

// Reading texts: pre-built bank, used as fallback/seed and for variety alongside AI-generated ones
const READING_TEXTS = [
  {
    id: 'r1', type: 'Anzeige (Advertisement)', difficulty: 'easy',
    title: 'Wohnungsanzeige',
    text: `Schöne 2-Zimmer-Wohnung in Linz zu vermieten. 55 m², 2. Stock, Balkon, Küche neu renoviert. Miete: 650 € pro Monat plus Nebenkosten. Haustiere erlaubt. Verfügbar ab 1. August. Besichtigung nach Vereinbarung. Kontakt: Frau Berger, Tel. 0732 123 456.`,
    vocab: [
      { de: 'vermieten', en: 'to rent out' },
      { de: 'Stock', en: 'floor (of a building)' },
      { de: 'Besichtigung', en: 'viewing' },
      { de: 'Vereinbarung', en: 'arrangement' },
    ],
    questions: [
      { q: 'Wie groß ist die Wohnung?', options: ['45 m²', '55 m²', '65 m²', '75 m²'], correct: 1, explanation: 'The text states "55 m²" directly.' },
      { q: 'Was kostet die Wohnung pro Monat (ohne Nebenkosten)?', options: ['450 €', '550 €', '650 €', '750 €'], correct: 2, explanation: '"Miete: 650 € pro Monat plus Nebenkosten" — 650€ is the rent before utilities.' },
      { q: 'Was muss man tun, um die Wohnung zu besichtigen?', options: ['Einfach hingehen', 'Einen Termin vereinbaren', 'Online buchen', 'Eine E-Mail an die Stadt schreiben'], correct: 1, explanation: '"Besichtigung nach Vereinbarung" means a viewing must be arranged in advance.' },
    ],
    traps: ['Don\'t confuse "Miete" (rent) with "Nebenkosten" (utilities) — they are separate amounts.', '"Stock" here means floor/storey, not the English "stock" (inventory).'],
  },
  {
    id: 'r2', type: 'E-Mail', difficulty: 'medium',
    title: 'E-Mail von einer Freundin',
    text: `Liebe Sandra, vielen Dank für deine Einladung zur Geburtstagsfeier am Samstag. Ich würde sehr gern kommen, aber ich muss leider arbeiten, da meine Kollegin krank ist. Können wir uns stattdessen am Sonntag treffen? Ich habe ein kleines Geschenk für dich. Lass mich wissen, ob das passt. Viele Grüße, Petra`,
    vocab: [
      { de: 'Einladung', en: 'invitation' },
      { de: 'Geburtstagsfeier', en: 'birthday party' },
      { de: 'stattdessen', en: 'instead' },
      { de: 'passen', en: 'to suit, work (for someone)' },
    ],
    questions: [
      { q: 'Warum kann Petra nicht zur Feier kommen?', options: ['Sie ist krank', 'Sie hat kein Geschenk', 'Sie muss arbeiten', 'Sie ist im Urlaub'], correct: 2, explanation: 'Petra says she has to work because her colleague is sick.' },
      { q: 'Was schlägt Petra vor?', options: ['Eine Feier am Montag', 'Sich am Sonntag zu treffen', 'Das Geschenk per Post zu schicken', 'Die Feier ganz abzusagen'], correct: 1, explanation: 'She proposes meeting on Sunday instead.' },
    ],
    traps: ['"Krank" refers to the colleague, not Petra herself — a common trap for skimming readers.'],
  },
  {
    id: 'r3', type: 'Forumbeitrag (Forum Post)', difficulty: 'medium',
    title: 'Frage im Sprachforum',
    text: `Hallo zusammen! Ich lerne seit sechs Monaten Deutsch und möchte nächstes Jahr die ÖSD-A2-Prüfung machen. Welche Bücher oder Apps könnt ihr mir empfehlen, besonders für den Lesen-Teil? Ich habe Probleme, schnell genug zu lesen. Danke für eure Tipps! LG, Markus`,
    vocab: [
      { de: 'empfehlen', en: 'to recommend' },
      { de: 'Probleme haben', en: 'to have trouble/problems' },
      { de: 'Tipp', en: 'tip' },
    ],
    questions: [
      { q: 'Wie lange lernt Markus schon Deutsch?', options: ['3 Monate', '6 Monate', '1 Jahr', '2 Jahre'], correct: 1, explanation: '"seit sechs Monaten" = for six months.' },
      { q: 'Welches Problem hat Markus?', options: ['Er versteht keine Grammatik', 'Er liest zu langsam', 'Er hat keine Bücher', 'Er mag die Prüfung nicht'], correct: 1, explanation: '"schnell genug zu lesen" — he struggles with reading speed.' },
    ],
    traps: [],
  },
  {
    id: 'r4', type: 'Veranstaltungshinweis (Event Notice)', difficulty: 'easy',
    title: 'Stadtfest Graz',
    text: `Stadtfest Graz: Vom 12. bis 14. Juli findet das jährliche Stadtfest am Hauptplatz statt. Es gibt Musik, Essen aus aller Welt und ein Kinderprogramm. Der Eintritt ist frei. Bei schlechtem Wetter wird das Fest in die Stadthalle verlegt. Weitere Informationen unter www.stadtfest-graz.at.`,
    vocab: [
      { de: 'jährlich', en: 'annual' },
      { de: 'Eintritt', en: 'admission, entry' },
      { de: 'verlegen', en: 'to relocate, postpone' },
    ],
    questions: [
      { q: 'Wie viel kostet der Eintritt?', options: ['5 €', '10 €', 'Nichts, der Eintritt ist frei', 'Das steht nicht im Text'], correct: 2, explanation: '"Der Eintritt ist frei" = admission is free.' },
      { q: 'Was passiert bei schlechtem Wetter?', options: ['Das Fest wird abgesagt', 'Das Fest findet trotzdem am Hauptplatz statt', 'Das Fest wird in die Stadthalle verlegt', 'Das Fest dauert länger'], correct: 2, explanation: 'The text explicitly states the event moves indoors to the Stadthalle in bad weather.' },
    ],
    traps: ['"Verlegt" (relocated) is often confused with "verschoben" (postponed) — here it\'s a location change, not a date change.'],
  },
];

const ACHIEVEMENTS = [
  { id: 'first_steps', name: 'Erste Schritte', desc: 'Complete your first exercise', icon: '🌱', condition: (s) => s.totalExercisesCompleted >= 1 },
  { id: 'streak_3', name: 'Drei Tage stark', desc: '3-day streak', icon: '🔥', condition: (s) => s.streak >= 3 },
  { id: 'streak_7', name: 'Eine Woche!', desc: '7-day streak', icon: '⚡', condition: (s) => s.streak >= 7 },
  { id: 'vocab_25', name: 'Wortschatz-Sammler', desc: 'Learn 25 words', icon: '📚', condition: (s) => s.wordsLearned >= 25 },
  { id: 'vocab_50', name: 'Wortschatz-Meister', desc: 'Learn 50 words', icon: '📖', condition: (s) => s.wordsLearned >= 50 },
  { id: 'reading_5', name: 'Lese-Lehrling', desc: 'Complete 5 reading texts', icon: '📰', condition: (s) => s.readingTextsCompleted >= 5 },
  { id: 'reading_15', name: 'Lese-Profi', desc: 'Complete 15 reading texts', icon: '🗞️', condition: (s) => s.readingTextsCompleted >= 15 },
  { id: 'perfect_quiz', name: 'Perfekt!', desc: 'Score 100% on a quiz', icon: '🎯', condition: (s) => s.hadPerfectQuiz },
  { id: 'exam_done', name: 'Prüfungsbereit', desc: 'Complete a full mock exam', icon: '🏆', condition: (s) => s.mockExamsCompleted >= 1 },
  { id: 'level_5', name: 'Level 5', desc: 'Reach level 5', icon: '⭐', condition: (s) => s.level >= 5 },
];

const XP_PER_LEVEL = 100;


// ============ FROM App.jsx ============

// ===================== UTILITIES =====================



function GenderDot({ gender, size = 10 }) {
  if (!gender || !GENDER_META[gender]) return null;
  const meta = GENDER_META[gender];
  return (
    <span
      title={meta.label}
      style={{
        display: 'inline-block', width: size, height: size, borderRadius: '50%',
        background: meta.color, marginRight: 6, flexShrink: 0,
      }}
    />
  );
}

function GenderWord({ word }) {
  const meta = word.gender ? GENDER_META[word.gender] : null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <GenderDot gender={word.gender} />
      {meta && <span style={{ color: meta.color, fontWeight: 600, marginRight: 5 }}>{meta.label}</span>}
      <span>{word.de}</span>
    </span>
  );
}

// ===================== APP STATE (in-memory only) =====================

const initialStats = {
  xp: 0,
  level: 1,
  streak: 1,
  totalExercisesCompleted: 0,
  wordsLearned: 0,
  wordsMastered: {},     // { wordKey: masteryCount }
  readingTextsCompleted: 0,
  hadPerfectQuiz: false,
  mockExamsCompleted: 0,
  unlockedAchievements: [],
  topicAccuracy: {},     // { topicId: { correct, total } }
  history: [],           // { date, type, score, total }
};

function useAppStats() {
  const [stats, setStats] = useState(initialStats);

  const addXP = useCallback((amount) => {
    setStats((prev) => {
      const newXP = prev.xp + amount;
      const newLevel = Math.floor(newXP / XP_PER_LEVEL) + 1;
      return { ...prev, xp: newXP, level: newLevel };
    });
  }, []);

  const recordExercise = useCallback((topicId, correct, total) => {
    setStats((prev) => {
      const prevAcc = prev.topicAccuracy[topicId] || { correct: 0, total: 0 };
      return {
        ...prev,
        totalExercisesCompleted: prev.totalExercisesCompleted + 1,
        topicAccuracy: {
          ...prev.topicAccuracy,
          [topicId]: { correct: prevAcc.correct + correct, total: prevAcc.total + total },
        },
        hadPerfectQuiz: prev.hadPerfectQuiz || (total > 0 && correct === total),
        history: [...prev.history, { date: new Date().toISOString(), type: topicId, score: correct, total }].slice(-50),
      };
    });
  }, []);

  const recordWordLearned = useCallback((wordKey) => {
    setStats((prev) => {
      if (prev.wordsMastered[wordKey]) return prev;
      return {
        ...prev,
        wordsLearned: prev.wordsLearned + 1,
        wordsMastered: { ...prev.wordsMastered, [wordKey]: 1 },
      };
    });
  }, []);

  const recordReadingComplete = useCallback(() => {
    setStats((prev) => ({ ...prev, readingTextsCompleted: prev.readingTextsCompleted + 1 }));
  }, []);

  const recordMockExam = useCallback(() => {
    setStats((prev) => ({ ...prev, mockExamsCompleted: prev.mockExamsCompleted + 1 }));
  }, []);

  // Check for newly unlocked achievements
  useEffect(() => {
    const newlyUnlocked = ACHIEVEMENTS.filter(
      (a) => !stats.unlockedAchievements.includes(a.id) && a.condition(stats)
    );
    if (newlyUnlocked.length > 0) {
      setStats((prev) => ({
        ...prev,
        unlockedAchievements: [...prev.unlockedAchievements, ...newlyUnlocked.map((a) => a.id)],
      }));
    }
  }, [stats.totalExercisesCompleted, stats.wordsLearned, stats.readingTextsCompleted, stats.streak, stats.level, stats.mockExamsCompleted, stats.hadPerfectQuiz]);

  return { stats, addXP, recordExercise, recordWordLearned, recordReadingComplete, recordMockExam, setStats };
}

// ===================== TOAST / XP POPUP =====================

function XPToast({ toasts }) {
  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 1000,
      display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          background: '#1A2842', color: '#F7F3EA', padding: '10px 18px',
          borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
          fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          animation: 'slideIn 0.3s ease-out',
        }}>
          +{t.amount} XP {t.label ? `· ${t.label}` : ''}
        </div>
      ))}
    </div>
  );
}

// ===================== NAVIGATION SHELL =====================

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Übersicht', icon: '⌂' },
  { id: 'reading', label: 'Lesen', icon: '📰' },
  { id: 'vocab', label: 'Wortschatz', icon: '🔤' },
  { id: 'verbs', label: 'Verben', icon: '⚙' },
  { id: 'grammar', label: 'Grammatik', icon: '§' },
  { id: 'quiz', label: 'Quiz', icon: '✓' },
  { id: 'exam', label: 'Prüfung', icon: '🎓' },
  { id: 'tutor', label: 'KI-Tutor', icon: '💬' },
];

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { stats, addXP, recordExercise, recordWordLearned, recordReadingComplete, recordMockExam, setStats } = useAppStats();
  const [toasts, setToasts] = useState([]);
  const [navOpen, setNavOpen] = useState(false);
  const toastIdRef = useRef(0);

  const showXPToast = useCallback((amount, label) => {
    const id = toastIdRef.current++;
    setToasts((prev) => [...prev, { id, amount, label }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2200);
  }, []);

  const handleAddXP = useCallback((amount, label) => {
    addXP(amount);
    showXPToast(amount, label);
  }, [addXP, showXPToast]);

  const ctx = { stats, handleAddXP, recordExercise, recordWordLearned, recordReadingComplete, recordMockExam, setStats };

  return (
    <div style={{
      fontFamily: "'Inter', sans-serif",
      background: '#1A2842',
      minHeight: '100vh',
      color: '#F7F3EA',
      display: 'flex',
      position: 'relative',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        @keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes popIn { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: rgba(247,243,234,0.2); border-radius: 4px; }
        button:focus-visible, [tabindex]:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid #D4A017; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
        .scrim-paper { background: #F7F3EA; color: #2A2419; border-radius: 14px; }
      `}</style>

      <XPToast toasts={toasts} />

      {/* Mobile nav toggle */}
      <button
        onClick={() => setNavOpen(!navOpen)}
        aria-label="Menü öffnen"
        style={{
          display: 'none', position: 'fixed', top: 16, left: 16, zIndex: 200,
          background: '#D4A017', border: 'none', borderRadius: 8, width: 40, height: 40,
          fontSize: 18, color: '#1A2842', cursor: 'pointer',
        }}
        className="mobile-nav-toggle"
      >☰</button>

      {/* Sidebar */}
      <nav style={{
        width: 230, flexShrink: 0, padding: '28px 16px',
        borderRight: '1px solid rgba(247,243,234,0.1)',
        display: 'flex', flexDirection: 'column', gap: 4,
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}
      className="sidebar-nav"
      >
        <div style={{ padding: '0 12px 20px' }}>
          <div style={{
            fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 22, lineHeight: 1.1,
            letterSpacing: '-0.01em',
          }}>
            A2 Booklet
          </div>
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
            ÖSD-Prüfungstraining
          </div>
        </div>

        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => { setActiveTab(item.id); setNavOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8, border: 'none',
              background: activeTab === item.id ? 'rgba(212,160,23,0.18)' : 'transparent',
              color: activeTab === item.id ? '#D4A017' : '#F7F3EA',
              fontWeight: activeTab === item.id ? 600 : 500,
              fontSize: 14.5, textAlign: 'left', cursor: 'pointer', width: '100%',
              transition: 'background 0.15s',
            }}
          >
            <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{item.icon}</span>
            {item.label}
          </button>
        ))}

        <div style={{ marginTop: 'auto', padding: '12px', fontSize: 12, opacity: 0.5, fontFamily: "'JetBrains Mono', monospace" }}>
          Level {stats.level} · {stats.xp} XP
        </div>
      </nav>

      <style>{`
        @media (max-width: 760px) {
          .sidebar-nav { position: fixed; left: 0; top: 0; z-index: 150; transform: translateX(${navOpen ? '0' : '-100%'}); transition: transform 0.25s ease; background: #1A2842; box-shadow: ${navOpen ? '8px 0 24px rgba(0,0,0,0.3)' : 'none'}; }
          .mobile-nav-toggle { display: flex !important; align-items: center; justify-content: center; }
          .main-content { padding-top: 64px !important; }
        }
      `}</style>

      {/* Main content */}
      <main className="main-content" style={{ flex: 1, padding: '32px 36px', maxWidth: 1100, minWidth: 0 }}>
        {activeTab === 'dashboard' && <Dashboard ctx={ctx} setActiveTab={setActiveTab} />}
        {activeTab === 'reading' && <ReadingModule ctx={ctx} />}
        {activeTab === 'vocab' && <VocabModule ctx={ctx} />}
        {activeTab === 'verbs' && <VerbModule ctx={ctx} />}
        {activeTab === 'grammar' && <GrammarModule ctx={ctx} />}
        {activeTab === 'quiz' && <QuizModule ctx={ctx} />}
        {activeTab === 'exam' && <ExamModule ctx={ctx} />}
        {activeTab === 'tutor' && <TutorModule ctx={ctx} />}
      </main>
    </div>
  );
}

// ===================== DASHBOARD =====================

function Dashboard({ ctx, setActiveTab }) {
  const { stats } = ctx;
  const xpIntoLevel = stats.xp % XP_PER_LEVEL;
  const pct = Math.round((xpIntoLevel / XP_PER_LEVEL) * 100);

  const topics = Object.entries(stats.topicAccuracy);
  const weakest = topics
    .map(([id, v]) => ({ id, pct: v.total ? v.correct / v.total : 1, total: v.total }))
    .filter((t) => t.total >= 2)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3);

  const unlockedSet = new Set(stats.unlockedAchievements);

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      <header style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 700, margin: 0 }}>
          Willkommen zurück
        </h1>
        <p style={{ opacity: 0.7, marginTop: 6, fontSize: 15 }}>
          Dein persönliches Übersichtsblatt für die ÖSD A2 Prüfung.
        </p>
      </header>

      {/* Stat cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
        <StatCard label="Level" value={stats.level} sub={`${pct}% zum nächsten Level`} accent="#D4A017" />
        <StatCard label="Serie" value={`${stats.streak} Tage`} sub="Tägliche Übung" accent="#B5533C" />
        <StatCard label="Wörter gelernt" value={stats.wordsLearned} sub="im Wortschatz" accent="#5B8C5A" />
        <StatCard label="Lesetexte" value={stats.readingTextsCompleted} sub="abgeschlossen" accent="#3B6FA0" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20 }} className="dash-grid">
        <style>{`@media (max-width: 880px) { .dash-grid { grid-template-columns: 1fr !important; } }`}</style>

        {/* Weak areas */}
        <div className="scrim-paper" style={{ padding: 22 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, margin: '0 0 14px' }}>Empfohlen für dich</h2>
          {weakest.length === 0 ? (
            <p style={{ opacity: 0.65, fontSize: 14 }}>
              Mach ein paar Übungen, damit wir sehen, wo du noch trainieren solltest.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {weakest.map((w) => (
                <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(181,83,60,0.08)', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{w.id}</div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>{Math.round(w.pct * 100)}% richtig</div>
                  </div>
                  <div style={{ width: 60, height: 6, background: 'rgba(0,0,0,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.round(w.pct * 100)}%`, height: '100%', background: '#B5533C' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <QuickButton onClick={() => setActiveTab('reading')} label="Lesen üben" />
            <QuickButton onClick={() => setActiveTab('vocab')} label="Wortschatz" />
            <QuickButton onClick={() => setActiveTab('quiz')} label="Quiz starten" />
          </div>
        </div>

        {/* Achievements */}
        <div className="scrim-paper" style={{ padding: 22 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, margin: '0 0 14px' }}>Erfolge</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 10 }}>
            {ACHIEVEMENTS.map((a) => {
              const unlocked = unlockedSet.has(a.id);
              return (
                <div key={a.id} title={`${a.name}: ${a.desc}`} style={{
                  textAlign: 'center', padding: '10px 4px', borderRadius: 8,
                  background: unlocked ? 'rgba(91,140,90,0.12)' : 'rgba(0,0,0,0.04)',
                  opacity: unlocked ? 1 : 0.35,
                }}>
                  <div style={{ fontSize: 22 }}>{a.icon}</div>
                  <div style={{ fontSize: 9.5, marginTop: 4, fontWeight: 600, lineHeight: 1.2 }}>{a.name}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Exam readiness */}
      <div className="scrim-paper" style={{ padding: 22, marginTop: 20 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, margin: '0 0 14px' }}>Prüfungsbereitschaft</h2>
        <ExamReadinessBar stats={stats} />
      </div>
    </div>
  );
}

function ExamReadinessBar({ stats }) {
  const topics = Object.values(stats.topicAccuracy);
  const totalAttempts = topics.reduce((s, t) => s + t.total, 0);
  const totalCorrect = topics.reduce((s, t) => s + t.correct, 0);
  const accuracyScore = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;
  const volumeScore = Math.min(1, totalAttempts / 60);
  const readiness = Math.round((accuracyScore * 0.6 + volumeScore * 0.4) * 100);

  let msg = 'Mach weiter — jede Übung bringt dich näher zur Prüfung.';
  if (readiness > 75) msg = 'Stark! Du bist gut auf die Prüfung vorbereitet.';
  else if (readiness > 45) msg = 'Guter Fortschritt. Übe weiter, besonders deine schwächeren Themen.';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, fontWeight: 700, color: '#1A2842' }}>{readiness}%</span>
        <span style={{ fontSize: 13, opacity: 0.65 }}>geschätzte Bereitschaft</span>
      </div>
      <div style={{ width: '100%', height: 10, background: 'rgba(0,0,0,0.08)', borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ width: `${readiness}%`, height: '100%', background: 'linear-gradient(90deg, #B5533C, #D4A017, #5B8C5A)', transition: 'width 0.4s' }} />
      </div>
      <p style={{ fontSize: 13.5, opacity: 0.75, margin: 0 }}>{msg}</p>
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="scrim-paper" style={{ padding: '16px 18px', borderLeft: `4px solid ${accent}` }}>
      <div style={{ fontSize: 12, opacity: 0.55, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Fraunces', serif", marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function QuickButton({ onClick, label }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 14px', borderRadius: 7, border: '1px solid rgba(26,40,66,0.15)',
      background: 'transparent', color: '#1A2842', fontSize: 13, fontWeight: 600,
      cursor: 'pointer',
    }}>
      {label} →
    </button>
  );
}


// ============ FROM ReadingModule.jsx ============





const TEXT_TYPES = ['Anzeige', 'E-Mail', 'Forumbeitrag', 'Stellenanzeige', 'Mitteilung', 'Social-Media-Beitrag', 'Zeitungsnotiz', 'Veranstaltungshinweis'];

const READING_SYSTEM_PROMPT = `You are an expert ÖSD A2 German exam content creator. You write short, authentic-feeling texts (60-110 words) in the style of real ÖSD A2 Lesen exam materials: advertisements, emails, forum posts, job ads, notices, social media posts, newspaper snippets, event announcements. Vocabulary and grammar must stay strictly at A1-A2 level (present tense, Perfekt, simple modal verbs, basic subordinate clauses with weil/dass/wenn). Always respond with ONLY valid JSON, no markdown fences, no preamble, matching this exact schema:
{
  "type": "string (German text type label e.g. 'E-Mail')",
  "title": "string (short German title)",
  "text": "string (the German text, 60-110 words)",
  "vocab": [{"de": "string", "en": "string"}] (4-6 key A2 vocabulary items from the text),
  "questions": [
    {"q": "string (German question)", "options": ["string","string","string","string"], "correct": 0, "explanation": "string (English explanation of why this answer is correct and others are wrong)"}
  ] (exactly 3 questions, multiple choice with 4 options),
  "traps": ["string"] (1-2 English notes on common misunderstanding traps in this text)
}`;

function ReadingModule({ ctx }) {
  const [currentText, setCurrentText] = useState(null);
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translation, setTranslation] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [difficulty, setDifficulty] = useState('medium');
  const [error, setError] = useState(null);

  const loadBankText = useCallback((text) => {
    setCurrentText({ ...text, fromBank: true });
    setAnswers({});
    setSubmitted(false);
    setShowTranslation(false);
    setTranslation(null);
    setError(null);
  }, []);

  const generateText = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAnswers({});
    setSubmitted(false);
    setShowTranslation(false);
    setTranslation(null);
    const textType = TEXT_TYPES[Math.floor(Math.random() * TEXT_TYPES.length)];
    const weakTopics = Object.entries(ctx.stats.topicAccuracy)
      .filter(([, v]) => v.total >= 2 && v.correct / v.total < 0.6)
      .map(([k]) => k);
    const weakNote = weakTopics.length > 0 ? ` Try to naturally include vocabulary or grammar related to: ${weakTopics.slice(0, 2).join(', ')}.` : '';
    const userMsg = `Create a new ÖSD A2 reading text of type "${textType}" at ${difficulty} difficulty.${weakNote} Make it feel realistic and exam-like, not generic. Respond with ONLY the JSON object.`;

    const result = await callClaude([{ role: 'user', content: userMsg }], READING_SYSTEM_PROMPT, 1400);
    const parsed = extractJSON(result);
    if (parsed && parsed.text && parsed.questions) {
      setCurrentText({ ...parsed, id: 'ai-' + Date.now(), difficulty, fromBank: false });
    } else {
      setError('Der KI-Text konnte nicht geladen werden. Hier ist ein Text aus der Sammlung.');
      const fallback = READING_TEXTS[Math.floor(Math.random() * READING_TEXTS.length)];
      setCurrentText({ ...fallback, fromBank: true });
    }
    setLoading(false);
  }, [difficulty, ctx.stats.topicAccuracy]);

  const handleSelect = (qIdx, optIdx) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qIdx]: optIdx }));
  };

  const handleSubmit = () => {
    if (!currentText) return;
    const correct = currentText.questions.reduce((sum, q, i) => sum + (answers[i] === q.correct ? 1 : 0), 0);
    setSubmitted(true);
    ctx.recordExercise('reading', correct, currentText.questions.length);
    ctx.recordReadingComplete();
    ctx.handleAddXP(10 + correct * 5, 'Lesen');
  };

  const handleTranslate = async () => {
    if (translation) { setShowTranslation((s) => !s); return; }
    setTranslating(true);
    const result = await callClaude(
      [{ role: 'user', content: `Translate this German text into natural English. Respond with ONLY the translation, no preamble:\n\n${currentText.text}` }],
      'You are a precise German-English translator.',
      500
    );
    setTranslation(result || 'Übersetzung nicht verfügbar.');
    setShowTranslation(true);
    setTranslating(false);
  };

  const allAnswered = currentText && currentText.questions.every((_, i) => answers[i] !== undefined);
  const score = currentText && submitted ? currentText.questions.reduce((s, q, i) => s + (answers[i] === q.correct ? 1 : 0), 0) : 0;

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 700, margin: 0 }}>Lesen</h1>
        <p style={{ opacity: 0.7, marginTop: 6, fontSize: 15 }}>
          Übe mit realistischen Texten: Anzeigen, E-Mails, Foren, Stellenanzeigen und mehr.
        </p>
      </header>

      {!currentText && (
        <div className="scrim-paper" style={{ padding: 26 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, margin: '0 0 16px' }}>Neuen Text starten</h2>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            {['easy', 'medium', 'hard'].map((d) => (
              <button key={d} onClick={() => setDifficulty(d)} style={{
                padding: '8px 16px', borderRadius: 7, border: `2px solid ${difficulty === d ? '#1A2842' : 'rgba(26,40,66,0.15)'}`,
                background: difficulty === d ? '#1A2842' : 'transparent', color: difficulty === d ? '#F7F3EA' : '#1A2842',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                {d === 'easy' ? 'Leicht' : d === 'medium' ? 'Mittel' : 'Schwer'}
              </button>
            ))}
          </div>
          <button onClick={generateText} disabled={loading} style={{
            padding: '12px 22px', borderRadius: 9, border: 'none', background: '#D4A017',
            color: '#1A2842', fontWeight: 700, fontSize: 14.5, cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Text wird erstellt …' : '✦ Neuen Text generieren'}
          </button>

          <div style={{ marginTop: 28, borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 20 }}>
            <h3 style={{ fontSize: 14, opacity: 0.6, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Oder aus der Sammlung wählen</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {READING_TEXTS.map((t) => (
                <button key={t.id} onClick={() => loadBankText(t)} style={{
                  textAlign: 'left', padding: '12px 14px', borderRadius: 9, border: '1px solid rgba(26,40,66,0.12)',
                  background: 'rgba(26,40,66,0.03)', cursor: 'pointer',
                }}>
                  <div style={{ fontSize: 11, opacity: 0.55, fontFamily: "'JetBrains Mono', monospace" }}>{t.type} · {t.difficulty}</div>
                  <div style={{ fontWeight: 600, fontSize: 14.5, marginTop: 2, color: '#1A2842' }}>{t.title}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {currentText && (
        <div>
          {error && <div style={{ background: 'rgba(181,83,60,0.15)', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{error}</div>}

          <div className="scrim-paper" style={{ padding: 26, marginBottom: 18, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", color: '#B5533C', fontWeight: 600, letterSpacing: '0.03em' }}>
                  {currentText.type?.toUpperCase()} · {(currentText.difficulty || 'medium').toUpperCase()}
                </div>
                <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 23, margin: '4px 0 0' }}>{currentText.title}</h2>
              </div>
              <button onClick={handleTranslate} disabled={translating} style={{
                padding: '7px 14px', borderRadius: 7, border: '1px solid rgba(26,40,66,0.2)', background: 'transparent',
                color: '#1A2842', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                {translating ? '…' : showTranslation ? 'Übersetzung verbergen' : 'Ins Englische übersetzen'}
              </button>
            </div>

            <p style={{ fontSize: 16.5, lineHeight: 1.75, fontFamily: "'Fraunces', serif", fontWeight: 400 }}>
              {currentText.text}
            </p>

            {showTranslation && translation && (
              <div style={{ marginTop: 14, padding: 14, background: 'rgba(59,111,160,0.08)', borderRadius: 8, fontSize: 14.5, lineHeight: 1.6, fontStyle: 'italic' }}>
                {translation}
              </div>
            )}

            {currentText.vocab && currentText.vocab.length > 0 && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: 12, opacity: 0.55, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: "'JetBrains Mono', monospace" }}>Schlüsselwörter</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {currentText.vocab.map((v, i) => (
                    <div key={i} style={{ padding: '5px 10px', background: 'rgba(212,160,23,0.12)', borderRadius: 6, fontSize: 13 }}>
                      <strong>{v.de}</strong> — {v.en}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="scrim-paper" style={{ padding: 26 }}>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, margin: '0 0 16px' }}>Fragen zum Text</h3>
            {currentText.questions.map((q, qi) => (
              <div key={qi} style={{ marginBottom: 22 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 10 }}>{qi + 1}. {q.q}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {q.options.map((opt, oi) => {
                    const isSelected = answers[qi] === oi;
                    const isCorrect = oi === q.correct;
                    let bg = 'rgba(26,40,66,0.03)';
                    let border = '1px solid rgba(26,40,66,0.1)';
                    if (submitted) {
                      if (isCorrect) { bg = 'rgba(91,140,90,0.18)'; border = '1px solid #5B8C5A'; }
                      else if (isSelected) { bg = 'rgba(181,83,60,0.15)'; border = '1px solid #B5533C'; }
                    } else if (isSelected) {
                      bg = 'rgba(59,111,160,0.12)'; border = '1px solid #3B6FA0';
                    }
                    return (
                      <button key={oi} onClick={() => handleSelect(qi, oi)} disabled={submitted} style={{
                        textAlign: 'left', padding: '10px 14px', borderRadius: 8, border, background: bg,
                        fontSize: 14, cursor: submitted ? 'default' : 'pointer', color: '#1A2842',
                      }}>
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {submitted && (
                  <div style={{ marginTop: 8, fontSize: 13, padding: '8px 12px', background: 'rgba(0,0,0,0.04)', borderRadius: 7, lineHeight: 1.5 }}>
                    <strong>Erklärung:</strong> {q.explanation}
                  </div>
                )}
              </div>
            ))}

            {!submitted && currentText.traps && currentText.traps.length > 0 && (
              <div style={{ marginBottom: 16, padding: 12, background: 'rgba(212,160,23,0.1)', borderRadius: 8, fontSize: 12.5 }}>
                💡 <strong>Tipp:</strong> Lies genau — Prüfungstexte enthalten oft kleine Fallen.
              </div>
            )}

            {submitted && currentText.traps && currentText.traps.length > 0 && (
              <div style={{ marginBottom: 16, padding: 12, background: 'rgba(212,160,23,0.12)', borderRadius: 8, fontSize: 13 }}>
                <strong>Häufige Fallen in diesem Text:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {currentText.traps.map((t, i) => <li key={i} style={{ marginBottom: 4 }}>{t}</li>)}
                </ul>
              </div>
            )}

            {!submitted ? (
              <button onClick={handleSubmit} disabled={!allAnswered} style={{
                padding: '11px 22px', borderRadius: 9, border: 'none',
                background: allAnswered ? '#1A2842' : 'rgba(26,40,66,0.3)', color: '#F7F3EA',
                fontWeight: 700, fontSize: 14, cursor: allAnswered ? 'pointer' : 'default',
              }}>
                Antworten prüfen
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: score === currentText.questions.length ? '#5B8C5A' : '#1A2842' }}>
                  {score} / {currentText.questions.length} richtig
                </div>
                <button onClick={() => { setCurrentText(null); }} style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none', background: '#D4A017',
                  color: '#1A2842', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
                }}>
                  Nächster Text →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ============ FROM VocabModule.jsx ============



function GenderTag({ word }) {
  if (!word.gender) return null;
  const meta = GENDER_META[word.gender];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px',
      borderRadius: 5, background: `${meta.color}22`, color: meta.color,
      fontSize: 12.5, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color }} />
      {meta.label}
    </span>
  );
}

function allWordsFlat() {
  const out = [];
  VOCAB_CATEGORIES.forEach((cat) => {
    cat.words.forEach((w) => out.push({ ...w, categoryId: cat.id, categoryName: cat.name }));
  });
  return out;
}

function VocabModule({ ctx }) {
  const [view, setView] = useState('categories'); // categories | list | flashcards
  const [activeCategory, setActiveCategory] = useState(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionWords, setSessionWords] = useState([]);
  const [sessionResults, setSessionResults] = useState({ known: 0, unknown: 0 });
  const [sessionDone, setSessionDone] = useState(false);

  const allWords = useMemo(allWordsFlat, []);

  const startFlashcards = useCallback((categoryId) => {
    const words = categoryId
      ? allWords.filter((w) => w.categoryId === categoryId)
      : [...allWords].sort(() => Math.random() - 0.5).slice(0, 15);
    setSessionWords(words);
    setCardIndex(0);
    setFlipped(false);
    setSessionResults({ known: 0, unknown: 0 });
    setSessionDone(false);
    setView('flashcards');
  }, [allWords]);

  const handleCardResponse = (known) => {
    const word = sessionWords[cardIndex];
    const key = `${word.categoryId}-${word.de}`;
    if (known) {
      ctx.recordWordLearned(key);
      ctx.handleAddXP(3);
    }
    setSessionResults((prev) => ({ ...prev, [known ? 'known' : 'unknown']: prev[known ? 'known' : 'unknown'] + 1 }));
    if (cardIndex + 1 >= sessionWords.length) {
      setSessionDone(true);
      ctx.recordExercise('vocab', sessionResults.known + (known ? 1 : 0), sessionWords.length);
    } else {
      setCardIndex((i) => i + 1);
      setFlipped(false);
    }
  };

  const playAudio = (text) => {
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'de-DE';
      utter.rate = 0.92;
      window.speechSynthesis.speak(utter);
    } catch (e) { /* speech synthesis unavailable */ }
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      <header style={{ marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 700, margin: 0 }}>Wortschatz</h1>
          <p style={{ opacity: 0.7, marginTop: 6, fontSize: 15 }}>
            Lerne A1–A2 Vokabeln nach Themen, mit Artikel, Plural und Beispielen.
          </p>
        </div>
        {view !== 'categories' && (
          <button onClick={() => setView('categories')} style={{
            padding: '8px 16px', borderRadius: 7, border: '1px solid rgba(247,243,234,0.25)',
            background: 'transparent', color: '#F7F3EA', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>← Themen</button>
        )}
      </header>

      {view === 'categories' && (
        <div>
          <button onClick={() => startFlashcards(null)} style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '18px 22px', marginBottom: 18,
            borderRadius: 12, border: 'none', background: '#D4A017', color: '#1A2842', cursor: 'pointer',
          }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>✦ Zufällige Wiederholung (15 Wörter)</div>
            <div style={{ fontSize: 12.5, opacity: 0.75, marginTop: 2 }}>Gemischte Karteikarten aus allen Themen</div>
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {VOCAB_CATEGORIES.map((cat) => (
              <div key={cat.id} className="scrim-paper" style={{ padding: 18 }}>
                <div style={{ fontWeight: 700, fontSize: 16, fontFamily: "'Fraunces', serif" }}>{cat.name}</div>
                <div style={{ fontSize: 12.5, opacity: 0.6, marginBottom: 12 }}>{cat.nameEn} · {cat.words.length} Wörter</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setActiveCategory(cat); setView('list'); }} style={{
                    flex: 1, padding: '8px 0', borderRadius: 7, border: '1px solid rgba(26,40,66,0.15)',
                    background: 'transparent', color: '#1A2842', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  }}>Liste</button>
                  <button onClick={() => startFlashcards(cat.id)} style={{
                    flex: 1, padding: '8px 0', borderRadius: 7, border: 'none',
                    background: '#1A2842', color: '#F7F3EA', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  }}>Karten üben</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'list' && activeCategory && (
        <div className="scrim-paper" style={{ padding: 22 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, margin: '0 0 16px' }}>{activeCategory.name}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeCategory.words.map((w, i) => (
              <div key={i} style={{ padding: '14px 16px', background: 'rgba(26,40,66,0.03)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <GenderTag word={w} />
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{w.de}</span>
                  {w.plural && <span style={{ fontSize: 12.5, opacity: 0.55 }}>Pl. {w.plural}</span>}
                  <button onClick={() => playAudio(w.de)} title="Aussprache anhören" style={{
                    border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 15, opacity: 0.6,
                  }}>🔊</button>
                </div>
                <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 4 }}>{w.en}</div>
                <div style={{ fontSize: 13, fontStyle: 'italic', opacity: 0.65 }}>{w.example}</div>
                <div style={{ fontSize: 12.5, opacity: 0.5 }}>{w.exampleEn}</div>
                {(w.synonyms?.length > 0 || w.opposites?.length > 0 || w.collocations?.length > 0) && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, flexWrap: 'wrap' }}>
                    {w.synonyms?.length > 0 && <span><strong>Synonym:</strong> {w.synonyms.join(', ')}</span>}
                    {w.opposites?.length > 0 && <span><strong>Gegenteil:</strong> {w.opposites.join(', ')}</span>}
                    {w.collocations?.length > 0 && <span><strong>Kollokationen:</strong> {w.collocations.join(', ')}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'flashcards' && sessionWords.length > 0 && !sessionDone && (
        <FlashcardView
          word={sessionWords[cardIndex]}
          index={cardIndex}
          total={sessionWords.length}
          flipped={flipped}
          setFlipped={setFlipped}
          onResponse={handleCardResponse}
          playAudio={playAudio}
        />
      )}

      {view === 'flashcards' && sessionDone && (
        <div className="scrim-paper" style={{ padding: 30, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, margin: '0 0 8px' }}>Sitzung abgeschlossen!</h2>
          <p style={{ opacity: 0.7, marginBottom: 20 }}>
            {sessionResults.known} von {sessionWords.length} Wörtern gewusst.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => setView('categories')} style={{
              padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(26,40,66,0.15)',
              background: 'transparent', color: '#1A2842', fontWeight: 600, cursor: 'pointer',
            }}>Zu den Themen</button>
            <button onClick={() => startFlashcards(activeCategory?.id || null)} style={{
              padding: '10px 20px', borderRadius: 8, border: 'none', background: '#D4A017',
              color: '#1A2842', fontWeight: 700, cursor: 'pointer',
            }}>Noch einmal üben</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FlashcardView({ word, index, total, flipped, setFlipped, onResponse, playAudio }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, fontSize: 12.5, opacity: 0.6, fontFamily: "'JetBrains Mono', monospace" }}>
        <span>Karte {index + 1} / {total}</span>
        <span>{word.categoryName}</span>
      </div>
      <div style={{ width: '100%', height: 6, background: 'rgba(247,243,234,0.15)', borderRadius: 4, overflow: 'hidden', marginBottom: 22 }}>
        <div style={{ width: `${((index) / total) * 100}%`, height: '100%', background: '#D4A017', transition: 'width 0.3s' }} />
      </div>

      <button
        onClick={() => setFlipped(!flipped)}
        className="scrim-paper"
        style={{
          width: '100%', minHeight: 220, padding: 30, cursor: 'pointer', border: 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        }}
      >
        {!flipped ? (
          <>
            {word.gender && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: GENDER_META[word.gender].color }} />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: GENDER_META[word.gender].color }}>{GENDER_META[word.gender].label}</span>
              </div>
            )}
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 34, fontWeight: 700 }}>{word.de}</div>
            <div style={{ marginTop: 14, fontSize: 12.5, opacity: 0.45 }}>Tippen, um die Übersetzung zu sehen</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>{word.en}</div>
            <div style={{ fontSize: 14, fontStyle: 'italic', opacity: 0.7, maxWidth: 420 }}>{word.example}</div>
            <div style={{ fontSize: 12.5, opacity: 0.5, marginTop: 4, maxWidth: 420 }}>{word.exampleEn}</div>
            {word.plural && <div style={{ fontSize: 12.5, opacity: 0.55, marginTop: 8 }}>Plural: {word.plural}</div>}
          </>
        )}
      </button>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
        <button onClick={(e) => { e.stopPropagation(); playAudio(word.de); }} style={{
          border: 'none', background: 'rgba(247,243,234,0.1)', borderRadius: 20, padding: '6px 16px',
          color: '#F7F3EA', fontSize: 13, cursor: 'pointer',
        }}>🔊 Aussprache</button>
      </div>

      {flipped && (
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={() => onResponse(false)} style={{
            flex: 1, padding: '12px 0', borderRadius: 9, border: 'none', background: '#B5533C',
            color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>Noch nicht sicher</button>
          <button onClick={() => onResponse(true)} style={{
            flex: 1, padding: '12px 0', borderRadius: 9, border: 'none', background: '#5B8C5A',
            color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>Weiß ich! ✓</button>
        </div>
      )}
    </div>
  );
}


// ============ FROM VerbModule.jsx ============



const PRONOUNS = ['ich', 'du', 'er', 'wir', 'ihr', 'sie'];
const PRONOUN_LABELS = { ich: 'ich', du: 'du', er: 'er/sie/es', wir: 'wir', ihr: 'ihr', sie: 'sie/Sie' };

const TYPE_COLORS = { regular: '#5B8C5A', irregular: '#B5533C', modal: '#3B6FA0', separable: '#8A6BAE', reflexive: '#D4A017' };

function VerbModule({ ctx }) {
  const [activeVerb, setActiveVerb] = useState(null);
  const [quizMode, setQuizMode] = useState(false);
  const [quizVerb, setQuizVerb] = useState(null);
  const [quizPronoun, setQuizPronoun] = useState(null);
  const [quizInput, setQuizInput] = useState('');
  const [quizFeedback, setQuizFeedback] = useState(null);
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0 });

  const allVerbs = VERB_CATEGORIES.flatMap((c) => c.verbs.map((v) => ({ ...v, categoryId: c.id })));

  const startQuiz = () => {
    setQuizMode(true);
    setQuizScore({ correct: 0, total: 0 });
    nextQuizQuestion();
  };

  const nextQuizQuestion = () => {
    const verb = allVerbs[Math.floor(Math.random() * allVerbs.length)];
    const pronoun = PRONOUNS[Math.floor(Math.random() * PRONOUNS.length)];
    setQuizVerb(verb);
    setQuizPronoun(pronoun);
    setQuizInput('');
    setQuizFeedback(null);
  };

  const checkQuizAnswer = () => {
    const correct = quizVerb.present[quizPronoun].trim().toLowerCase();
    const given = quizInput.trim().toLowerCase();
    const isCorrect = given === correct;
    setQuizFeedback({ isCorrect, correct: quizVerb.present[quizPronoun] });
    setQuizScore((prev) => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));
    if (isCorrect) ctx.handleAddXP(4);
  };

  const endQuiz = () => {
    ctx.recordExercise('verbs', quizScore.correct, quizScore.total);
    setQuizMode(false);
    setQuizVerb(null);
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      <header style={{ marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 700, margin: 0 }}>Verben</h1>
          <p style={{ opacity: 0.7, marginTop: 6, fontSize: 15 }}>
            Konjugationstabellen, Beispiele und Mini-Quiz für die wichtigsten A2-Verbtypen.
          </p>
        </div>
        {!quizMode && (
          <button onClick={startQuiz} style={{
            padding: '10px 18px', borderRadius: 8, border: 'none', background: '#D4A017',
            color: '#1A2842', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
          }}>⚡ Konjugations-Quiz</button>
        )}
      </header>

      {quizMode ? (
        <div className="scrim-paper" style={{ padding: 28, maxWidth: 480 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, opacity: 0.6, marginBottom: 18, fontFamily: "'JetBrains Mono', monospace" }}>
            <span>Punktzahl: {quizScore.correct} / {quizScore.total}</span>
            <button onClick={endQuiz} style={{ border: 'none', background: 'transparent', color: '#B5533C', cursor: 'pointer', fontWeight: 600 }}>Beenden</button>
          </div>
          {quizVerb && (
            <>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 13, opacity: 0.6 }}>Konjugiere im Präsens:</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 700, marginTop: 4 }}>{quizVerb.inf}</div>
                <div style={{ fontSize: 13, opacity: 0.55 }}>({quizVerb.en})</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 16 }}>
                <span style={{ fontWeight: 700, fontSize: 17 }}>{PRONOUN_LABELS[quizPronoun]}</span>
                <input
                  value={quizInput}
                  onChange={(e) => setQuizInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !quizFeedback) checkQuizAnswer(); }}
                  disabled={!!quizFeedback}
                  placeholder="…"
                  style={{
                    padding: '8px 12px', borderRadius: 7, border: '2px solid rgba(26,40,66,0.2)',
                    fontSize: 16, width: 160, fontFamily: "'Inter', sans-serif",
                  }}
                  autoFocus
                />
              </div>
              {quizFeedback && (
                <div style={{
                  textAlign: 'center', padding: '10px', borderRadius: 8, marginBottom: 14, fontSize: 14,
                  background: quizFeedback.isCorrect ? 'rgba(91,140,90,0.15)' : 'rgba(181,83,60,0.15)',
                }}>
                  {quizFeedback.isCorrect ? '✓ Richtig!' : `✗ Richtig wäre: "${quizFeedback.correct}"`}
                </div>
              )}
              <div style={{ textAlign: 'center' }}>
                {!quizFeedback ? (
                  <button onClick={checkQuizAnswer} disabled={!quizInput.trim()} style={{
                    padding: '10px 22px', borderRadius: 8, border: 'none', background: '#1A2842',
                    color: '#F7F3EA', fontWeight: 700, cursor: 'pointer',
                  }}>Prüfen</button>
                ) : (
                  <button onClick={nextQuizQuestion} style={{
                    padding: '10px 22px', borderRadius: 8, border: 'none', background: '#D4A017',
                    color: '#1A2842', fontWeight: 700, cursor: 'pointer',
                  }}>Weiter →</button>
                )}
              </div>
            </>
          )}
        </div>
      ) : activeVerb ? (
        <VerbDetail verb={activeVerb} onBack={() => setActiveVerb(null)} />
      ) : (
        <div>
          {VERB_CATEGORIES.map((cat) => (
            <div key={cat.id} style={{ marginBottom: 26 }}>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: TYPE_COLORS[cat.id] || '#D4A017' }} />
                {cat.name}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {cat.verbs.map((v) => (
                  <button key={v.inf} onClick={() => setActiveVerb(v)} className="scrim-paper" style={{
                    textAlign: 'left', padding: '16px 18px', cursor: 'pointer', border: 'none',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 17, fontFamily: "'Fraunces', serif" }}>{v.inf}</div>
                    <div style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>{v.en}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VerbDetail({ verb, onBack }) {
  const playAudio = (text) => {
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'de-DE';
      utter.rate = 0.9;
      window.speechSynthesis.speak(utter);
    } catch (e) { /* unavailable */ }
  };

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'transparent', border: 'none', color: '#F7F3EA', opacity: 0.7,
        fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0,
      }}>← Zurück zur Liste</button>

      <div className="scrim-paper" style={{ padding: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, margin: 0 }}>{verb.inf}</h2>
          <button onClick={() => playAudio(verb.inf)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18 }}>🔊</button>
        </div>
        <div style={{ opacity: 0.65, marginBottom: 20, fontSize: 15 }}>{verb.en}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
          {PRONOUNS.map((p) => (
            <div key={p} style={{ padding: '10px 12px', background: 'rgba(26,40,66,0.04)', borderRadius: 8 }}>
              <div style={{ fontSize: 11.5, opacity: 0.55, fontFamily: "'JetBrains Mono', monospace" }}>{PRONOUN_LABELS[p]}</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginTop: 2 }}>{verb.present[p]}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11.5, opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Perfekt</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{verb.perfekt}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Präteritum</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{verb.praeteritum}</div>
          </div>
        </div>

        <div style={{ padding: '14px 16px', background: 'rgba(59,111,160,0.08)', borderRadius: 9, marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, opacity: 0.55, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Beispiel</div>
          <div style={{ fontStyle: 'italic', fontSize: 14.5 }}>{verb.example}</div>
        </div>

        <div style={{ padding: '14px 16px', background: 'rgba(181,83,60,0.08)', borderRadius: 9 }}>
          <div style={{ fontSize: 11.5, opacity: 0.55, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em' }}>⚠ Häufiger Fehler</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{verb.commonMistake}</div>
        </div>
      </div>
    </div>
  );
}


// ============ FROM GrammarModule.jsx ============





const CATEGORIES = [...new Set(GRAMMAR_TOPICS.map((t) => t.category))];

function GrammarModule({ ctx }) {
  const [activeTopic, setActiveTopic] = useState(null);
  const [practiceQs, setPracticeQs] = useState(null);
  const [loadingPractice, setLoadingPractice] = useState(false);
  const [practiceAnswers, setPracticeAnswers] = useState({});
  const [practiceSubmitted, setPracticeSubmitted] = useState(false);

  const generatePractice = async (topic) => {
    setLoadingPractice(true);
    setPracticeQs(null);
    setPracticeAnswers({});
    setPracticeSubmitted(false);
    const sys = `You are an ÖSD A2 German exam writer. Generate exam-style practice questions testing ONE specific grammar point, strictly at A2 level. Respond with ONLY valid JSON: {"questions": [{"q": "string (German sentence with a blank shown as ___, or an instruction)", "options": ["a","b","c","d"], "correct": 0, "explanation": "string in English"}]} — exactly 4 questions.`;
    const result = await callClaude(
      [{ role: 'user', content: `Topic: ${topic.name}. Explanation: ${topic.explanation} Generate 4 fresh multiple-choice practice questions (4 options each) testing this exact grammar point.` }],
      sys, 1200
    );
    const parsed = extractJSON(result);
    if (parsed && parsed.questions) {
      setPracticeQs(parsed.questions);
    } else {
      setPracticeQs([]);
    }
    setLoadingPractice(false);
  };

  const handlePracticeSelect = (qi, oi) => {
    if (practiceSubmitted) return;
    setPracticeAnswers((prev) => ({ ...prev, [qi]: oi }));
  };

  const submitPractice = () => {
    const correct = practiceQs.reduce((s, q, i) => s + (practiceAnswers[i] === q.correct ? 1 : 0), 0);
    setPracticeSubmitted(true);
    ctx.recordExercise(`grammar-${activeTopic.id}`, correct, practiceQs.length);
    ctx.handleAddXP(8 + correct * 4, 'Grammatik');
  };

  if (activeTopic) {
    return (
      <div style={{ animation: 'fadeIn 0.3s' }}>
        <button onClick={() => { setActiveTopic(null); setPracticeQs(null); }} style={{
          background: 'transparent', border: 'none', color: '#F7F3EA', opacity: 0.7,
          fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0,
        }}>← Zurück zur Übersicht</button>

        <div className="scrim-paper" style={{ padding: 26, marginBottom: 18 }}>
          <div style={{ fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", color: '#3B6FA0', fontWeight: 700, letterSpacing: '0.03em' }}>
            {activeTopic.category.toUpperCase()}
          </div>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 25, margin: '4px 0 14px' }}>{activeTopic.name}</h2>
          <p style={{ fontSize: 15, lineHeight: 1.65, marginBottom: 18 }}>{activeTopic.explanation}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeTopic.examples.map((ex, i) => (
              <div key={i} style={{ padding: '12px 16px', background: 'rgba(59,111,160,0.08)', borderRadius: 9 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{ex.de}</div>
                <div style={{ fontSize: 13, opacity: 0.65, marginTop: 2 }}>{ex.en}</div>
                <div style={{ fontSize: 12.5, opacity: 0.55, marginTop: 4, fontStyle: 'italic' }}>→ {ex.note}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="scrim-paper" style={{ padding: 26 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, margin: 0 }}>Übungsfragen</h3>
            {!practiceQs && (
              <button onClick={() => generatePractice(activeTopic)} disabled={loadingPractice} style={{
                padding: '9px 18px', borderRadius: 8, border: 'none', background: '#D4A017',
                color: '#1A2842', fontWeight: 700, fontSize: 13, cursor: loadingPractice ? 'default' : 'pointer',
              }}>
                {loadingPractice ? 'Wird erstellt …' : '✦ Übung generieren'}
              </button>
            )}
          </div>

          {practiceQs && practiceQs.length === 0 && (
            <p style={{ opacity: 0.6, fontSize: 14 }}>Übung konnte nicht erstellt werden. Bitte versuche es erneut.</p>
          )}

          {practiceQs && practiceQs.length > 0 && (
            <>
              {practiceQs.map((q, qi) => (
                <div key={qi} style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 10 }}>{qi + 1}. {q.q}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {q.options.map((opt, oi) => {
                      const isSelected = practiceAnswers[qi] === oi;
                      const isCorrect = oi === q.correct;
                      let bg = 'rgba(26,40,66,0.03)', border = '1px solid rgba(26,40,66,0.1)';
                      if (practiceSubmitted) {
                        if (isCorrect) { bg = 'rgba(91,140,90,0.18)'; border = '1px solid #5B8C5A'; }
                        else if (isSelected) { bg = 'rgba(181,83,60,0.15)'; border = '1px solid #B5533C'; }
                      } else if (isSelected) { bg = 'rgba(59,111,160,0.12)'; border = '1px solid #3B6FA0'; }
                      return (
                        <button key={oi} onClick={() => handlePracticeSelect(qi, oi)} disabled={practiceSubmitted} style={{
                          textAlign: 'left', padding: '10px 14px', borderRadius: 8, border, background: bg,
                          fontSize: 14, cursor: practiceSubmitted ? 'default' : 'pointer', color: '#1A2842',
                        }}>{opt}</button>
                      );
                    })}
                  </div>
                  {practiceSubmitted && (
                    <div style={{ marginTop: 8, fontSize: 13, padding: '8px 12px', background: 'rgba(0,0,0,0.04)', borderRadius: 7 }}>
                      <strong>Erklärung:</strong> {q.explanation}
                    </div>
                  )}
                </div>
              ))}
              {!practiceSubmitted ? (
                <button onClick={submitPractice} disabled={Object.keys(practiceAnswers).length < practiceQs.length} style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none',
                  background: Object.keys(practiceAnswers).length < practiceQs.length ? 'rgba(26,40,66,0.3)' : '#1A2842',
                  color: '#F7F3EA', fontWeight: 700, cursor: 'pointer',
                }}>Antworten prüfen</button>
              ) : (
                <button onClick={() => generatePractice(activeTopic)} style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none', background: '#D4A017',
                  color: '#1A2842', fontWeight: 700, cursor: 'pointer',
                }}>Neue Übung →</button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 700, margin: 0 }}>Grammatik-Akademie</h1>
        <p style={{ opacity: 0.7, marginTop: 6, fontSize: 15 }}>
          Alle wichtigen A2-Grammatikthemen mit Erklärungen, Beispielen und Übungen.
        </p>
      </header>

      {CATEGORIES.map((cat) => (
        <div key={cat} style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, marginBottom: 12, opacity: 0.9 }}>{cat}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {GRAMMAR_TOPICS.filter((t) => t.category === cat).map((t) => (
              <button key={t.id} onClick={() => setActiveTopic(t)} className="scrim-paper" style={{
                textAlign: 'left', padding: '16px 18px', cursor: 'pointer', border: 'none',
              }}>
                <div style={{ fontWeight: 700, fontSize: 15.5, fontFamily: "'Fraunces', serif" }}>{t.name}</div>
                <div style={{ fontSize: 12.5, opacity: 0.6, marginTop: 4, lineHeight: 1.4 }}>
                  {t.explanation.slice(0, 70)}…
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}


// ============ FROM QuizModule.jsx ============




const QUIZ_TYPES = [
  { id: 'multiple_choice', label: 'Multiple Choice', desc: 'Wähle die richtige Antwort' },
  { id: 'true_false', label: 'Richtig / Falsch', desc: 'Stimmt die Aussage?' },
  { id: 'fill_blank', label: 'Lücke füllen', desc: 'Ergänze das fehlende Wort' },
  { id: 'word_order', label: 'Wortstellung', desc: 'Bringe die Wörter in die richtige Reihenfolge' },
  { id: 'grammar_correction', label: 'Fehler finden', desc: 'Korrigiere den Grammatikfehler' },
  { id: 'matching', label: 'Paare zuordnen', desc: 'Verbinde zusammenpassende Begriffe' },
];

const SCHEMAS = {
  multiple_choice: `{"items": [{"prompt": "German sentence/question with context", "options": ["a","b","c","d"], "correct": 0, "explanation": "English explanation"}]}`,
  true_false: `{"items": [{"prompt": "A German statement", "correct": true, "explanation": "English explanation of why true/false"}]}`,
  fill_blank: `{"items": [{"prompt": "German sentence with ___ for the blank", "answer": "the correct word/phrase", "hint": "English hint", "explanation": "English explanation"}]}`,
  word_order: `{"items": [{"words": ["word1","word2","word3","..."], "correct_sentence": "the correctly ordered German sentence", "translation": "English translation"}]}`,
  grammar_correction: `{"items": [{"incorrect": "German sentence with one grammar error", "correct": "the corrected sentence", "explanation": "English explanation of the error"}]}`,
  matching: `{"items": [{"pairs": [{"left":"German word","right":"English meaning"}, ...]}] }`, // single item with 5-6 pairs
};

function QuizModule({ ctx }) {
  const [selectedType, setSelectedType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [quizData, setQuizData] = useState(null);
  const [topic, setTopic] = useState('gemischte A2-Themen (Alltag, Reisen, Arbeit, Familie)');

  const generateQuiz = async (typeId) => {
    setLoading(true);
    setSelectedType(typeId);
    setQuizData(null);
    const count = typeId === 'matching' ? 1 : 5;
    const sys = `You are an ÖSD A2 German exam quiz generator. Strictly A1-A2 vocabulary and grammar. Respond with ONLY valid JSON matching this schema exactly: ${SCHEMAS[typeId]}. Generate ${count} item(s)${typeId === 'matching' ? ' with 6 pairs' : ''}. Make it feel like real exam difficulty, not trivially easy.`;
    const result = await callClaude(
      [{ role: 'user', content: `Topic focus: ${topic}. Generate the quiz now as pure JSON.` }],
      sys, 1500
    );
    const parsed = extractJSON(result);
    setQuizData(parsed && parsed.items ? parsed.items : null);
    setLoading(false);
  };

  if (selectedType && (quizData || loading)) {
    return (
      <QuizRunner
        typeId={selectedType}
        items={quizData}
        loading={loading}
        onExit={() => { setSelectedType(null); setQuizData(null); }}
        onRegenerate={() => generateQuiz(selectedType)}
        ctx={ctx}
      />
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 700, margin: 0 }}>Quiz-Engine</h1>
        <p style={{ opacity: 0.7, marginTop: 6, fontSize: 15 }}>
          Frisch generierte Übungen in verschiedenen Formaten — nie zweimal genau dieselbe Frage.
        </p>
      </header>

      <div className="scrim-paper" style={{ padding: 20, marginBottom: 20 }}>
        <label style={{ fontSize: 12.5, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: 8 }}>
          Themenschwerpunkt (optional)
        </label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="z.B. Reisen, Wechselpräpositionen, Perfekt..."
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,40,66,0.15)',
            fontSize: 14, fontFamily: "'Inter', sans-serif",
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {QUIZ_TYPES.map((qt) => (
          <button key={qt.id} onClick={() => generateQuiz(qt.id)} className="scrim-paper" style={{
            textAlign: 'left', padding: '18px 20px', cursor: 'pointer', border: 'none',
          }}>
            <div style={{ fontWeight: 700, fontSize: 16, fontFamily: "'Fraunces', serif" }}>{qt.label}</div>
            <div style={{ fontSize: 12.5, opacity: 0.6, marginTop: 4 }}>{qt.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function QuizRunner({ typeId, items, loading, onExit, onRegenerate, ctx }) {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);

  if (loading) {
    return (
      <div className="scrim-paper" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 15, opacity: 0.7 }}>Quiz wird erstellt …</div>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="scrim-paper" style={{ padding: 30, textAlign: 'center' }}>
        <p style={{ marginBottom: 16 }}>Das Quiz konnte nicht erstellt werden.</p>
        <button onClick={onRegenerate} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#D4A017', color: '#1A2842', fontWeight: 700, cursor: 'pointer' }}>Erneut versuchen</button>
        <button onClick={onExit} style={{ marginLeft: 10, padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(247,243,234,0.25)', background: 'transparent', color: '#F7F3EA', cursor: 'pointer' }}>Zurück</button>
      </div>
    );
  }

  const handleResult = (correct) => {
    if (correct) { setScore((s) => s + 1); ctx.handleAddXP(5); }
    setHintLevel(0);
    if (idx + 1 >= items.length) {
      setDone(true);
      ctx.recordExercise(`quiz-${typeId}`, score + (correct ? 1 : 0), items.length);
    } else {
      setIdx((i) => i + 1);
    }
  };

  if (done) {
    return (
      <div className="scrim-paper" style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>{score === items.length ? '🏆' : '✓'}</div>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, margin: '0 0 6px' }}>{score} / {items.length} richtig</h2>
        <p style={{ opacity: 0.65, marginBottom: 20 }}>Gut gemacht — weiter so!</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onExit} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(26,40,66,0.15)', background: 'transparent', color: '#1A2842', fontWeight: 600, cursor: 'pointer' }}>Zur Übersicht</button>
          <button onClick={onRegenerate} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#D4A017', color: '#1A2842', fontWeight: 700, cursor: 'pointer' }}>Neue Runde</button>
        </div>
      </div>
    );
  }

  const item = items[idx];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <button onClick={onExit} style={{ background: 'transparent', border: 'none', color: '#F7F3EA', opacity: 0.7, fontSize: 13, cursor: 'pointer', padding: 0 }}>← Beenden</button>
        <span style={{ fontSize: 12.5, opacity: 0.6, fontFamily: "'JetBrains Mono', monospace" }}>Frage {idx + 1} / {items.length} · {score} richtig</span>
      </div>

      <div className="scrim-paper" style={{ padding: 28 }}>
        {typeId === 'multiple_choice' && <MultipleChoiceItem item={item} onResult={handleResult} hintLevel={hintLevel} setHintLevel={setHintLevel} />}
        {typeId === 'true_false' && <TrueFalseItem item={item} onResult={handleResult} />}
        {typeId === 'fill_blank' && <FillBlankItem item={item} onResult={handleResult} hintLevel={hintLevel} setHintLevel={setHintLevel} />}
        {typeId === 'word_order' && <WordOrderItem item={item} onResult={handleResult} />}
        {typeId === 'grammar_correction' && <GrammarCorrectionItem item={item} onResult={handleResult} hintLevel={hintLevel} setHintLevel={setHintLevel} />}
        {typeId === 'matching' && <MatchingItem item={item} onResult={handleResult} />}
      </div>
    </div>
  );
}

function MultipleChoiceItem({ item, onResult, hintLevel, setHintLevel }) {
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16, lineHeight: 1.5 }}>{item.prompt}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {item.options.map((opt, oi) => {
          let bg = 'rgba(26,40,66,0.03)', border = '1px solid rgba(26,40,66,0.1)';
          if (submitted) {
            if (oi === item.correct) { bg = 'rgba(91,140,90,0.18)'; border = '1px solid #5B8C5A'; }
            else if (oi === selected) { bg = 'rgba(181,83,60,0.15)'; border = '1px solid #B5533C'; }
          } else if (oi === selected) { bg = 'rgba(59,111,160,0.12)'; border = '1px solid #3B6FA0'; }
          return (
            <button key={oi} onClick={() => !submitted && setSelected(oi)} disabled={submitted} style={{
              textAlign: 'left', padding: '10px 14px', borderRadius: 8, border, background: bg,
              fontSize: 14, cursor: submitted ? 'default' : 'pointer', color: '#1A2842',
            }}>{opt}</button>
          );
        })}
      </div>
      {!submitted && (
        <button onClick={() => setHintLevel((h) => h + 1)} style={{ fontSize: 12, border: 'none', background: 'transparent', color: '#1A2842', opacity: 0.55, cursor: 'pointer', marginBottom: 10, padding: 0 }}>
          💡 Hinweis anzeigen
        </button>
      )}
      {!submitted && hintLevel > 0 && (
        <div style={{ fontSize: 12.5, padding: '8px 12px', background: 'rgba(212,160,23,0.1)', borderRadius: 7, marginBottom: 12 }}>
          {hintLevel === 1 ? `Es gibt ${item.options.length} Möglichkeiten — lies den Satz noch einmal genau.` : `Die richtige Antwort beginnt mit "${item.options[item.correct].slice(0, 3)}…"`}
        </div>
      )}
      {submitted && <div style={{ fontSize: 13, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', borderRadius: 7, marginBottom: 14 }}><strong>Erklärung:</strong> {item.explanation}</div>}
      <ActionButton submitted={submitted} canSubmit={selected !== null} onSubmit={() => setSubmitted(true)} onNext={() => onResult(selected === item.correct)} />
    </div>
  );
}

function TrueFalseItem({ item, onResult }) {
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 18, lineHeight: 1.5 }}>{item.prompt}</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        {[true, false].map((val) => {
          const label = val ? 'Richtig' : 'Falsch';
          let bg = 'rgba(26,40,66,0.03)', border = '1px solid rgba(26,40,66,0.1)';
          if (submitted) {
            if (val === item.correct) { bg = 'rgba(91,140,90,0.18)'; border = '1px solid #5B8C5A'; }
            else if (val === selected) { bg = 'rgba(181,83,60,0.15)'; border = '1px solid #B5533C'; }
          } else if (val === selected) { bg = 'rgba(59,111,160,0.12)'; border = '1px solid #3B6FA0'; }
          return (
            <button key={label} onClick={() => !submitted && setSelected(val)} disabled={submitted} style={{
              flex: 1, padding: '12px 0', borderRadius: 8, border, background: bg,
              fontSize: 14.5, fontWeight: 600, cursor: submitted ? 'default' : 'pointer', color: '#1A2842',
            }}>{label}</button>
          );
        })}
      </div>
      {submitted && <div style={{ fontSize: 13, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', borderRadius: 7, marginBottom: 14 }}><strong>Erklärung:</strong> {item.explanation}</div>}
      <ActionButton submitted={submitted} canSubmit={selected !== null} onSubmit={() => setSubmitted(true)} onNext={() => onResult(selected === item.correct)} />
    </div>
  );
}

function FillBlankItem({ item, onResult, hintLevel, setHintLevel }) {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const isCorrect = input.trim().toLowerCase() === item.answer.trim().toLowerCase();
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16, lineHeight: 1.5 }}>{item.prompt}</div>
      <input
        value={input} onChange={(e) => setInput(e.target.value)} disabled={submitted}
        placeholder="Antwort eingeben…"
        onKeyDown={(e) => { if (e.key === 'Enter' && !submitted && input.trim()) setSubmitted(true); }}
        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '2px solid rgba(26,40,66,0.15)', fontSize: 15, marginBottom: 12 }}
      />
      {!submitted && (
        <button onClick={() => setHintLevel((h) => h + 1)} style={{ fontSize: 12, border: 'none', background: 'transparent', color: '#1A2842', opacity: 0.55, cursor: 'pointer', marginBottom: 10, padding: 0, display: 'block' }}>
          💡 Hinweis anzeigen
        </button>
      )}
      {!submitted && hintLevel > 0 && (
        <div style={{ fontSize: 12.5, padding: '8px 12px', background: 'rgba(212,160,23,0.1)', borderRadius: 7, marginBottom: 12 }}>
          {hintLevel === 1 ? item.hint : `Die Antwort hat ${item.answer.length} Buchstaben und beginnt mit "${item.answer[0]}".`}
        </div>
      )}
      {submitted && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: isCorrect ? '#5B8C5A' : '#B5533C', marginBottom: 6 }}>
            {isCorrect ? '✓ Richtig!' : `✗ Richtige Antwort: "${item.answer}"`}
          </div>
          <div style={{ fontSize: 13, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', borderRadius: 7 }}><strong>Erklärung:</strong> {item.explanation}</div>
        </div>
      )}
      <ActionButton submitted={submitted} canSubmit={input.trim().length > 0} onSubmit={() => setSubmitted(true)} onNext={() => onResult(isCorrect)} />
    </div>
  );
}

function WordOrderItem({ item, onResult }) {
  const [pool, setPool] = useState(() => [...item.words].sort(() => Math.random() - 0.5));
  const [chosen, setChosen] = useState([]);
  const [submitted, setSubmitted] = useState(false);

  const moveToChosen = (i) => {
    if (submitted) return;
    setChosen((c) => [...c, pool[i]]);
    setPool((p) => p.filter((_, idx) => idx !== i));
  };
  const moveToPool = (i) => {
    if (submitted) return;
    setPool((p) => [...p, chosen[i]]);
    setChosen((c) => c.filter((_, idx) => idx !== i));
  };

  const userSentence = chosen.join(' ');
  const normalize = (s) => s.trim().toLowerCase().replace(/[.,!?]/g, '').replace(/\s+/g, ' ');
  const reallyCorrect = normalize(userSentence) === normalize(item.correct_sentence);

  return (
    <div>
      <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 14 }}>Bringe die Wörter in die richtige Reihenfolge:</div>
      <div style={{ minHeight: 50, padding: 12, border: '2px dashed rgba(26,40,66,0.2)', borderRadius: 9, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {chosen.map((w, i) => (
          <button key={i} onClick={() => moveToPool(i)} disabled={submitted} style={{
            padding: '6px 12px', borderRadius: 6, border: 'none', background: '#1A2842', color: '#F7F3EA',
            fontSize: 14, cursor: submitted ? 'default' : 'pointer',
          }}>{w}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {pool.map((w, i) => (
          <button key={i} onClick={() => moveToChosen(i)} disabled={submitted} style={{
            padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(26,40,66,0.2)', background: 'rgba(26,40,66,0.04)',
            color: '#1A2842', fontSize: 14, cursor: submitted ? 'default' : 'pointer',
          }}>{w}</button>
        ))}
      </div>
      {submitted && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: reallyCorrect ? '#5B8C5A' : '#B5533C', marginBottom: 6 }}>
            {reallyCorrect ? '✓ Richtig!' : `✗ Richtig wäre: "${item.correct_sentence}"`}
          </div>
          <div style={{ fontSize: 13, opacity: 0.6, fontStyle: 'italic' }}>{item.translation}</div>
        </div>
      )}
      <ActionButton submitted={submitted} canSubmit={pool.length === 0} onSubmit={() => setSubmitted(true)} onNext={() => onResult(reallyCorrect)} />
    </div>
  );
}

function GrammarCorrectionItem({ item, onResult, hintLevel, setHintLevel }) {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const normalize = (s) => s.trim().toLowerCase().replace(/[.,!?]/g, '').replace(/\s+/g, ' ');
  const isCorrect = normalize(input) === normalize(item.correct);
  return (
    <div>
      <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 8 }}>Finde und korrigiere den Fehler:</div>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16, padding: '10px 14px', background: 'rgba(181,83,60,0.08)', borderRadius: 8 }}>{item.incorrect}</div>
      <input
        value={input} onChange={(e) => setInput(e.target.value)} disabled={submitted}
        placeholder="Korrigierter Satz…"
        onKeyDown={(e) => { if (e.key === 'Enter' && !submitted && input.trim()) setSubmitted(true); }}
        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '2px solid rgba(26,40,66,0.15)', fontSize: 15, marginBottom: 12 }}
      />
      {!submitted && (
        <button onClick={() => setHintLevel((h) => h + 1)} style={{ fontSize: 12, border: 'none', background: 'transparent', color: '#1A2842', opacity: 0.55, cursor: 'pointer', marginBottom: 10, padding: 0, display: 'block' }}>
          💡 Hinweis anzeigen
        </button>
      )}
      {!submitted && hintLevel > 0 && (
        <div style={{ fontSize: 12.5, padding: '8px 12px', background: 'rgba(212,160,23,0.1)', borderRadius: 7, marginBottom: 12 }}>
          {item.explanation.split('.')[0]}.
        </div>
      )}
      {submitted && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: isCorrect ? '#5B8C5A' : '#B5533C', marginBottom: 6 }}>
            {isCorrect ? '✓ Richtig!' : `✗ Richtig wäre: "${item.correct}"`}
          </div>
          <div style={{ fontSize: 13, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', borderRadius: 7 }}><strong>Erklärung:</strong> {item.explanation}</div>
        </div>
      )}
      <ActionButton submitted={submitted} canSubmit={input.trim().length > 0} onSubmit={() => setSubmitted(true)} onNext={() => onResult(isCorrect)} />
    </div>
  );
}

function MatchingItem({ item, onResult }) {
  const [leftOrder] = useState(() => item.pairs.map((p) => p.left));
  const [rightOrder] = useState(() => [...item.pairs.map((p) => p.right)].sort(() => Math.random() - 0.5));
  const [matches, setMatches] = useState({});
  const [activeLeft, setActiveLeft] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const selectLeft = (left) => { if (!submitted) setActiveLeft(left); };
  const selectRight = (right) => {
    if (submitted || !activeLeft) return;
    setMatches((m) => ({ ...m, [activeLeft]: right }));
    setActiveLeft(null);
  };
  const correctCount = item.pairs.filter((p) => matches[p.left] === p.right).length;

  return (
    <div>
      <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 14 }}>Tippe ein deutsches Wort an, dann die passende Übersetzung:</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {leftOrder.map((l) => {
            const matched = matches[l];
            const isCorrectMatch = submitted && item.pairs.find((p) => p.left === l)?.right === matched;
            return (
              <button key={l} onClick={() => selectLeft(l)} disabled={submitted} style={{
                padding: '9px 12px', borderRadius: 7, textAlign: 'left', fontSize: 13.5,
                border: activeLeft === l ? '2px solid #D4A017' : '1px solid rgba(26,40,66,0.15)',
                background: submitted ? (isCorrectMatch ? 'rgba(91,140,90,0.18)' : matched ? 'rgba(181,83,60,0.15)' : 'transparent') : (matched ? 'rgba(59,111,160,0.1)' : 'transparent'),
                color: '#1A2842', cursor: submitted ? 'default' : 'pointer',
              }}>
                {l}{matched ? ` → ${matched}` : ''}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rightOrder.map((r) => {
            const usedBy = Object.entries(matches).find(([, v]) => v === r);
            return (
              <button key={r} onClick={() => selectRight(r)} disabled={submitted || !!usedBy} style={{
                padding: '9px 12px', borderRadius: 7, textAlign: 'left', fontSize: 13.5,
                border: '1px solid rgba(26,40,66,0.15)', background: usedBy ? 'rgba(26,40,66,0.06)' : 'transparent',
                color: '#1A2842', cursor: submitted || usedBy ? 'default' : 'pointer', opacity: usedBy ? 0.5 : 1,
              }}>{r}</button>
            );
          })}
        </div>
      </div>
      {submitted && (
        <div style={{ marginTop: 16, fontSize: 13.5, fontWeight: 600, color: correctCount === item.pairs.length ? '#5B8C5A' : '#1A2842' }}>
          {correctCount} / {item.pairs.length} richtig zugeordnet
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <ActionButton submitted={submitted} canSubmit={Object.keys(matches).length === item.pairs.length} onSubmit={() => setSubmitted(true)} onNext={() => onResult(correctCount === item.pairs.length)} />
      </div>
    </div>
  );
}

function ActionButton({ submitted, canSubmit, onSubmit, onNext }) {
  if (!submitted) {
    return (
      <button onClick={onSubmit} disabled={!canSubmit} style={{
        padding: '10px 22px', borderRadius: 8, border: 'none',
        background: canSubmit ? '#1A2842' : 'rgba(26,40,66,0.3)', color: '#F7F3EA',
        fontWeight: 700, fontSize: 14, cursor: canSubmit ? 'pointer' : 'default',
      }}>Prüfen</button>
    );
  }
  return (
    <button onClick={onNext} style={{
      padding: '10px 22px', borderRadius: 8, border: 'none', background: '#D4A017',
      color: '#1A2842', fontWeight: 700, fontSize: 14, cursor: 'pointer',
    }}>Weiter →</button>
  );
}


// ============ FROM ExamModule.jsx ============





const EXAM_SYSTEM = `You are an ÖSD A2 exam creator. Generate a complete mock "Lesen" (reading) exam section with 4 short texts of increasing difficulty (advertisement, email, forum post, notice/announcement), each with 2-3 multiple choice questions (4 options). Strictly A1-A2 level vocabulary and grammar. Respond with ONLY valid JSON: {"texts": [{"type":"string","title":"string","text":"string (60-100 words)","questions":[{"q":"string","options":["a","b","c","d"],"correct":0,"explanation":"string in English"}]}]} — exactly 4 texts.`;

const EXAM_DURATION_SECONDS = 25 * 60; // 25 minutes, realistic for an A2 Lesen section subset

function ExamModule({ ctx }) {
  const [stage, setStage] = useState('intro'); // intro | loading | running | review
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(EXAM_DURATION_SECONDS);
  const [textIdx, setTextIdx] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (stage === 'running') {
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) { clearInterval(timerRef.current); finishExam(); return 0; }
          return t - 1;
        });
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [stage]);

  const startExam = async () => {
    setStage('loading');
    const result = await callClaude([{ role: 'user', content: 'Generate a fresh ÖSD A2 mock Lesen exam now as pure JSON.' }], EXAM_SYSTEM, 2200);
    const parsed = extractJSON(result);
    if (parsed && parsed.texts && parsed.texts.length > 0) {
      setExam(parsed.texts);
    } else {
      // fallback to bank
      setExam(READING_TEXTS.slice(0, 4));
    }
    setAnswers({});
    setTextIdx(0);
    setTimeLeft(EXAM_DURATION_SECONDS);
    setStage('running');
  };

  const finishExam = () => {
    clearInterval(timerRef.current);
    setStage('review');
    const flatQs = exam.flatMap((t, ti) => t.questions.map((q, qi) => ({ key: `${ti}-${qi}`, correct: q.correct })));
    const correctCount = flatQs.reduce((s, q) => s + (answers[q.key] === q.correct ? 1 : 0), 0);
    ctx.recordExercise('mock-exam', correctCount, flatQs.length);
    ctx.recordMockExam();
    ctx.handleAddXP(30 + correctCount * 5, 'Prüfungssimulation');
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  if (stage === 'intro') {
    return (
      <div style={{ animation: 'fadeIn 0.3s' }}>
        <header style={{ marginBottom: 22 }}>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 700, margin: 0 }}>Prüfungssimulation</h1>
          <p style={{ opacity: 0.7, marginTop: 6, fontSize: 15 }}>Ein vollständiger Mock-Test im ÖSD-A2-Stil, unter realistischen Zeitbedingungen.</p>
        </header>
        <div className="scrim-paper" style={{ padding: 28, maxWidth: 560 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, margin: '0 0 14px' }}>Was dich erwartet</h2>
          <ul style={{ fontSize: 14.5, lineHeight: 1.8, paddingLeft: 20, marginBottom: 20 }}>
            <li>4 Texte im ÖSD-Stil, steigende Schwierigkeit</li>
            <li>Insgesamt etwa 10 Fragen zum Textverständnis</li>
            <li>Zeitlimit: {EXAM_DURATION_SECONDS / 60} Minuten</li>
            <li>Detaillierte Auswertung am Ende</li>
          </ul>
          <button onClick={startExam} style={{
            padding: '12px 24px', borderRadius: 9, border: 'none', background: '#D4A017',
            color: '#1A2842', fontWeight: 700, fontSize: 15, cursor: 'pointer',
          }}>Prüfung starten</button>
        </div>
      </div>
    );
  }

  if (stage === 'loading') {
    return (
      <div className="scrim-paper" style={{ padding: 50, textAlign: 'center', maxWidth: 480, margin: '40px auto' }}>
        <div style={{ fontSize: 15, opacity: 0.7 }}>Deine Prüfung wird vorbereitet …</div>
      </div>
    );
  }

  if (stage === 'running' && exam) {
    const currentText = exam[textIdx];
    const isLast = textIdx === exam.length - 1;
    const allAnsweredForText = currentText.questions.every((_, qi) => answers[`${textIdx}-${qi}`] !== undefined);

    return (
      <div style={{ animation: 'fadeIn 0.3s' }}>
        <div style={{
          position: 'sticky', top: 0, zIndex: 5, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: '10px 16px', background: '#1A2842', marginBottom: 18,
          borderRadius: 10, border: '1px solid rgba(247,243,234,0.1)',
        }}>
          <span style={{ fontSize: 13, opacity: 0.7 }}>Text {textIdx + 1} / {exam.length}</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 16,
            color: timeLeft < 60 ? '#B5533C' : '#D4A017',
          }}>⏱ {formatTime(timeLeft)}</span>
        </div>

        <div className="scrim-paper" style={{ padding: 26, marginBottom: 18 }}>
          <div style={{ fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", color: '#B5533C', fontWeight: 600 }}>{currentText.type?.toUpperCase()}</div>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, margin: '4px 0 14px' }}>{currentText.title}</h2>
          <p style={{ fontSize: 16, lineHeight: 1.7, fontFamily: "'Fraunces', serif" }}>{currentText.text}</p>
        </div>

        <div className="scrim-paper" style={{ padding: 26 }}>
          {currentText.questions.map((q, qi) => {
            const key = `${textIdx}-${qi}`;
            return (
              <div key={qi} style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 10 }}>{qi + 1}. {q.q}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {q.options.map((opt, oi) => (
                    <button key={oi} onClick={() => setAnswers((a) => ({ ...a, [key]: oi }))} style={{
                      textAlign: 'left', padding: '10px 14px', borderRadius: 8, fontSize: 14, cursor: 'pointer', color: '#1A2842',
                      border: answers[key] === oi ? '1px solid #3B6FA0' : '1px solid rgba(26,40,66,0.1)',
                      background: answers[key] === oi ? 'rgba(59,111,160,0.12)' : 'rgba(26,40,66,0.03)',
                    }}>{opt}</button>
                  ))}
                </div>
              </div>
            );
          })}
          <button
            onClick={() => isLast ? finishExam() : setTextIdx((i) => i + 1)}
            disabled={!allAnsweredForText}
            style={{
              padding: '11px 24px', borderRadius: 9, border: 'none',
              background: allAnsweredForText ? '#1A2842' : 'rgba(26,40,66,0.3)', color: '#F7F3EA',
              fontWeight: 700, fontSize: 14, cursor: allAnsweredForText ? 'pointer' : 'default',
            }}
          >
            {isLast ? 'Prüfung abschließen' : 'Nächster Text →'}
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'review' && exam) {
    const flatQs = exam.flatMap((t, ti) => t.questions.map((q, qi) => ({ ...q, key: `${ti}-${qi}`, textTitle: t.title })));
    const correctCount = flatQs.reduce((s, q) => s + (answers[q.key] === q.correct ? 1 : 0), 0);
    const pct = Math.round((correctCount / flatQs.length) * 100);
    let verdict = 'Übe weiter — du machst Fortschritte!';
    if (pct >= 80) verdict = 'Ausgezeichnet! Du bist bereit für die echte Prüfung.';
    else if (pct >= 60) verdict = 'Solide Leistung. Noch etwas Übung und du bist bereit.';

    return (
      <div style={{ animation: 'fadeIn 0.3s' }}>
        <header style={{ marginBottom: 22 }}>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, margin: 0 }}>Ergebnis</h1>
        </header>
        <div className="scrim-paper" style={{ padding: 28, marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 44, fontWeight: 700, color: pct >= 60 ? '#5B8C5A' : '#B5533C' }}>{pct}%</div>
          <div style={{ fontSize: 14, opacity: 0.65, marginBottom: 4 }}>{correctCount} von {flatQs.length} Fragen richtig</div>
          <p style={{ fontSize: 15, marginTop: 14 }}>{verdict}</p>
        </div>

        <div className="scrim-paper" style={{ padding: 26 }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, margin: '0 0 16px' }}>Detaillierte Auswertung</h3>
          {flatQs.map((q, i) => {
            const isCorrect = answers[q.key] === q.correct;
            return (
              <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < flatQs.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
                <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 4 }}>{q.textTitle}</div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                  {isCorrect ? '✓ ' : '✗ '}{q.q}
                </div>
                {!isCorrect && (
                  <div style={{ fontSize: 13, marginBottom: 4 }}>
                    Deine Antwort: <span style={{ color: '#B5533C' }}>{q.options[answers[q.key]] ?? '(keine)'}</span><br/>
                    Richtig: <span style={{ color: '#5B8C5A' }}>{q.options[q.correct]}</span>
                  </div>
                )}
                <div style={{ fontSize: 12.5, opacity: 0.65 }}>{q.explanation}</div>
              </div>
            );
          })}
          <button onClick={() => setStage('intro')} style={{
            marginTop: 8, padding: '10px 20px', borderRadius: 8, border: 'none', background: '#D4A017',
            color: '#1A2842', fontWeight: 700, cursor: 'pointer',
          }}>Neue Prüfung</button>
        </div>
      </div>
    );
  }

  return null;
}


// ============ FROM TutorModule.jsx ============



const TUTOR_SYSTEM = `You are a warm, encouraging, expert German tutor specializing in ÖSD A2 exam preparation. The student is studying for the ÖSD A2 exam and especially struggles with the Lesen (reading) section. Your job:
- Explain German grammar simply and clearly, using short examples
- Answer questions about German (in German or English as appropriate to the student's level)
- Correct mistakes gently, explaining WHY something is wrong
- Translate phrases when asked
- Quiz the student or create small personalized exercises on request, formatted clearly
- Keep responses focused and not overly long — this is a chat, not an essay
- Use occasional simple German phrases naturally, but always make sure the student can follow
- If asked to "simulate an examiner," adopt a brief, exam-style tone and ask ÖSD A2-style questions one at a time
Stay encouraging but honest about mistakes. Use markdown formatting (bold, lists) where it helps clarity.`;

const SUGGESTED_PROMPTS = [
  'Erkläre mir den Unterschied zwischen "weil" und "denn".',
  'Korrigiere diesen Satz: "Ich habe gestern nach Wien gefahren."',
  'Gib mir 3 Übungssätze mit Wechselpräpositionen.',
  'Simuliere eine mündliche Prüfungsfrage.',
  'Was bedeutet "Mülltrennung"?',
  'Warum benutzt man Dativ nach "helfen"?',
];

function TutorModule({ ctx }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hallo! Ich bin dein KI-Tutor für die ÖSD-A2-Prüfung. 👋\n\nIch kann dir Grammatik erklären, Fehler korrigieren, Sätze übersetzen oder eine Mini-Prüfung simulieren. Was möchtest du heute üben?' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text) => {
    const userMsg = text ?? input;
    if (!userMsg.trim() || loading) return;
    const newMessages = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    // Inform the tutor about weak areas for personalization, lightly
    const weakTopics = Object.entries(ctx.stats.topicAccuracy)
      .filter(([, v]) => v.total >= 2 && v.correct / v.total < 0.6)
      .map(([k]) => k);
    const contextNote = weakTopics.length > 0
      ? `\n\n[Context for tutor only, do not mention unless relevant: student struggles with: ${weakTopics.join(', ')}]`
      : '';

    const apiMessages = newMessages.map((m, i) => ({
      role: m.role,
      content: i === newMessages.length - 1 ? m.content + contextNote : m.content,
    }));

    const result = await callClaude(apiMessages, TUTOR_SYSTEM, 800);
    setMessages((prev) => [...prev, { role: 'assistant', content: result || 'Entschuldigung, da ist etwas schiefgelaufen. Versuch es bitte noch einmal.' }]);
    setLoading(false);
    ctx.handleAddXP(2);
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, margin: 0 }}>KI-Tutor</h1>
        <p style={{ opacity: 0.7, marginTop: 4, fontSize: 14 }}>Dein persönlicher Deutschlehrer — frag alles, jederzeit.</p>
      </header>

      <div ref={scrollRef} className="scrim-paper" style={{
        flex: 1, padding: 22, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14,
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '80%', padding: '11px 16px', borderRadius: 12, fontSize: 14.5, lineHeight: 1.55,
              background: m.role === 'user' ? '#1A2842' : 'rgba(26,40,66,0.06)',
              color: m.role === 'user' ? '#F7F3EA' : '#2A2419',
              whiteSpace: 'pre-wrap',
            }}>
              <FormattedMessage text={m.content} />
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '11px 16px', borderRadius: 12, background: 'rgba(26,40,66,0.06)', fontSize: 14 }}>
              <em style={{ opacity: 0.6 }}>tippt …</em>
            </div>
          </div>
        )}
      </div>

      {messages.length <= 2 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {SUGGESTED_PROMPTS.map((p, i) => (
            <button key={i} onClick={() => send(p)} style={{
              padding: '7px 13px', borderRadius: 20, border: '1px solid rgba(247,243,234,0.25)',
              background: 'transparent', color: '#F7F3EA', fontSize: 12.5, cursor: 'pointer',
            }}>{p}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Schreib deine Frage auf Deutsch oder Englisch…"
          style={{
            flex: 1, padding: '13px 16px', borderRadius: 10, border: '1px solid rgba(247,243,234,0.2)',
            background: 'rgba(247,243,234,0.06)', color: '#F7F3EA', fontSize: 14.5, fontFamily: "'Inter', sans-serif",
          }}
        />
        <button onClick={() => send()} disabled={loading || !input.trim()} style={{
          padding: '0 22px', borderRadius: 10, border: 'none',
          background: input.trim() && !loading ? '#D4A017' : 'rgba(212,160,23,0.4)',
          color: '#1A2842', fontWeight: 700, fontSize: 14, cursor: input.trim() && !loading ? 'pointer' : 'default',
        }}>Senden</button>
      </div>
    </div>
  );
}

function FormattedMessage({ text }) {
  // Lightweight markdown: bold (**), bullet lists (- or *)
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        const rendered = parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p
        );
        return <div key={i}>{rendered}</div>;
      })}
    </>
  );
}

export default App;
