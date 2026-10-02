import { instrumentLabels, instrumentLabelsEn } from "./instrument-palette";

export type OrchestraAudioErrorCode =
  | "unavailable"
  | "closed"
  | "resume-timeout"
  | "resume-blocked"
  | "resume-interrupted"
  | "resume-failed"
  | "sample-load"
  | "sample-decode"
  | "sample-silent";

const messages: Record<OrchestraAudioErrorCode, { ja: string; en: string }> = {
  unavailable: {
    ja: "この環境では音声を使えません。ChromeやSafari、またはMacアプリで開いてください。",
    en: "Audio is unavailable here. Open ConvoCerto in Chrome, Safari or the Mac app.",
  },
  closed: {
    ja: "音声を再開できません。楽譜を読み込み直してください。",
    en: "Audio is no longer available for this score. Reopen the score to continue.",
  },
  "resume-timeout": {
    ja: "音声の再開が完了しません。出力先を確認して再試行してください。",
    en: "Audio took too long to resume. Check your output device and try again.",
  },
  "resume-blocked": {
    ja: "音声の再開が許可されていません。ブラウザの音声設定を確認して、もう一度操作してください。",
    en: "Audio playback was blocked. Check your browser's sound settings, then try again.",
  },
  "resume-interrupted": {
    ja: "音声がまだ中断されています。出力先を確認して再試行してください。",
    en: "Audio is still interrupted. Check your output device and try again.",
  },
  "resume-failed": {
    ja: "音声を再開できませんでした。音声出力先を確認してもう一度お試しください。",
    en: "Could not restore audio. Check your output device and try again.",
  },
  "sample-load": {
    ja: "楽器の音源を読み込めませんでした。接続を確認して、楽譜を開き直してください。",
    en: "Instrument sounds could not be loaded. Check your connection, then reopen the score.",
  },
  "sample-decode": {
    ja: "楽器の音源を再生できません。アプリを再読み込みして、楽譜を開き直してください。",
    en: "Instrument sounds could not be read. Reload the app, then reopen the score.",
  },
  "sample-silent": {
    ja: "楽器の音源に有効な音がありません。アプリを再読み込みして、楽譜を開き直してください。",
    en: "Instrument samples contain no usable sound. Reload the app, then reopen the score.",
  },
};

export class OrchestraAudioError extends Error {
  readonly code: OrchestraAudioErrorCode;
  readonly instrument?: string;

  constructor(code: OrchestraAudioErrorCode, options?: ErrorOptions & { instrument?: string }) {
    super(messages[code].en, options);
    this.name = "OrchestraAudioError";
    this.code = code;
    this.instrument = options?.instrument;
  }
}

export function orchestraAudioErrorMessage(error: unknown, locale: "ja" | "en"): string {
  if (!(error instanceof OrchestraAudioError)) return messages["resume-failed"][locale];
  const labels: Record<string, string> = locale === "ja" ? instrumentLabels : instrumentLabelsEn;
  const instrument = error.instrument ? labels[error.instrument] : undefined;
  return messages[error.code][locale] + (instrument ? ` (${instrument})` : "");
}
