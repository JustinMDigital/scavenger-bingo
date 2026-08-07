const BLOCKED_PROFANITY = [
  "asshole",
  "bastard",
  "bitch",
  "bullshit",
  "cock",
  "cunt",
  "douche",
  "douchebag",
  "fag",
  "faggot",
  "fuck",
  "fucker",
  "motherfucker",
  "nigga",
  "nigger",
  "piss",
  "prick",
  "pussy",
  "retard",
  "shit",
  "slut",
  "twat",
  "whore",
] as const;

const BLOCKED_RACIAL_SLURS = [
  "beaner",
  "chingchong",
  "chink",
  "coon",
  "cracker",
  "dago",
  "dothead",
  "gook",
  "gyppo",
  "honky",
  "jap",
  "junglebunny",
  "kike",
  "paki",
  "porchmonkey",
  "raghead",
  "redskin",
  "sandnigger",
  "spic",
  "towelhead",
  "wetback",
  "whitey",
  "wop",
  "zipperhead",
] as const;

const BLOCKED_PLAYER_NAME_WORDS = new Set<string>([
  ...BLOCKED_PROFANITY,
  ...BLOCKED_RACIAL_SLURS,
]);

const LEET_REPLACEMENTS: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  "$": "s",
  "!": "i",
  "+": "t",
  "|": "i",
};

export function isAllowedPlayerName(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[013457@$!+|]/g, (character) => LEET_REPLACEMENTS[character] ?? character)
    .replace(/(.)\1{2,}/g, "$1");
  const words = normalized.match(/\p{L}+/gu) ?? [];
  const joinedWordGroups = words.flatMap((_, startIndex) =>
    Array.from(
      { length: Math.min(12, words.length - startIndex) - 1 },
      (_, index) => words.slice(startIndex, startIndex + index + 2).join(""),
    ),
  );
  const candidates = [
    ...words,
    ...joinedWordGroups,
    ...normalized
      .split(/\s+/)
      .map((part) => part.replace(/[^\p{L}]/gu, ""))
      .filter(Boolean),
    normalized.replace(/[^\p{L}]/gu, ""),
  ];

  return !candidates.some((candidate) => BLOCKED_PLAYER_NAME_WORDS.has(candidate));
}
