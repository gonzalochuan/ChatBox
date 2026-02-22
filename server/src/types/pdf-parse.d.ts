declare module "pdf-parse" {
  interface PdfParseOptions {
    max?: number;
  }
  interface PdfParseResult {
    text: string;
    info?: unknown;
    metadata?: unknown;
    version?: string;
  }
  function pdfParse(data: Buffer | Uint8Array | ArrayBufferLike, options?: PdfParseOptions): Promise<PdfParseResult>;
  export default pdfParse;
}

declare module "pdf-parse/lib/pdf-parse.js" {
  import pdfParse from "pdf-parse";
  export default pdfParse;
}
