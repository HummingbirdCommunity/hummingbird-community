import type { NextRequest } from 'next/server';
import { hasLocale } from 'next-intl';
import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';

import { routing } from '@/i18n/routing';

const intlMiddleware = createMiddleware(routing);

// A first path segment shaped like a language tag (e.g. "fr", "en-US") but not a
// supported locale is a mistyped locale, not a page. Redirect it to the English
// equivalent (strip the segment) instead of 404ing. Real page segments like
// "login" and valid locales pass through to next-intl untouched.
const localeLikeSegment = /^[a-z]{2}(-[a-z]{2})?$/i;

export default function middleware(request: NextRequest): NextResponse {
	const { pathname } = request.nextUrl;
	const firstSegment = pathname.split('/')[1] ?? '';

	if (firstSegment && !hasLocale(routing.locales, firstSegment) && localeLikeSegment.test(firstSegment)) {
		const url = request.nextUrl.clone();
		url.pathname = pathname.slice(firstSegment.length + 1) || '/';
		return NextResponse.redirect(url);
	}

	return intlMiddleware(request);
}

export const config = {
	// Skip API routes, Next.js internals, and files with an extension.
	matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
