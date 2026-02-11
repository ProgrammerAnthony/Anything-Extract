'use client';

import Link from 'next/link';

export default function Header() {
  return (
    <div className="w-full h-16 bg-[#26293b] flex items-center px-4 md:px-8">
      {/* Logo */}
      <div className="min-w-[280px] h-full flex items-center justify-center cursor-pointer">
        <Link href="/" className="text-white text-xl font-semibold">
          AnythingExtract
        </Link>
      </div>
    </div>
  );
}

