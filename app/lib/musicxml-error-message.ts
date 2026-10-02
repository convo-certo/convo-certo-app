import { MusicXMLError, type MusicXMLErrorCode } from "./musicxml-error";

const messages: Record<MusicXMLErrorCode, string> = {
  "file-too-large": "Choose a MusicXML or MXL file smaller than 25 MB. Export a movement or a shorter passage from your notation app.",
  "file-unreadable": "This file could not be read. Download or export it again, then choose the local copy.",
  "file-empty": "This file is empty. Export the score again as MusicXML or MXL.",
  "archive-too-large": "This MXL file expands beyond the supported size. Export a movement or a shorter passage.",
  "archive-invalid": "This MXL file is damaged or is not a supported archive. Export a new MusicXML or MXL file.",
  "container-missing": "This MXL file is missing its score index. Export it again, or use uncompressed MusicXML.",
  "container-invalid": "This MXL file has an invalid score index. Export it again, or use uncompressed MusicXML.",
  "score-missing": "This MXL file does not contain the score named in its index. Export it again from your notation app.",
  "xml-invalid": "The MusicXML document could not be read. Open it in your notation app and export it again.",
  "format-unsupported": "Export a single score as MusicXML or MXL from your notation app. PDF, MIDI and score collections cannot be opened here.",
  "encoding-unsupported": "This file uses an unsupported text encoding. Export it again as UTF-8 MusicXML or MXL.",
  "score-invalid": "Some score data is missing or invalid. Open the score in your notation app and export it again as MusicXML.",
  "parts-missing": "This score has no usable parts. Export the full score, including your part and the accompaniment.",
  "notes-missing": "This score contains no playable notes. Export a score with notes from your notation app.",
  "expression-invalid": "A saved expression instruction is invalid. Export a fresh score from your notation app.",
};

export function musicXMLErrorMessage(error: unknown, locale: "ja" | "en"): string {
  if (error instanceof MusicXMLError) return locale === "ja" ? error.message : messages[error.code];
  return locale === "ja" ? "楽譜を開けませんでした。ファイルを確認してもう一度お試しください。" : "Could not open this score. Check the file and try again.";
}
