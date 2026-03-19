'use client';

import { ChangeEvent, DragEvent, useRef, useState } from 'react';

type DragDropUploadProps = {
  files: File[];
  onFilesChange: (files: File[]) => void;
  onUpload: () => Promise<void>;
  uploading: boolean;
  errorMessage?: string;
};

function isValidExcelFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.xlsm');
}

export default function DragDropUpload({
  files,
  onFilesChange,
  onUpload,
  uploading,
  errorMessage,
}: DragDropUploadProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState('');

  const processFiles = (incomingFiles: File[]) => {
    const validFiles = incomingFiles.filter(isValidExcelFile);
    const invalidFiles = incomingFiles.filter((file) => !isValidExcelFile(file));

    if (invalidFiles.length > 0) {
      setLocalError('Only .xlsx, .xls, or .xlsm files are allowed in this uploader.');
    } else {
      setLocalError('');
    }

    onFilesChange(validFiles);
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    processFiles(selected);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(event.dataTransfer.files ?? []);
    processFiles(dropped);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">1) Upload Excel Files</h2>
      <p className="mt-2 text-sm text-slate-600">
        Drag & drop multiple <span className="font-medium">.xlsx/.xls/.xlsm</span> files or browse manually.
      </p>

      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`mt-4 rounded-xl border-2 border-dashed p-8 text-center transition ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-slate-300 bg-slate-50 hover:border-slate-400'
        }`}
      >
        <p className="text-sm text-slate-700">Drop files here</p>
        <p className="my-2 text-xs text-slate-500">or</p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Choose files
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.xlsm"
          multiple
          onChange={onInputChange}
          className="hidden"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {files.map((file) => (
          <span
            key={`${file.name}-${file.lastModified}`}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
          >
            {file.name}
          </span>
        ))}
        {!files.length && <p className="text-sm text-slate-500">No files selected yet.</p>}
      </div>

      {localError && <p className="mt-3 text-sm text-rose-600">{localError}</p>}
      {errorMessage && <p className="mt-3 text-sm text-rose-600">{errorMessage}</p>}

      <button
        type="button"
        onClick={() => void onUpload()}
        disabled={uploading || files.length === 0}
        className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? 'Uploading...' : 'Upload & Analyze Headers'}
      </button>
    </section>
  );
}
