/**
 * Rehearsal NLP
 *
 * Parses natural language voice commands for rehearsal mode.
 * Supports Japanese and English commands for:
 * - Setting Lead/Follow roles at specific measures
 * - Setting wait/listen points
 * - Adjusting tempo
 * - Adjusting dynamics
 */

import type {
  RehearsalCommand,
  RoleDirective,
  RoleMode,
  RoleStrength,
  WaitDirective,
} from "./types";

interface PatternRule {
  pattern: RegExp;
  extract: (match: RegExpMatchArray) => RehearsalCommand | null;
}

const jaRules: PatternRule[] = [
  // "32小節目はリード強め" / "32小節目をリードにして"
  {
    pattern:
      /(\d+)\s*小節目?(?:は|を|の)\s*(?:リード|lead)\s*(強め|弱め|普通)?/i,
    extract(match) {
      const measure = parseInt(match[1]);
      const strengthMap: Record<string, RoleStrength> = {
        強め: "strong",
        弱め: "light",
        普通: "moderate",
      };
      const strength = strengthMap[match[2]] ?? "moderate";
      return {
        type: "set_role",
        measureNumber: measure,
        role: roleDirective("lead", strength),
        rawText: match[0],
      };
    },
  },
  // "32小節目はフォロー" / "32小節目をフォローにして"
  {
    pattern:
      /(\d+)\s*小節目?(?:は|を|の)\s*(?:フォロー|follow)\s*(強め|弱め|普通)?/i,
    extract(match) {
      const measure = parseInt(match[1]);
      const strengthMap: Record<string, RoleStrength> = {
        強め: "strong",
        弱め: "light",
        普通: "moderate",
      };
      const strength = strengthMap[match[2]] ?? "moderate";
      return {
        type: "set_role",
        measureNumber: measure,
        role: roleDirective("follow", strength),
        rawText: match[0],
      };
    },
  },
  // "冒頭で2秒待って" / "50小節目の前に3秒待つように"
  {
    pattern:
      /(?:(\d+)\s*小節目?(?:の前)?|冒頭)(?:で|に)\s*(\d+(?:\.\d+)?)\s*秒\s*(?:待って|待つ|まって)/i,
    extract(match) {
      const measure = match[1] ? parseInt(match[1]) : 1;
      const duration = parseFloat(match[2]);
      return {
        type: "set_wait",
        measureNumber: measure,
        wait: { type: "wait", duration },
        rawText: match[0],
      };
    },
  },
  // "テンポを120にして" / "テンポ上げて" / "テンポ下げて"
  {
    pattern: /テンポ(?:を)?\s*(\d+)?(?:にして|に設定)?/i,
    extract(match) {
      const tempo = match[1] ? parseInt(match[1]) : undefined;
      return {
        type: "set_tempo",
        tempo,
        rawText: match[0],
      };
    },
  },
  {
    pattern: /テンポ\s*(?:を)?\s*(上げて|下げて|速く|遅く)/i,
    extract(match) {
      const direction = match[1];
      const delta =
        direction === "上げて" || direction === "速く" ? 10 : -10;
      return {
        type: "set_tempo",
        tempo: delta,
        rawText: match[0],
      };
    },
  },
  // "リセット"
  {
    pattern: /リセット|元に戻して|初期化/i,
    extract(match) {
      return { type: "reset", rawText: match[0] };
    },
  },
];

const enRules: PatternRule[] = [
  // "measure 32 lead strong" / "set measure 32 to lead"
  {
    pattern:
      /(?:set\s+)?measure\s+(\d+)\s+(?:to\s+)?lead(?:\s+(strong|moderate|light))?/i,
    extract(match) {
      const measure = parseInt(match[1]);
      const strength = (match[2]?.toLowerCase() as RoleStrength) ?? "moderate";
      return {
        type: "set_role",
        measureNumber: measure,
        role: roleDirective("lead", strength),
        rawText: match[0],
      };
    },
  },
  // "measure 32 follow" / "set measure 32 to follow"
  {
    pattern:
      /(?:set\s+)?measure\s+(\d+)\s+(?:to\s+)?follow(?:\s+(strong|moderate|light))?/i,
    extract(match) {
      const measure = parseInt(match[1]);
      const strength = (match[2]?.toLowerCase() as RoleStrength) ?? "moderate";
      return {
        type: "set_role",
        measureNumber: measure,
        role: roleDirective("follow", strength),
        rawText: match[0],
      };
    },
  },
  // "wait 2 seconds at measure 1" / "wait 3 seconds at the beginning"
  {
    pattern:
      /wait\s+(\d+(?:\.\d+)?)\s+seconds?\s+(?:at\s+)?(?:measure\s+(\d+)|(?:the\s+)?beginning)/i,
    extract(match) {
      const duration = parseFloat(match[1]);
      const measure = match[2] ? parseInt(match[2]) : 1;
      return {
        type: "set_wait",
        measureNumber: measure,
        wait: { type: "wait", duration },
        rawText: match[0],
      };
    },
  },
  // "set tempo 120" / "tempo 120"
  {
    pattern: /(?:set\s+)?tempo\s+(?:to\s+)?(\d+)/i,
    extract(match) {
      return {
        type: "set_tempo",
        tempo: parseInt(match[1]),
        rawText: match[0],
      };
    },
  },
  // "reset"
  {
    pattern: /reset(?:\s+all)?/i,
    extract(match) {
      return { type: "reset", rawText: match[0] };
    },
  },
];

function roleDirective(
  mode: RoleMode,
  strength: RoleStrength
): RoleDirective {
  const factorMap: Record<string, number> = {
    "lead:strong": 0.9,
    "lead:moderate": 0.7,
    "lead:light": 0.6,
    "follow:strong": 0.1,
    "follow:moderate": 0.3,
    "follow:light": 0.4,
  };
  return {
    mode,
    strength,
    factor: factorMap[`${mode}:${strength}`] ?? 0.5,
  };
}

export function parseRehearsalCommand(
  text: string
): RehearsalCommand | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Try Japanese rules first
  for (const rule of jaRules) {
    const match = trimmed.match(rule.pattern);
    if (match) {
      return rule.extract(match);
    }
  }

  // Try English rules
  for (const rule of enRules) {
    const match = trimmed.match(rule.pattern);
    if (match) {
      return rule.extract(match);
    }
  }

  return null;
}

/** Get suggestions for available commands */
export function getCommandExamples(): { ja: string[]; en: string[] } {
  return {
    ja: [
      "32小節目はリード強め",
      "16小節目をフォローにして",
      "冒頭で2秒待って",
      "50小節目の前に3秒待つように",
      "テンポを120にして",
      "テンポ上げて",
      "リセット",
    ],
    en: [
      "Set measure 32 to lead strong",
      "Measure 16 follow moderate",
      "Wait 2 seconds at the beginning",
      "Wait 3 seconds at measure 50",
      "Set tempo 120",
      "Reset",
    ],
  };
}
