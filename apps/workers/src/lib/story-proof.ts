import PDFDocument from "pdfkit";

interface StoryProofSpread {
  index: number;
  text: string;
}

interface StoryProofRenderInput {
  bookId: string;
  title: string;
  spreads: StoryProofSpread[];
}

const pageSize = 612;
const margin = 48;

function addProofHeader(doc: PDFKit.PDFDocument, title: string, spreadIndex: number): void {
  doc.fillColor("#64748b").fontSize(10).text("Story proof", margin, 28, {
    width: pageSize - margin * 2,
    align: "right"
  });
  doc.fillColor("#0f172a").fontSize(15).text(title, margin, 32, {
    width: pageSize - margin * 2
  });
  doc.fillColor("#0f172a").fontSize(24).text(`Spread ${spreadIndex + 1}`, margin, 88, {
    width: pageSize - margin * 2
  });
}

function addProofFooter(doc: PDFKit.PDFDocument, bookId: string): void {
  doc.fillColor("#94a3b8").fontSize(9).text(bookId, margin, pageSize - 36, {
    width: pageSize - margin * 2,
    align: "right"
  });
}

function addTextSpreadPage(doc: PDFKit.PDFDocument, input: StoryProofRenderInput, spread: StoryProofSpread): void {
  addProofHeader(doc, input.title, spread.index);
  doc.fillColor("#0f172a").fontSize(22).text(spread.text, margin, 156, {
    width: pageSize - margin * 2,
    align: "left",
    lineGap: 8
  });
  addProofFooter(doc, input.bookId);
}

function addPlaceholderArtPage(doc: PDFKit.PDFDocument, input: StoryProofRenderInput, spread: StoryProofSpread): void {
  doc.fillColor("#f8fafc").rect(0, 0, pageSize, pageSize).fill();
  doc.lineWidth(2).strokeColor("#cbd5e1").roundedRect(72, 96, pageSize - 144, pageSize - 192, 18).stroke();
  doc.fillColor("#475569").fontSize(28).text("Artwork pending", 96, 246, {
    width: pageSize - 192,
    align: "center"
  });
  doc.fillColor("#64748b").fontSize(14).text("Final illustrated PDF arrives after image generation and release checks.", 108, 296, {
    width: pageSize - 216,
    align: "center"
  });
  doc.fillColor("#94a3b8").fontSize(11).text(`Spread ${spread.index + 1}`, 96, 388, {
    width: pageSize - 192,
    align: "center"
  });
  addProofFooter(doc, input.bookId);
}

export async function renderStoryProofPdf(input: StoryProofRenderInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: [pageSize, pageSize],
    margin: 0,
    compress: false
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  input.spreads.forEach((spread, index) => {
    if (index > 0) {
      doc.addPage({ size: [pageSize, pageSize], margin: 0 });
    }
    addTextSpreadPage(doc, input, spread);
    doc.addPage({ size: [pageSize, pageSize], margin: 0 });
    addPlaceholderArtPage(doc, input, spread);
  });

  doc.end();
  return done;
}
