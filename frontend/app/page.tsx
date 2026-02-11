import Link from 'next/link';
import { Tag, FileText, Search, ArrowRight, Upload } from 'lucide-react';

export default function Home() {
  const features = [
    {
      title: '知识库管理',
      description: '创建和管理知识库',
      href: '/knowledge-bases',
      icon: FileText,
      color: 'from-purple-500 to-purple-600',
    },
    {
      title: '标签配置',
      description: '创建和管理提取标签',
      href: '/tags',
      icon: Tag,
      color: 'from-blue-500 to-blue-600',
    },
    {
      title: '信息提取',
      description: '执行信息提取任务',
      href: '/extract',
      icon: Search,
      color: 'from-pink-500 to-pink-600',
    },
  ];

  return (
    <main className="p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-4">
            AnythingKnowledge 知识库管理
          </h1>
          <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
            构建文档知识库，高效检索文档信息，高效抽取文档内容，准确回答专业问题
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link
                key={feature.href}
                href={feature.href}
                className="group relative bg-white p-6 rounded-lg border border-gray-200 hover:shadow-lg transition-all duration-300 overflow-hidden"
              >
                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${feature.color} opacity-10 rounded-full -mr-16 -mt-16 group-hover:opacity-20 transition-opacity`} />
                <div className="relative">
                  <div className={`inline-flex p-3 rounded-lg bg-gradient-to-br ${feature.color} mb-4`}>
                    <Icon className="text-white" size={24} />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-800 mb-2">
                    {feature.title}
                  </h2>
                  <p className="text-gray-600 mb-4">{feature.description}</p>
                  <div className="flex items-center text-[#5147e5] group-hover:translate-x-1 transition-transform">
                    <span className="text-sm font-medium">开始使用</span>
                    <ArrowRight size={16} className="ml-1" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Main Illustration Area */}
        <div className="bg-white rounded-lg border border-gray-200 p-8 md:p-12 text-center">
          <div className="max-w-2xl mx-auto">
            <div className="mb-6">
              <div className="inline-block p-4 bg-gradient-to-br from-[#7b5ef2] to-[#c383fe] rounded-lg mb-4">
                <FileText className="text-white" size={48} />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-4">
              上传文档开始使用
            </h3>
            <p className="text-gray-600 mb-6">
              支持 PDF、Word 等多种格式，快速构建您的专属知识库
            </p>
            <Link
              href="/knowledge-bases"
              className="inline-flex items-center px-6 py-3 bg-[#5147e5] text-white rounded-lg hover:bg-[#4338ca] transition-colors"
            >
              <Upload className="mr-2" size={20} />
              管理知识库
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

