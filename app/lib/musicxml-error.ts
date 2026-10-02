export type MusicXMLErrorCode =
  | "file-too-large"
  | "file-unreadable"
  | "file-empty"
  | "archive-too-large"
  | "archive-invalid"
  | "container-missing"
  | "container-invalid"
  | "score-missing"
  | "xml-invalid"
  | "format-unsupported"
  | "encoding-unsupported"
  | "score-invalid"
  | "parts-missing"
  | "notes-missing"
  | "expression-invalid";

export class MusicXMLError extends Error {
  readonly code: MusicXMLErrorCode;

  constructor(code: MusicXMLErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MusicXMLError";
    this.code = code;
  }
}
