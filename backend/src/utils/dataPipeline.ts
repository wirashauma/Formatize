import * as XLSX from 'xlsx';

export type ConfirmedMappingItem = {
  targetColumn: string;
  sourceColumn: string | null;
};

export type ConfirmedMappingRecord = Record<string, string>;

export class DataPipelineError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, code = 'DATA_PIPELINE_ERROR', statusCode = 400) {
    super(message);
    this.name = 'DataPipelineError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function parseConfirmedMapping(input: unknown): ConfirmedMappingRecord {
  if (input === null || input === undefined) {
    throw new DataPipelineError(
      'confirmedMapping is required. Provide an array of { targetColumn, sourceColumn } or an object map.',
      'MAPPING_REQUIRED',
      400
    );
  }

  if (Array.isArray(input)) {
    const mapping: ConfirmedMappingRecord = {};

    input.forEach((item) => {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof (item as ConfirmedMappingItem).targetColumn !== 'string'
      ) {
        throw new DataPipelineError(
          'Each mapping item must include targetColumn (string) and sourceColumn (string | null).',
          'INVALID_MAPPING_SHAPE',
          400
        );
      }

      const targetColumn = (item as ConfirmedMappingItem).targetColumn.trim();
      const sourceColumn = (item as ConfirmedMappingItem).sourceColumn;

      if (!targetColumn) {
        throw new DataPipelineError('targetColumn cannot be empty.', 'INVALID_MAPPING_SHAPE', 400);
      }

      if (typeof sourceColumn === 'string' && sourceColumn.trim()) {
        mapping[targetColumn] = sourceColumn.trim();
      }
    });

    if (!Object.keys(mapping).length) {
      throw new DataPipelineError(
        'At least one mapped source column is required in confirmedMapping.',
        'EMPTY_MAPPING',
        400
      );
    }

    return mapping;
  }

  if (typeof input === 'object') {
    const mapping: ConfirmedMappingRecord = {};

    Object.entries(input as Record<string, unknown>).forEach(([target, source]) => {
      const targetColumn = target.trim();

      if (!targetColumn) return;
      if (typeof source !== 'string') return;
      if (!source.trim()) return;

      mapping[targetColumn] = source.trim();
    });

    if (!Object.keys(mapping).length) {
      throw new DataPipelineError(
        'At least one mapped source column is required in confirmedMapping.',
        'EMPTY_MAPPING',
        400
      );
    }

    return mapping;
  }

  throw new DataPipelineError(
    'Invalid confirmedMapping type. Use array or object format.',
    'INVALID_MAPPING_TYPE',
    400
  );
}

export function extractOutputColumns(input: unknown): string[] {
  if (Array.isArray(input)) {
    const columns = input
      .filter((item): item is ConfirmedMappingItem => {
        return (
          !!item &&
          typeof item === 'object' &&
          typeof (item as ConfirmedMappingItem).targetColumn === 'string'
        );
      })
      .map((item) => item.targetColumn.trim())
      .filter((item) => item.length > 0);

    return Array.from(new Set(columns));
  }

  if (input && typeof input === 'object') {
    const columns = Object.keys(input as Record<string, unknown>)
      .map((key) => key.trim())
      .filter((key) => key.length > 0);

    return Array.from(new Set(columns));
  }

  return [];
}

export function trimWhitespace(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function standardizeGender(value: unknown): string {
  const text = trimWhitespace(value);
  const normalized = text.toLowerCase().replace(/[^a-z]/g, '');

  const maleTokens = new Set(['l', 'lk', 'laki', 'lakilaki', 'pria', 'male', 'm']);
  const femaleTokens = new Set(['p', 'pr', 'perempuan', 'wanita', 'female', 'f']);

  if (maleTokens.has(normalized)) return 'Laki-laki';
  if (femaleTokens.has(normalized)) return 'Perempuan';

  return text;
}

export function normalizePhoneNumber(value: unknown): string {
  const text = trimWhitespace(value);
  const digitsOnly = text.replace(/\D/g, '');

  if (!digitsOnly) return '';

  if (digitsOnly.startsWith('628')) {
    return digitsOnly;
  }

  if (digitsOnly.startsWith('62')) {
    return `628${digitsOnly.slice(2).replace(/^0+/, '')}`;
  }

  if (digitsOnly.startsWith('08')) {
    return `628${digitsOnly.slice(2)}`;
  }

  if (digitsOnly.startsWith('8')) {
    return `628${digitsOnly.slice(1)}`;
  }

  if (digitsOnly.startsWith('0')) {
    return `628${digitsOnly.slice(1)}`;
  }

  return `628${digitsOnly}`;
}

function targetKey(targetColumn: string): string {
  return targetColumn.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function cleanMappedValue(targetColumn: string, value: unknown): string {
  const base = trimWhitespace(value);
  const key = targetKey(targetColumn);

  if (key.includes('jeniskelamin') || key.includes('gender')) {
    return standardizeGender(base);
  }

  if (key.includes('nomorhp') || key.includes('nohp') || key.includes('phone') || key.includes('telp')) {
    return normalizePhoneNumber(base);
  }

  return base;
}

export function mapAndCleanRow(
  row: Record<string, unknown>,
  mapping: ConfirmedMappingRecord,
  outputColumns: string[]
): Record<string, string> {
  const mappedRow: Record<string, string> = {};

  outputColumns.forEach((targetColumn) => {
    const sourceColumn = mapping[targetColumn];
    const rawValue = sourceColumn ? row[sourceColumn] : '';
    mappedRow[targetColumn] = cleanMappedValue(targetColumn, rawValue);
  });

  return mappedRow;
}

export function shouldIncludeRow(row: Record<string, string>): boolean {
  return Object.values(row).some((value) => value !== '');
}

export function computeColumnWidths(
  rows: Array<Record<string, string>>,
  columns: string[]
): Array<{ wch: number }> {
  return columns.map((column) => {
    const maxValueLength = rows.reduce((maxLength, row) => {
      const valueLength = (row[column] ?? '').length;
      return Math.max(maxLength, valueLength);
    }, column.length);

    const width = Math.min(40, Math.max(12, maxValueLength + 2));
    return { wch: width };
  });
}

export function toWorkbookBuffer(
  rows: Array<Record<string, string>>,
  columns: string[],
  sheetName = 'Merged Data'
): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: columns,
  });

  worksheet['!cols'] = computeColumnWidths(rows, columns);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  return XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'buffer',
  }) as Buffer;
}
