'use client';

import axios from 'axios';
import { ChangeEvent, useMemo, useState } from 'react';

type PreviewResponse = {
  previews: Array<{
    fileName: string;
    rowCount: number;
    sheetNames: string[];
    sampleRows: Record<string, unknown>[];
  }>;
};

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:4000';

export default function HomePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string>('');

  const totalFiles = useMemo(() => files.length, [files]);

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    setFiles(selected);
    setResult(null);
    setError('');
  };

  const handlePreview = async () => {
    if (!files.length) {
      setError('Please select at least one Excel file.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));

      const response = await axios.post<PreviewResponse>(
        `${apiBaseUrl}/api/files/preview`,
        formData
      );

      setResult(response.data);
    } catch (requestError) {
      setError('Could not preview files. Check backend server and CORS settings.');
      setResult(null);
      console.error(requestError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Formatize</h1>
        <p className="mt-2 text-sm text-slate-600">
          Upload multiple Excel files to normalize and merge data.
        </p>

        <div className="mt-6 space-y-4">
          <input
            type="file"
            multiple
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="block w-full rounded-lg border border-slate-300 p-2"
          />

          <button
            onClick={handlePreview}
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Preview Files'}
          </button>

          <p className="text-sm text-slate-500">Selected files: {totalFiles}</p>

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </section>

      {result && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Preview Result</h2>
          <div className="mt-4 space-y-4">
            {result.previews.map((preview) => (
              <article
                key={preview.fileName}
                className="rounded-lg border border-slate-200 p-4"
              >
                <p className="font-medium">{preview.fileName}</p>
                <p className="text-sm text-slate-600">
                  Sheets: {preview.sheetNames.join(', ')}
                </p>
                <p className="text-sm text-slate-600">Rows: {preview.rowCount}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
