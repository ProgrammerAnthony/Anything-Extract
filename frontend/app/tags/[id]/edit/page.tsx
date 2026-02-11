'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { tagApi } from '@/lib/api';

export default function EditTagPage() {
  const router = useRouter();
  const params = useParams();
  const tagId = params.id as string;
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'single_choice' as 'single_choice' | 'multiple_choice' | 'text_input',
    description: '',
    options: [] as string[],
    required: false,
  });
  const [newOption, setNewOption] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTag();
  }, [tagId]);

  const loadTag = async () => {
    try {
      const response = await tagApi.getById(tagId);
      if (response.data.success) {
        const tag = response.data.data.tag;
        setFormData({
          name: tag.name,
          type: tag.type,
          description: tag.description || '',
          options: tag.options || [],
          required: tag.required,
        });
      }
    } catch (error) {
      console.error('加载标签失败:', error);
      alert('加载标签失败');
      router.push('/tags');
    } finally {
      setLoading(false);
    }
  };

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
      await tagApi.update(tagId, formData);
      router.push('/tags');
    } catch (error: any) {
      console.error('更新标签失败:', error);
      alert(error.response?.data?.error?.message || '更新失败');
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

  if (loading) {
    return <div className="p-8">加载中...</div>;
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-blue-500 hover:text-blue-700 mb-4"
          >
            ← 返回
          </button>
          <h1 className="text-4xl font-bold">编辑标签</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              标签名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full p-2 border rounded"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              标签类型 <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any, options: [] })}
              className="w-full p-2 border rounded"
            >
              <option value="single_choice">单选</option>
              <option value="multiple_choice">多选</option>
              <option value="text_input">填空</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              标签描述
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full p-2 border rounded"
              rows={3}
            />
          </div>

          {(formData.type === 'single_choice' || formData.type === 'multiple_choice') && (
            <div>
              <label className="block text-sm font-medium mb-2">
                可选项 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addOption())}
                  className="flex-1 p-2 border rounded"
                  placeholder="输入选项后按回车或点击添加"
                />
                <button
                  type="button"
                  onClick={addOption}
                  className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                >
                  添加
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.options.map((option, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full flex items-center gap-2"
                  >
                    {option}
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.required}
                onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
              />
              <span>是否必填</span>
            </label>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
            >
              {saving ? '保存中...' : '保存更改'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

