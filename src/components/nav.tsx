'use client';

import Link from 'next/link';
import { Show, UserButton } from '@clerk/nextjs';

export default function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0b0e14] border-b border-[#252b38]">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-[#c8cfd8] font-semibold tracking-tight">
          posture//watch
        </Link>

        <div className="flex items-center gap-4">
          <Show when="signed-out">
            <Link
              href="/sign-in"
              className="text-sm text-[#5c6370] hover:text-[#c8cfd8] transition-colors"
            >
              Sign in
            </Link>
          </Show>

          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="text-sm text-[#5c6370] hover:text-[#c8cfd8] transition-colors"
            >
              Dashboard
            </Link>
            <UserButton />
          </Show>
        </div>
      </div>
    </nav>
  );
}
