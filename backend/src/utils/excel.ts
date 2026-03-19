import * as XLSX from 'xlsx';

export class ExcelProcessingError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, code = 'EXCEL_PROCESSING_ERROR', statusCode = 400) {
    super(message);
    this.name = 'ExcelProcessingError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function readWorkbookFromBuffer(fileBuffer: Buffer, fileName: string): XLSX.WorkBook {
  try {
    return XLSX.read(fileBuffer, {
      type: 'buffer',
      cellDates: true,
      dense: true,
    });
  } catch {
    throw new ExcelProcessingError(
      `File "${fileName}" is corrupted or not a valid Excel document.`,
      'INVALID_EXCEL_FILE',
      422
    );
  }
}

export function getAvailableSheetNames(workbook: XLSX.WorkBook): string[] {
  return workbook.SheetNames ?? [];
}

export function getSheetHeaders(
  workbook: XLSX.WorkBook,
  sheetName: string
): Array<string | number | boolean | null> {
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new ExcelProcessingError(
      `Sheet "${sheetName}" was not found in workbook.`,
      'SHEET_NOT_FOUND',
      400
    );
  }

  const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(worksheet, {
    header: 1,
    range: 0,
    blankrows: false,
    raw: true,
    defval: null,
  });

  const firstRow = rows[0] ?? [];

  return Array.isArray(firstRow) ? firstRow : [];
}

export function getDefaultSheetHeaders(
  workbook: XLSX.WorkBook
): { defaultSheetName: string; headers: Array<string | number | boolean | null> } {
  const sheetNames = getAvailableSheetNames(workbook);

  if (!sheetNames.length) {
    throw new ExcelProcessingError(
      'Workbook does not contain any sheets.',
      'NO_SHEETS_FOUND',
      422
    );
  }

  const defaultSheetName = sheetNames[0];
  const headers = getSheetHeaders(workbook, defaultSheetName);

  return { defaultSheetName, headers };
}
