/** Convierte Excel o CSV a texto CSV (para importar catálogo). */
export async function spreadsheetFileToCsvText(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".csv")) {
    return new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
  }

  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_csv(sheet);
}
