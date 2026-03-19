import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';

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

const upload = multer({ storage: multer.memoryStorage() });

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'formatize-backend' });
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

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Formatize backend listening on http://localhost:${port}`);
});
