import { NextRequest, NextResponse } from 'next/server';

import {
  isLearningBoredPreviewEnabled,
  LEARNINGBORED_PREVIEW_PATH,
} from './integrations/learningbored/preview/gate';

const allowedOrigins = [
  'https://web.readest.com',
  'https://tauri.localhost',
  'http://tauri.localhost',
  'http://localhost:3000',
  'http://localhost:3001',
  'tauri://localhost',
];

const corsOptions = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === LEARNINGBORED_PREVIEW_PATH) {
    if (!isLearningBoredPreviewEnabled()) {
      return new NextResponse(null, {
        status: 404,
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Robots-Tag': 'noindex, nofollow, noarchive',
        },
      });
    }

    return NextResponse.next();
  }

  const origin = request.headers.get('origin') ?? '';
  const isAllowedOrigin = allowedOrigins.includes(origin);

  if (request.method === 'OPTIONS') {
    const preflightHeaders = new Headers({
      ...corsOptions,
      ...(isAllowedOrigin && { 'Access-Control-Allow-Origin': origin }),
    });

    return new NextResponse(null, {
      status: 200,
      headers: preflightHeaders,
    });
  }

  const response = NextResponse.next();

  if (isAllowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }

  Object.entries(corsOptions).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export const config = {
  matcher: ['/design/learningbored', '/api/:path*', '/api/stripe/:path*', '/api/metadata/:path*'],
};
