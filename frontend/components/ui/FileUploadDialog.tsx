'use client';

import { DragEvent, useRef, useState } from 'react';
import { File, Upload, X } from 'lucide-react';

export type UploadProcessingMode = 'queue' | 'immediate';

interface FileUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (files: File[], processingMode: UploadProcessingMode) => Promise<void> | void;
  accept?: string;
  maxSize?: number;
  multiple?: boolean;
  showProcessingModeToggle?: boolean;
  processingMode?: UploadProcessingMode;
  onProcessingModeChange?: (mode: UploadProcessingMode) => void;
}

export default function FileUploadDialog({
  open,
  onClose,
  onConfirm,
  accept = '.pdf,.docx,.txt,.md,.csv,.json,.xlsx,.pptx,.eml',
  maxSize = 100,
  multiple = true,
  showProcessingModeToggle = false,
  processingMode = 'queue',
  onProcessingModeChange,
}: FileUploadDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const validFiles: File[] = [];
    Array.from(selectedFiles).forEach((file) => {
      if (file.size > maxSize * 1024 * 1024) {
        alert(`${file.name} is too large. Max size is ${maxSize}MB`);
        return;
      }

      const extension = `.${file.name.split('.').pop()?.toLowerCase()}`;
      if (accept && !accept.split(',').includes(extension)) {
        alert(`${file.name} has an unsupported file extension`);
        return;
      }

      validFiles.push(file);
    });

    setFiles((prev) => (multiple ? [...prev, ...validFiles] : validFiles));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleConfirm = async () => {
    if (files.length === 0 || submitting) return;

    setSubmitting(true);
    try {
      await onConfirm(files, processingMode);
      setFiles([]);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-6">
          <h2 className="text-lg font-semibold">Upload Documents</h2>
          <button
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-600"
            disabled={submitting}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <div
            className={`
              relative h-64 rounded-lg border-2 border-dashed
              flex cursor-pointer flex-col items-center justify-center
              transition-colors
              ${
                isDragging
                  ? 'border-[#5147e5] bg-[#f0f0ff]'
                  : 'border-[#ededed] bg-[#f9f9fc] hover:border-[#5147e5]'
              }
            `}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              multiple={multiple}
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />

            <Upload size={24} className={`mb-2 ${isDragging ? 'text-[#5147e5]' : 'text-gray-400'}`} />
            <p className="px-4 text-center text-sm text-gray-600">
              Drag files here, or <span className="cursor-pointer text-[#5147e5]">click to browse</span>
            </p>
            <p className="mt-2 px-4 text-center text-xs text-gray-400">
              Supported: {accept.replace(/\./g, '').replace(/,/g, ', ')}
              <br />
              Max per file: {maxSize}MB
            </p>
          </div>

          {showProcessingModeToggle && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-xs font-medium text-gray-700">Processing Mode</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onProcessingModeChange?.('queue')}
                  className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                    processingMode === 'queue'
                      ? 'bg-[#5147e5] text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Queue Worker (Recommended)
                </button>
                <button
                  type="button"
                  onClick={() => onProcessingModeChange?.('immediate')}
                  className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                    processingMode === 'immediate'
                      ? 'bg-[#5147e5] text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Immediate (Legacy)
                </button>
              </div>
            </div>
          )}

          {files.length > 0 && (
            <div className="mt-4 max-h-48 space-y-2 overflow-y-auto">
              {files.map((file, index) => (
                <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded bg-gray-50 p-2">
                  <div className="flex min-w-0 flex-1 items-center">
                    <File size={16} className="mr-2 flex-shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-700">{file.name}</p>
                      <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFiles((prev) => prev.filter((_, i) => i !== index));
                    }}
                    className="ml-2 text-gray-400 transition-colors hover:text-red-500"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t p-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 transition-colors hover:text-gray-800"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={files.length === 0 || submitting}
            className="rounded bg-[#5147e5] px-4 py-2 text-white transition-colors hover:bg-[#4338ca] disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {submitting ? 'Uploading...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
