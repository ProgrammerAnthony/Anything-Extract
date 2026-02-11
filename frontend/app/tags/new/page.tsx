'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { tagApi } from '@/lib/api';

export default function NewTagPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    type: 'single_choice' as 'single_choice' | 'multiple_choice' | 'text_input',
    description: '',
    options: [] as string[],
    required: false,
  });
  const [newOption, setNewOption] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      alert('请输入标签名称');
      return;
    }

    if ((formData.type === 'single_choice' || formData.type === 'multiple_choice') && formData.options.length === 0) {
      alert('单选或多选类型需要至少一个选项');
      return;
    }

    setSaving(true);
    try {
      await tagApi.create(formData);
      router.push('/tags');
    } catch (error: any) {
      console.error('创建标签失败:', error);
      alert(error.response?.data?.error?.message || '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const addOption = () => {
    if (newOption.trim() && !formData.options.includes(newOption.trim())) {
      setFormData({
        ...formData,
        options: [...formData.options, newOption.trim()],
      });
      setNewOption('');
    }
  };

  const removeOption = (index: number) => {
    setFormData({
      ...formData,
      options: formData.options.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-gray-600 hover:text-gray-800 mb-4 flex items-center gap-1 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            返回
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">创建标签</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg border border-gray-200 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              标签名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5147e5] focus:border-transparent"
              required
              placeholder="请输入标签名称"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              标签类型 <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any, options: [] })}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5147e5] focus:border-transparent"
            >
              <option value="single_choice">单选</option>
              <option value="multiple_choice">多选</option>
              <option value="text_input">填空</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              标签描述
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5147e5] focus:border-transparent"
              rows={3}
              placeholder="请输入标签描述（可选）"
            />
          </div>

          {(formData.type === 'single_choice' || formData.type === 'multiple_choice') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                可选项 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addOption())}
                  className="flex-1 p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5147e5] focus:border-transparent"
                  placeholder="输入选项后按回车或点击添加"
                />
                <button
                  type="button"
                  onClick={addOption}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  添加
                </button>
              </div>
              {formData.options.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg">
                  {formData.options.map((option, index) => (
                    <span
                      key={index}
                      className="px-3 py-1.5 bg-[#5147e5] text-white rounded-full flex items-center gap-2 text-sm"
                    >
                      {option}
                      <button
                        type="button"
                        onClick={() => removeOption(index)}
                        className="text-white hover:text-red-200 transition-colors"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.required}
                onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
                className="w-4 h-4 text-[#5147e5] border-gray-300 rounded focus:ring-[#5147e5]"
              />
              <span className="text-sm text-gray-700">是否必填</span>
            </label>
          </div>

          <div className="flex gap-4 pt-4 border-t border-gray-200">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-[#5147e5] text-white rounded-lg hover:bg-[#4338ca] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {saving ? '保存中...' : '创建标签'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

