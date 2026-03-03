'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import { usePageContext } from '@/components/layout/PageContext';
import { ParserMode, ParserModelSource, systemApi } from '@/lib/api';

interface ParserConfigState {
  mode: ParserMode;
  enable_ocr_server: boolean;
  enable_pdf_parser_server: boolean;
  ocr_server_url: string;
  pdf_parser_server_url: string;
  model_source: ParserModelSource;
}

const DEFAULT_STATE: ParserConfigState = {
  mode: 'local',
  enable_ocr_server: false,
  enable_pdf_parser_server: false,
  ocr_server_url: 'http://127.0.0.1:7001',
  pdf_parser_server_url: 'http://127.0.0.1:9009',
  model_source: 'docker-model',
};

export default function SystemSettingsPage() {
  const { secondaryCollapsed, onOpenSidebar } = usePageContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parserConfig, setParserConfig] = useState<ParserConfigState>(DEFAULT_STATE);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await systemApi.getConfig();
      const parser = response?.data?.data?.parser;
      if (parser) {
        setParserConfig({
          mode: (parser.mode || 'local') as ParserMode,
          enable_ocr_server: Boolean(parser.enable_ocr_server),
          enable_pdf_parser_server: Boolean(parser.enable_pdf_parser_server),
          ocr_server_url: parser.ocr_server_url || DEFAULT_STATE.ocr_server_url,
          pdf_parser_server_url: parser.pdf_parser_server_url || DEFAULT_STATE.pdf_parser_server_url,
          model_source: (parser.model_source || 'docker-model') as ParserModelSource,
        });
      }
    } catch (error) {
      console.error('加载系统配置失败:', error);
      setMessage('加载配置失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const response = await systemApi.updateConfig({ parser: parserConfig });
      const parser = response?.data?.data?.parser;
      if (parser) {
        setParserConfig({
          mode: (parser.mode || 'local') as ParserMode,
          enable_ocr_server: Boolean(parser.enable_ocr_server),
          enable_pdf_parser_server: Boolean(parser.enable_pdf_parser_server),
          ocr_server_url: parser.ocr_server_url || DEFAULT_STATE.ocr_server_url,
          pdf_parser_server_url: parser.pdf_parser_server_url || DEFAULT_STATE.pdf_parser_server_url,
          model_source: (parser.model_source || 'docker-model') as ParserModelSource,
        });
      }
      setMessage('解析服务配置已保存。');
    } catch (error: any) {
      console.error('保存系统配置失败:', error);
      setMessage(error?.response?.data?.detail || '保存失败，请检查参数');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#f3f6fd]">
      <PageHeader title="系统设置" secondaryCollapsed={secondaryCollapsed} onOpenSidebar={onOpenSidebar} />

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-800">阶段 3 解析服务开关</h2>
            <p className="mt-1 text-sm text-gray-500">
              可选启用 OCR/PDF 解析服务。推荐策略为 Hybrid（先服务解析，失败自动回退本地）。
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <span className="text-sm font-medium text-gray-700">启用 OCR 服务</span>
                <input
                  type="checkbox"
                  checked={parserConfig.enable_ocr_server}
                  onChange={(e) =>
                    setParserConfig((prev) => ({ ...prev, enable_ocr_server: e.target.checked }))
                  }
                />
              </label>

              <label className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <span className="text-sm font-medium text-gray-700">启用 PDF 解析服务</span>
                <input
                  type="checkbox"
                  checked={parserConfig.enable_pdf_parser_server}
                  onChange={(e) =>
                    setParserConfig((prev) => ({ ...prev, enable_pdf_parser_server: e.target.checked }))
                  }
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">OCR 服务地址</label>
                <input
                  value={parserConfig.ocr_server_url}
                  onChange={(e) => setParserConfig((prev) => ({ ...prev, ocr_server_url: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#5147e5] focus:outline-none"
                  placeholder="http://127.0.0.1:7001"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">PDF 服务地址</label>
                <input
                  value={parserConfig.pdf_parser_server_url}
                  onChange={(e) => setParserConfig((prev) => ({ ...prev, pdf_parser_server_url: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#5147e5] focus:outline-none"
                  placeholder="http://127.0.0.1:9009"
                />
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">解析策略</label>
                <select
                  value={parserConfig.mode}
                  onChange={(e) =>
                    setParserConfig((prev) => ({ ...prev, mode: e.target.value as ParserMode }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#5147e5] focus:outline-none"
                >
                  <option value="local">Local（仅本地解析）</option>
                  <option value="server">Server（仅服务解析）</option>
                  <option value="hybrid">Hybrid（服务优先 + 本地回退）</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">模型来源</label>
                <select
                  value={parserConfig.model_source}
                  onChange={(e) =>
                    setParserConfig((prev) => ({ ...prev, model_source: e.target.value as ParserModelSource }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#5147e5] focus:outline-none"
                >
                  <option value="docker-model">docker-model（推荐）</option>
                  <option value="local-model">local-model（自备模型目录）</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-[#5147e5] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4338ca] disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {saving ? '保存中...' : '保存配置'}
              </button>
              <button
                onClick={loadConfig}
                disabled={saving}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                刷新
              </button>
              {message && <span className="text-sm text-gray-600">{message}</span>}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-gray-800">本地启动提示</h3>
            <p className="mt-2 text-sm text-gray-600">
              可在启动脚本中使用以下参数快速拉起阶段 3 依赖：
              <code className="ml-1 rounded bg-gray-100 px-1.5 py-0.5">
                --with-ocr-server --with-pdf-server --with-qanything-models-docker
              </code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

