import cors from 'cors';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import * as XLSX from 'xlsx';
import {
  ExcelProcessingError,
  getAvailableSheetNames,
  getDefaultSheetHeaders,
  readWorkbookFromBuffer,
} from './utils/excel';
import {
  DEFAULT_MASTER_TEMPLATE,
  MappingValidationError,
  suggestColumnMappings,
} from './utils/smartMapping';
import {
  DataPipelineError,
  extractOutputColumns,
  mapAndCleanRow,
  parseConfirmedMapping,
  shouldIncludeRow,
  toWorkbookBuffer,
} from './utils/dataPipeline';

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4000);
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  })
);
app.use(express.json());

class UploadValidationError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, code = 'UPLOAD_VALIDATION_ERROR', statusCode = 400) {
    super(message);
    this.name = 'UploadValidationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const excelMimeTypes = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/octet-stream',
]);

const excelExtensions = new Set(['.xlsx', '.xls', '.xlsm']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 20,
    fileSize: 20 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const mimeAllowed = excelMimeTypes.has(file.mimetype);
    const extensionAllowed = excelExtensions.has(extension);

    if (!mimeAllowed && !extensionAllowed) {
      callback(
        new UploadValidationError(
          `File \"${file.originalname}\" is not a valid Excel file. Allowed formats: .xlsx, .xls, .xlsm.`,
          'INVALID_FILE_TYPE',
          400
        )
      );
      return;
    }

    callback(null, true);
  },
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'formatize-backend' });
});

app.post('/api/upload', (req: Request, res: Response, next: NextFunction) => {
  upload.array('files')(req, res, (uploadError: unknown) => {
    if (uploadError) {
      next(uploadError);
      return;
    }

    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      next(new UploadValidationError('No files were uploaded.', 'NO_FILES_UPLOADED', 400));
      return;
    }

    const response = files.map((file) => {
      try {
        const workbook = readWorkbookFromBuffer(file.buffer, file.originalname);
        const sheetNames = getAvailableSheetNames(workbook);
        const { defaultSheetName, headers } = getDefaultSheetHeaders(workbook);

        return {
          fileName: file.originalname,
          sheetNames,
          defaultSheetName,
          headers,
        };
      } catch (error) {
        if (error instanceof ExcelProcessingError) {
          return {
            fileName: file.originalname,
            sheetNames: [],
            defaultSheetName: null,
            headers: [],
            error: {
              code: error.code,
              message: error.message,
            },
          };
        }

        throw error;
      }
    });

    res.status(200).json(response);
  });
});

app.post('/api/map-columns', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rawHeaders, masterTemplate } = req.body as {
      rawHeaders?: unknown;
      masterTemplate?: unknown;
    };

    if (!Array.isArray(rawHeaders)) {
      throw new MappingValidationError(
        'rawHeaders is required and must be an array of strings.',
        'INVALID_HEADERS',
        400
      );
    }

    const parsedRawHeaders = rawHeaders.filter((item): item is string => typeof item === 'string');

    if (parsedRawHeaders.length !== rawHeaders.length) {
      throw new MappingValidationError(
        'rawHeaders must contain only string values.',
        'INVALID_HEADERS',
        400
      );
    }

    let parsedMasterTemplate: string[] | undefined;

    if (masterTemplate !== undefined) {
      if (!Array.isArray(masterTemplate)) {
        throw new MappingValidationError(
          'masterTemplate must be an array of strings when provided.',
          'INVALID_MASTER_TEMPLATE',
          400
        );
      }

      parsedMasterTemplate = masterTemplate.filter((item): item is string => typeof item === 'string');

      if (parsedMasterTemplate.length !== masterTemplate.length) {
        throw new MappingValidationError(
          'masterTemplate must contain only string values.',
          'INVALID_MASTER_TEMPLATE',
          400
        );
      }
    }

    const suggestions = suggestColumnMappings(
      parsedRawHeaders,
      parsedMasterTemplate ?? [...DEFAULT_MASTER_TEMPLATE]
    );

    res.status(200).json(suggestions);
  } catch (error) {
    next(error);
  }
});

app.post('/api/files/preview', upload.array('files'), (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;

  if (!files || files.length === 0) {
    return res.status(400).json({ message: 'No files uploaded.' });
  }

  const previews = files.map((file) => {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const firstSheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: null });

    return {
      fileName: file.originalname,
      sheetNames: workbook.SheetNames,
      rowCount: rows.length,
      sampleRows: rows.slice(0, 5),
    };
  });

  return res.status(200).json({ previews });
});

app.post('/api/process-and-export', (req: Request, res: Response, next: NextFunction) => {
  upload.array('files')(req, res, (uploadError: unknown) => {
    if (uploadError) {
      next(uploadError);
      return;
    }

    try {
      const files = req.files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        throw new UploadValidationError('No files were uploaded.', 'NO_FILES_UPLOADED', 400);
      }

      const rawConfirmedMapping = req.body?.confirmedMapping;
      let parsedMappingInput: unknown = rawConfirmedMapping;

      if (typeof rawConfirmedMapping === 'string') {
        try {
          parsedMappingInput = JSON.parse(rawConfirmedMapping);
        } catch {
          throw new DataPipelineError(
            'confirmedMapping must be valid JSON when sent as multipart field.',
            'INVALID_MAPPING_JSON',
            400
          );
        }
      }

      const confirmedMapping = parseConfirmedMapping(parsedMappingInput);
      const outputColumns = extractOutputColumns(parsedMappingInput);

      if (!outputColumns.length) {
        throw new DataPipelineError(
          'Confirmed mapping does not include any mapped output columns.',
          'EMPTY_MAPPING',
          400
        );
      }

      const mergedRows: Array<Record<string, string>> = [];

      files.forEach((file) => {
        const workbook = readWorkbookFromBuffer(file.buffer, file.originalname);

        workbook.SheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];

          if (!worksheet) return;

          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
            defval: '',
            raw: false,
            blankrows: false,
          });

          rows.forEach((row) => {
            const mappedRow = mapAndCleanRow(row, confirmedMapping, outputColumns);

            if (shouldIncludeRow(mappedRow)) {
              mergedRows.push(mappedRow);
            }
          });
        });
      });

      const workbookBuffer = toWorkbookBuffer(mergedRows, outputColumns, 'Unified Data');
      const fileName = `formatize-unified-${Date.now()}.xlsx`;

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', workbookBuffer.length);
      res.status(200).send(workbookBuffer);
    } catch (error) {
      next(error);
    }
  });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Formatize backend listening on http://localhost:${port}`);
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof UploadValidationError) {
    res.status(error.statusCode).json({
      message: error.message,
      code: error.code,
    });
    return;
  }

  if (error instanceof ExcelProcessingError) {
    res.status(error.statusCode).json({
      message: error.message,
      code: error.code,
    });
    return;
  }

  if (error instanceof MappingValidationError) {
    res.status(error.statusCode).json({
      message: error.message,
      code: error.code,
    });
    return;
  }

  if (error instanceof DataPipelineError) {
    res.status(error.statusCode).json({
      message: error.message,
      code: error.code,
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    const statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(statusCode).json({
      message: error.message,
      code: error.code,
    });
    return;
  }

  const fallbackMessage = error instanceof Error ? error.message : 'Unexpected server error';

  res.status(500).json({
    message: fallbackMessage,
    code: 'INTERNAL_SERVER_ERROR',
  });
});
