'use client';

import axios from 'axios';
import { useMemo, useState } from 'react';
import DragDropUpload from '../components/DragDropUpload';
import MappingInterface, { MappingSuggestion } from '../components/MappingInterface';

type UploadItem = {
  fileName: string;
  sheetNames: string[];
  defaultSheetName: string | null;
  headers: Array<string | number | boolean | null>;
  error?: {
    code: string;
    message: string;
  };
};

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:4000';

const MASTER_TEMPLATE = [
  'NIK',
  'Nama Lengkap',
  'Jenis Kelamin',
  'Tanggal Lahir',
  'Nomor HP',
];

function buildInitialMapping(
  masterTemplate: string[],
  suggestions: MappingSuggestion[]
): Record<string, string | null> {
  const byTarget = new Map(suggestions.map((item) => [item.targetColumn, item.sourceColumn]));

  return masterTemplate.reduce<Record<string, string | null>>((accumulator, targetColumn) => {
    accumulator[targetColumn] = byTarget.get(targetColumn) ?? null;
    return accumulator;
  }, {});
}

export default function HomePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadItem[]>([]);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<MappingSuggestion[]>([]);
  const [selectedMapping, setSelectedMapping] = useState<Record<string, string | null>>({});
  const [confirmMessage, setConfirmMessage] = useState('');
  const [error, setError] = useState<string>('');

  const totalFiles = useMemo(() => files.length, [files]);

  const handleFilesChange = (nextFiles: File[]) => {
    setFiles(nextFiles);
    setUploadResult([]);
    setRawHeaders([]);
    setSuggestions([]);
    setSelectedMapping({});
    setConfirmMessage('');
    setError('');
  };

  const handleUpload = async () => {
    if (!files.length) {
      setError('Please select at least one Excel file.');
      return;
    }

    setUploading(true);
    setError('');
    setConfirmMessage('');

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));

      const uploadResponse = await axios.post<UploadItem[]>(
        `${apiBaseUrl}/api/upload`,
        formData
      );

      const uploaded = uploadResponse.data;
      setUploadResult(uploaded);

      const uniqueHeaders = new Set<string>();

      uploaded.forEach((item) => {
        item.headers.forEach((header) => {
          if (header === null || header === undefined) return;
          const normalizedHeader = String(header).trim();
          if (!normalizedHeader) return;
          uniqueHeaders.add(normalizedHeader);
        });
      });

      const allRawHeaders = Array.from(uniqueHeaders);
      setRawHeaders(allRawHeaders);

      if (!allRawHeaders.length) {
        setSuggestions([]);
        setSelectedMapping(buildInitialMapping(MASTER_TEMPLATE, []));
        return;
      }

      const mappingResponse = await axios.post<MappingSuggestion[]>(
        `${apiBaseUrl}/api/map-columns`,
        {
          rawHeaders: allRawHeaders,
          masterTemplate: MASTER_TEMPLATE,
        }
      );

      setSuggestions(mappingResponse.data);
      setSelectedMapping(buildInitialMapping(MASTER_TEMPLATE, mappingResponse.data));
    } catch (requestError) {
      const message =
        axios.isAxiosError(requestError) && requestError.response?.data?.message
          ? String(requestError.response.data.message)
          : 'Could not upload files. Check backend server and CORS settings.';

      setError(message);
      setUploadResult([]);
      setRawHeaders([]);
      setSuggestions([]);
      setSelectedMapping({});
    } finally {
      setUploading(false);
    }
  };

  const handleMappingChange = (targetColumn: string, sourceColumn: string | null) => {
    setSelectedMapping((previous) => ({
      ...previous,
      [targetColumn]: sourceColumn,
    }));
    setConfirmMessage('');
  };

  const handleConfirmMapping = async () => {
    if (!files.length) {
      setError('Please upload files first before confirming mapping.');
      return;
    }

    const confirmedMapping = MASTER_TEMPLATE.map((targetColumn) => ({
      targetColumn,
      sourceColumn: selectedMapping[targetColumn] ?? null,
    }));

    const hasAtLeastOneAssignedColumn = confirmedMapping.some(
      (item) => typeof item.sourceColumn === 'string' && item.sourceColumn.trim().length > 0
    );

    if (!hasAtLeastOneAssignedColumn) {
      setError('Please assign at least one source header before confirming mapping.');
      return;
    }

    setConfirming(true);
    setError('');
    setConfirmMessage('');

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('formatize.confirmedMapping', JSON.stringify(confirmedMapping));
    }

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      formData.append('confirmedMapping', JSON.stringify(confirmedMapping));

      const response = await axios.post<Blob>(
        `${apiBaseUrl}/api/process-and-export`,
        formData,
        {
          responseType: 'blob',
        }
      );

      const disposition = response.headers['content-disposition'];
      const matchedFileName = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
      const fileName = matchedFileName || `formatize-unified-${Date.now()}.xlsx`;

      const blobUrl = window.URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);

      setConfirmMessage('Mapping saved and merged file exported successfully.');
    } catch (requestError) {
      if (axios.isAxiosError(requestError) && requestError.response?.data instanceof Blob) {
        try {
          const errorText = await requestError.response.data.text();
          const parsedError = JSON.parse(errorText) as { message?: string };
          setError(parsedError.message || 'Failed to process and export data.');
        } catch {
          setError('Failed to process and export data.');
        }
      } else if (axios.isAxiosError(requestError) && requestError.response?.data?.message) {
        setError(String(requestError.response.data.message));
      } else {
        setError('Failed to process and export data.');
      }
    } finally {
      setConfirming(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">Formatize</h1>
        <p className="mt-2 text-sm text-slate-600">
          Upload your Excel files, review smart mapping suggestions, and confirm the final
          template mapping.
        </p>
        <p className="mt-3 text-sm text-slate-500">Selected files: {totalFiles}</p>
      </section>

      <div className="grid gap-6">
        <DragDropUpload
          files={files}
          onFilesChange={handleFilesChange}
          onUpload={handleUpload}
          uploading={uploading}
          errorMessage={error}
        />

        {uploadResult.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Upload Summary</h2>
            <div className="mt-4 space-y-3">
              {uploadResult.map((item) => (
                <article
                  key={item.fileName}
                  className="rounded-xl border border-slate-200 p-4 text-sm"
                >
                  <p className="font-medium text-slate-800">{item.fileName}</p>
                  <p className="mt-1 text-slate-600">Sheets: {item.sheetNames.join(', ') || '-'}</p>
                  {item.error && (
                    <p className="mt-1 text-rose-600">
                      {item.error.code}: {item.error.message}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {rawHeaders.length > 0 && (
          <MappingInterface
            masterTemplate={MASTER_TEMPLATE}
            rawHeaders={rawHeaders}
            selectedMapping={selectedMapping}
            suggestions={suggestions}
            onMappingChange={handleMappingChange}
            onConfirmMapping={handleConfirmMapping}
            confirming={confirming}
            confirmationMessage={confirmMessage}
          />
        )}
      </div>
    </main>
  );
}
