import regularFontUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url';
import boldFontUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url';
import { bytesToBase64 } from '../base64';
import { PdfExportError, type PdfFonts } from './pdf';

// DejaVu Sans covers Latin (incl. Azerbaijani/Turkish letters) and Cyrillic,
// which jsPDF's built-in Helvetica cannot render. Loaded only when a PDF is requested.
export async function loadBrowserFonts(): Promise<PdfFonts> {
  const load = async (url: string) => {
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new PdfExportError('The PDF font could not be loaded.');
    }
    if (!res.ok) throw new PdfExportError('The PDF font could not be loaded.');
    return bytesToBase64(new Uint8Array(await res.arrayBuffer()));
  };
  const [regular, bold] = await Promise.all([load(regularFontUrl), load(boldFontUrl)]);
  return { regular, bold };
}
