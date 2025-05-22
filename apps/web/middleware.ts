import { NextResponse } from 'next/server';

export function middleware() {
  return NextResponse.next();   // do nothing
}

export const config = {
  matcher: '/(.*)',             // or remove config entirely
};
