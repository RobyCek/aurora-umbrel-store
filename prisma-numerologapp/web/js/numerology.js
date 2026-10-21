export const LETTER_VALUES = Object.freeze({
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 8, G: 3, H: 5, I: 1,
  J: 1, K: 2, L: 3, M: 4, N: 5, O: 7, P: 8, Q: 1, R: 2,
  S: 3, T: 4, U: 6, V: 6, W: 6, X: 5, Y: 1, Z: 7,
});

export const NUMBER_PLANET = Object.freeze({
  1: 'Sole', 2: 'Luna', 3: 'Giove', 4: 'Urano', 5: 'Mercurio',
  6: 'Venere', 7: 'Nettuno', 8: 'Saturno', 9: 'Marte',
});

export const COLOR_HEX = Object.freeze({
  rosso: '#e53935', nero: '#1a1a1a', giallo: '#fdd835',
  'giallo chiaro': '#fff59d', 'giallo grano': '#f0d080',
  'giallo brillante': '#ffe000', oro: '#d4a017', rame: '#b87333',
  verde: '#43a047', 'verde chiaro': '#a5d6a7', 'verde scuro': '#1b5e20',
  blu: '#1e88e5', 'blu chiaro': '#64b5f6', 'blu scuro': '#0d47a1',
  'blu brillante': '#2979ff', celeste: '#80deea', viola: '#8e24aa',
  lilla: '#ce93d8', rosa: '#f48fb1', arancione: '#fb8c00',
  'bianco perla': '#f5f5f0', 'bianco perlato': '#f0ece4',
  grigio: '#9e9e9e', 'grigio chiaro': '#e0e0e0', 'grigio fumo': '#607d8b',
  'caffè': '#6d4c41', sandalo: '#c8a87a', tutti: '#ffffff', nessuno: null,
});

const SPECIAL_LETTERS = Object.freeze({
  Ł: 'L', Đ: 'D', Ð: 'D', Þ: 'TH', Æ: 'AE', Œ: 'OE', Ø: 'O',
});

export function normalizeName(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[ŁĐÐÞÆŒØ]/g, (letter) => SPECIAL_LETTERS[letter])
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function reduceNumber(value) {
  let number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new TypeError('Il valore da ridurre deve essere un intero positivo.');
  }
  while (number >= 10) {
    number = String(number).split('').reduce((sum, digit) => sum + Number(digit), 0);
  }
  return number;
}

export function calculateNameValue(value) {
  const normalized = normalizeName(value);
  const letters = [...normalized].filter((letter) => LETTER_VALUES[letter]);
  if (letters.length === 0) {
    throw new Error('Inserisci almeno una lettera valida.');
  }
  return reduceNumber(letters.reduce((sum, letter) => sum + LETTER_VALUES[letter], 0));
}

export function parseBirthDate(value) {
  const raw = String(value ?? '').trim();
  let day;
  let month;
  let year;

  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (match) {
    [, year, month, day] = match.map(Number);
  } else {
    match = /^(\d{2})[./-](\d{2})[./-](\d{4})$/.exec(raw);
    if (!match) {
      throw new Error('Inserisci una data valida nel formato GG.MM.AAAA.');
    }
    [, day, month, year] = match.map(Number);
  }

  if (year < 1000 || year > 9999) {
    throw new Error('L’anno deve contenere quattro cifre.');
  }
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) {
    throw new Error('La data inserita non esiste.');
  }

  const two = (number) => String(number).padStart(2, '0');
  return {
    day,
    month,
    year,
    iso: `${year}-${two(month)}-${two(day)}`,
    formatted: `${two(day)}.${two(month)}.${year}`,
    digits: `${two(day)}${two(month)}${year}`,
  };
}

export function numberEnergy(number) {
  if ([1, 4, 7].includes(number)) return 'Maschile';
  if ([2, 5, 8].includes(number)) return 'Femminile';
  if ([3, 6, 9].includes(number)) return 'Creatore';
  return '';
}

export function extractSignatureSection(markdown, psychicNumber) {
  const planet = NUMBER_PLANET[psychicNumber]?.toUpperCase() ?? '';
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === `# NUMERO ${psychicNumber}: ${planet}`);
  if (start < 0) throw new Error(`Profilo del numero ${psychicNumber} non trovato.`);
  const relativeEnd = lines.slice(start + 1).findIndex((line) =>
    new RegExp(`^### ${psychicNumber} KARMA \\d+$`).test(line.trim()),
  );
  const end = relativeEnd < 0 ? lines.length : start + 1 + relativeEnd;
  return lines.slice(start, end).join('\n').trim();
}

export function extractKarmaSection(markdown, psychicNumber, karmaNumber) {
  const header = `### ${psychicNumber} KARMA ${karmaNumber}`;
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) throw new Error(`Combinazione ${psychicNumber} Karma ${karmaNumber} non trovata.`);
  const relativeEnd = lines.slice(start + 1).findIndex((line) => /^###\s/.test(line));
  const end = relativeEnd < 0 ? lines.length : start + 1 + relativeEnd;
  return lines.slice(start, end).join('\n').trim();
}

function splitCommaList(value) {
  return value
    .split(',')
    .flatMap((part) => part.trim().toLowerCase().split(/\s+e\s+/))
    .map((part) => part.trim().replace(/\.$/, ''))
    .filter(Boolean);
}

function splitFamousPeople(value) {
  const items = [];
  let current = '';
  let depth = 0;
  for (const character of value) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      if (current.trim()) items.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (current.trim()) items.push(current.trim());
  return items.map((item) => {
    const cleaned = item.replace(/\.$/, '');
    const match = /^(.+?)\s*\(([^)]+)\)$/.exec(cleaned);
    return match ? { name: match[1].trim(), note: match[2].trim() } : { name: cleaned, note: '' };
  });
}

export function extractMetadata(section) {
  const idealMatch = /FIRMA IDEALE:\*{0,2}\s*([^\n]+)/.exec(section);
  const famousMatch = /PERSONAGGI FAMOSI:\*{0,2}\s*([^\n]+)/.exec(section);
  const goodDaysMatch = /Giorni favorevoli:\s*([\d,\s]+)\./i.exec(section);
  const badDaysMatch = /Giorni da bollino rosso:\s*([\d,\s]+)\./i.exec(section);
  const goodColorsMatch = /Colori favorevoli:\s*([^\.]+)\./i.exec(section);
  const badColorsMatch = /Color[ei]? non positiv[io]:\s*([^\.]+)\./i.exec(section);
  const parseDays = (match) => match
    ? match[1].split(',').map((value) => Number(value.trim())).filter(Number.isInteger)
    : [];

  return {
    idealSignature: idealMatch?.[1].replace(/\*+$/, '').trim().replace(/\.$/, '') ?? '',
    famousPeople: famousMatch ? splitFamousPeople(famousMatch[1].replace(/\*+$/, '').trim()) : [],
    goodDays: parseDays(goodDaysMatch),
    badDays: parseDays(badDaysMatch),
    goodColors: goodColorsMatch ? splitCommaList(goodColorsMatch[1]) : [],
    badColors: badColorsMatch ? splitCommaList(badColorsMatch[1]) : [],
  };
}

export function cleanMarkdown(value) {
  return value
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^\*\s+/gm, '• ')
    .replace(/^---+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function calculateProfile({ firstName, lastName, middleName = '', birthDate }, markdown) {
  const cleanFirst = String(firstName ?? '').trim();
  const cleanLast = String(lastName ?? '').trim();
  const cleanMiddle = String(middleName ?? '').trim();
  if (!cleanFirst || !cleanLast) throw new Error('Nome e cognome sono obbligatori.');
  if ([cleanFirst, cleanLast, cleanMiddle].some((value) => value.length > 80)) {
    throw new Error('Nome e cognome non possono superare 80 caratteri.');
  }

  const date = parseBirthDate(birthDate);
  const fullName = [cleanFirst, cleanMiddle, cleanLast].filter(Boolean).join(' ');
  const signatureNumber = calculateNameValue(fullName);
  const firstNameNumber = calculateNameValue(cleanFirst);
  const lastNameNumber = calculateNameValue(cleanLast);
  const karmaNumber = reduceNumber([...date.digits].reduce((sum, digit) => sum + Number(digit), 0));
  const psychicNumber = reduceNumber(date.day);
  const karmaSection = extractKarmaSection(markdown, psychicNumber, karmaNumber);
  const signatureSection = extractSignatureSection(markdown, psychicNumber);
  const metadata = extractMetadata(karmaSection);
  const describe = (number) => ({
    number,
    planet: NUMBER_PLANET[number],
    energy: numberEnergy(number),
  });

  return {
    person: {
      firstName: cleanFirst,
      lastName: cleanLast,
      middleName: cleanMiddle,
      fullName,
      birthDate: date.formatted,
      birthDateIso: date.iso,
    },
    firstNameNumber,
    lastNameNumber,
    signature: describe(signatureNumber),
    karma: describe(karmaNumber),
    psychic: describe(psychicNumber),
    nameFrequency: describe(firstNameNumber),
    ...metadata,
    signatureText: cleanMarkdown(signatureSection),
    karmaText: cleanMarkdown(karmaSection),
  };
}

export function buildGlobalDayMap(markdown) {
  const result = {};
  for (let psychic = 1; psychic <= 9; psychic += 1) {
    const good = new Set();
    const bad = new Set();
    for (let karma = 1; karma <= 9; karma += 1) {
      const metadata = extractMetadata(extractKarmaSection(markdown, psychic, karma));
      metadata.goodDays.forEach((day) => good.add(day));
      metadata.badDays.forEach((day) => bad.add(day));
    }
    result[psychic] = { good: [...good].sort((a, b) => a - b), bad: [...bad].sort((a, b) => a - b) };
  }
  return result;
}

export function dayStatus(day, psychicNumber, dayMap) {
  const reduced = reduceNumber(day);
  const values = dayMap[psychicNumber] ?? { good: [], bad: [] };
  if (values.good.includes(day) || values.good.includes(reduced)) return 'good';
  if (values.bad.includes(day) || values.bad.includes(reduced)) return 'bad';
  return 'neutral';
}
