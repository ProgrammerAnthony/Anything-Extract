'use client';

import { useState, useRef, DragEvent } from 'react';
import { Upload, X, File } from 'lucide-react';

interface FileUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (files: File[]) => void;
  accept?: string;
  maxSize?: number; // in MB
  multiple?: boolean;
}

export default function FileUploadDialog({
  open,
  onClose,
  onConfirm,
  accept = '.pdf,.docx,.txt,.md,.csv,.json,.xlsx,.pptx,.eml',
  maxSize = 100, // 100MB
  multiple = true,
}: FileUploadDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const fileArray = Array.from(selectedFiles);
    const validFiles: File[] = [];

    fileArray.forEach((file) => {
      // 检查文件大小
      if (file.size > maxSize * 1024 * 1024) {
        alert(`${file.name} 文件太大，不能超过 ${maxSize}MB`);
        return;
      }

      // 检查文件类型
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (accept && !accept.split(',').includes(extension)) {
        alert(`${file.name} 的文件格式不符`);
        return;
      }

      validFiles.push(file);
    });

    if (multiple) {
      setFiles((prev) => [...prev, ...validFiles]);
    } else {
      setFiles(validFiles);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = () => {
    if (files.length > 0) {
      onConfirm(files);
      setFiles([]);
      onClose();
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">上传文档</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Upload area */}
          <div
            className={`
              relative h-64 rounded-lg border-2 border-dashed
              flex flex-col items-center justify-center cursor-pointer
              transition-colors
              ${
                isDragging
                  ? 'border-[#5147e5] bg-[#f0f0ff]'
                  : 'border-[#ededed] bg-[#f9f9fc] hover:border-[#5147e5]'
              }
            `}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleClick}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              multiple={multiple}
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />

            <Upload
              size={24}
              className={`mb-2 ${isDragging ? 'text-[#5147e5]' : 'text-gray-400'}`}
            />
            <p className="text-sm text-gray-600 text-center px-4">
              将文件拖到此处，或
              <span className="text-[#5147e5] cursor-pointer">点击上传</span>
            </p>
            <p className="text-xs text-gray-400 mt-2 px-4 text-center">
              支持文件格式: {accept.replace(/\./g, '').replace(/,/g, '、')}
              <br />
              单个文档 &lt; {maxSize}M
            </p>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded"
                >
                  <div className="flex items-center flex-1 min-w-0">
                    <File size={16} className="text-gray-400 mr-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">{file.name}</p>
                      <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(index);
                    }}
                    className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={files.length === 0}
            className="px-4 py-2 bg-[#5147e5] text-white rounded hover:bg-[#4338ca] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

