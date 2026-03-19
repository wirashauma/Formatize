'use client';

import { useMemo } from 'react';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type MappingSuggestion = {
  targetColumn: string;
  sourceColumn: string | null;
  confidence: ConfidenceLevel;
  score: number;
};

type MappingInterfaceProps = {
  masterTemplate: string[];
  rawHeaders: string[];
  selectedMapping: Record<string, string | null>;
  suggestions: MappingSuggestion[];
  onMappingChange: (targetColumn: string, sourceColumn: string | null) => void;
  onConfirmMapping: () => Promise<void>;
  confirming?: boolean;
  confirmationMessage?: string;
};

const confidenceColorClass: Record<ConfidenceLevel, string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

export default function MappingInterface({
  masterTemplate,
  rawHeaders,
  selectedMapping,
  suggestions,
  onMappingChange,
  onConfirmMapping,
  confirming = false,
  confirmationMessage,
}: MappingInterfaceProps) {
  const suggestionByTarget = useMemo(() => {
    return new Map(suggestions.map((item) => [item.targetColumn, item]));
  }, [suggestions]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">2) Interactive Mapping Interface</h2>
      <p className="mt-2 text-sm text-slate-600">
        Review and adjust detected mappings between the master template and uploaded headers.
      </p>

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Master Template</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Source Header</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {masterTemplate.map((targetColumn) => {
              const suggestion = suggestionByTarget.get(targetColumn);
              const selectedValue = selectedMapping[targetColumn] ?? '';

              return (
                <tr key={targetColumn} className="bg-white">
                  <td className="px-4 py-3 font-medium text-slate-800">{targetColumn}</td>
                  <td className="px-4 py-3">
                    <select
                      value={selectedValue}
                      onChange={(event) =>
                        onMappingChange(targetColumn, event.target.value || null)
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500"
                    >
                      <option value="">-- Unassigned --</option>
                      {rawHeaders.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {suggestion ? (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${confidenceColorClass[suggestion.confidence]}`}
                      >
                        {suggestion.confidence} ({Math.round(suggestion.score * 100)}%)
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                        -
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => void onConfirmMapping()}
        disabled={rawHeaders.length === 0 || confirming}
        className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {confirming ? 'Processing & Exporting...' : 'Confirm Mapping'}
      </button>

      {confirmationMessage && (
        <p className="mt-3 text-sm text-emerald-700">{confirmationMessage}</p>
      )}
    </section>
  );
}
