export const DEFAULT_MASTER_TEMPLATE = [
  'NIK',
  'Nama Lengkap',
  'Jenis Kelamin',
  'Tanggal Lahir',
  'Nomor HP',
] as const;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type ColumnMappingSuggestion = {
  targetColumn: string;
  sourceColumn: string | null;
  confidence: ConfidenceLevel;
  score: number;
};

export class MappingValidationError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, code = 'MAPPING_VALIDATION_ERROR', statusCode = 400) {
    super(message);
    this.name = 'MappingValidationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function similarityScore(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.92;

  const distance = levenshteinDistance(left, right);
  const maxLength = Math.max(left.length, right.length);

  if (!maxLength) return 0;

  return Math.max(0, 1 - distance / maxLength);
}

function scoreToConfidence(score: number): ConfidenceLevel {
  if (score >= 0.88) return 'high';
  if (score >= 0.7) return 'medium';
  return 'low';
}

export function suggestColumnMappings(
  rawHeaders: string[],
  masterTemplate: string[] = [...DEFAULT_MASTER_TEMPLATE]
): ColumnMappingSuggestion[] {
  if (!Array.isArray(rawHeaders) || rawHeaders.length === 0) {
    throw new MappingValidationError('rawHeaders must be a non-empty string array.', 'INVALID_HEADERS');
  }

  if (!Array.isArray(masterTemplate) || masterTemplate.length === 0) {
    throw new MappingValidationError(
      'masterTemplate must be a non-empty string array.',
      'INVALID_MASTER_TEMPLATE'
    );
  }

  const cleanedHeaders = rawHeaders
    .filter((item): item is string => typeof item === 'string')
    .map((header) => header.trim())
    .filter((header) => header.length > 0);

  if (!cleanedHeaders.length) {
    throw new MappingValidationError(
      'rawHeaders must contain at least one non-empty string.',
      'INVALID_HEADERS'
    );
  }

  const usedSourceHeaders = new Set<string>();

  return masterTemplate.map((targetColumn) => {
    const normalizedTarget = normalizeForMatch(targetColumn);

    let bestHeader: string | null = null;
    let bestScore = 0;

    cleanedHeaders.forEach((header) => {
      if (usedSourceHeaders.has(header)) return;

      const normalizedHeader = normalizeForMatch(header);
      const score = similarityScore(normalizedTarget, normalizedHeader);

      if (score > bestScore) {
        bestScore = score;
        bestHeader = header;
      }
    });

    if (bestHeader && bestScore >= 0.55) {
      usedSourceHeaders.add(bestHeader);
      return {
        targetColumn,
        sourceColumn: bestHeader,
        confidence: scoreToConfidence(bestScore),
        score: Number(bestScore.toFixed(2)),
      };
    }

    return {
      targetColumn,
      sourceColumn: null,
      confidence: 'low' as const,
      score: 0,
    };
  });
}
