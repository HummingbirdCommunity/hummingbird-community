import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/** Support address shown in error/help copy. Single source for the whole app. */
export function getSupportEmail(): string {
	return process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@example.com';
}

/**
 * Get public base URL from environment variable.
 * Works in both server-side and client-side code.
 */
export function getPublicBaseUrl(fallback?: string): string {
	if (process.env.NEXT_PUBLIC_PUBLIC_BASE_URL) {
		return process.env.NEXT_PUBLIC_PUBLIC_BASE_URL;
	}
	if (fallback) {
		return fallback;
	}
	const isServer = typeof window === 'undefined';
	return isServer ? 'http://localhost:3000' : window.location.origin;
}
