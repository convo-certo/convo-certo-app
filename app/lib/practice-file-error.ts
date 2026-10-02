export type PracticeFileErrorCode =
  | "file-too-large"
  | "file-unreadable"
  | "json-invalid"
  | "format-unsupported"
  | "score-invalid"
  | "settings-invalid"
  | "seat-missing"
  | "reference-invalid"
  | "reference-mismatch"
  | "import-failed";

const messages: Record<PracticeFileErrorCode, { ja: string; en: string }> = {
  "file-too-large": {
    ja: "練習ファイルは30MB以下にしてください。大きい楽譜は楽譜ソフトで楽章などに分け、練習を保存し直してください。",
    en: "Choose a practice file of 30 MB or smaller. For a large score, export individual movements from your notation app and save each practice separately.",
  },
  "file-unreadable": {
    ja: "練習ファイルを読み取れませんでした。端末に保存したファイルを選び直してください。",
    en: "This practice file could not be read. Save a local copy, then choose it again.",
  },
  "json-invalid": {
    ja: "練習ファイルのJSONが壊れています。元のConvoCertoから書き出し直してください。",
    en: "This practice file contains damaged JSON. Export a new practice file from the original ConvoCerto app.",
  },
  "format-unsupported": {
    ja: "対応するConvoCerto練習ファイルではありません。書き出した .convo.json を選んでください。MusicXMLは「楽譜ファイルを選ぶ」から開けます。",
    en: "This is not a supported ConvoCerto practice file. Choose an exported .convo.json file. For MusicXML, use Choose a score.",
  },
  "score-invalid": {
    ja: "練習ファイル内の楽譜を読み込めませんでした。元のConvoCertoで楽譜を確認し、練習ファイルを書き出し直してください。",
    en: "The score inside this practice file could not be read. Check the score in the original ConvoCerto app, then export the practice again.",
  },
  "settings-invalid": {
    ja: "保存された練習設定が不正です。元のConvoCertoから練習ファイルを書き出し直してください。",
    en: "This practice file contains invalid settings. Export a new practice file from the original ConvoCerto app.",
  },
  "seat-missing": {
    ja: "保存された担当が楽譜にありません。元のConvoCertoで存在する席を選び、練習ファイルを書き出し直してください。",
    en: "The saved part is missing from this score. Choose an available part in the original ConvoCerto app, then export the practice again.",
  },
  "reference-invalid": {
    ja: "保存された表現データが不正です。元のConvoCertoで表現を選び直し、練習ファイルを書き出し直してください。",
    en: "The saved expression data is invalid. Choose the expression again in the original ConvoCerto app, then export the practice again.",
  },
  "reference-mismatch": {
    ja: "保存された表現が楽譜・移調と一致しません。元のConvoCertoでこの楽譜に合う表現を選び、練習ファイルを書き出し直してください。",
    en: "The saved expression does not match this score or transposition. Choose a matching expression in the original ConvoCerto app, then export the practice again.",
  },
  "import-failed": {
    ja: "練習ファイルの読み込みを完了できませんでした。マイ楽譜を再読み込みして確認し、必要ならもう一度お試しください。",
    en: "Practice import could not be completed. Reload My scores to check your library, then try again if needed.",
  },
};

export class PracticeFileError extends Error {
  readonly code: PracticeFileErrorCode;

  constructor(code: PracticeFileErrorCode, options?: ErrorOptions) {
    super(messages[code].ja, options);
    this.name = "PracticeFileError";
    this.code = code;
  }
}

export function practiceFileErrorMessage(error: unknown, locale: "ja" | "en"): string {
  return messages[error instanceof PracticeFileError ? error.code : "import-failed"][locale];
}
