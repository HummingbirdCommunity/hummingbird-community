import { createHmac, timingSafeEqual } from 'node:crypto';
import type { User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/server';

// Request-auth and CSRF-state helpers for the GitHub OAuth flow (HB-6).
// Server-only.

export const STATE_COOKIE = 'gh_oauth_state';

// The OAuth round-trip (authorize → GitHub → callback) should complete quickly;
// a short TTL limits the window for a stolen/replayed state cookie.
const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthState {
	// Random CSRF token echoed back by GitHub; the callback compares it to the
	// `state` query param.
	state: string;
	// The signed-in user this flow belongs to, captured at authorize time so the
	// callback (a top-level redirect with no bearer) knows whom to link.
	userId: string;
}

export const stateCookieOptions = {
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	sameSite: 'lax' as const,
	path: '/',
	maxAge: STATE_TTL_MS / 1000,
};

function hmacKey(): string {
	const secret = process.env.GITHUB_CLIENT_SECRET;
	if (!secret) throw new Error('GITHUB_CLIENT_SECRET is not set');
	return secret;
}

function sign(payload: string): string {
	return createHmac('sha256', hmacKey()).update(payload).digest('base64url');
}

// The cookie is HMAC-signed so the browser can't tamper with the bound userId.
export function encodeState(data: OAuthState): string {
	const payload = Buffer.from(JSON.stringify({ ...data, iat: Date.now() })).toString('base64url');
	return `${payload}.${sign(payload)}`;
}

export function decodeState(value: string | undefined): OAuthState | null {
	if (!value) return null;
	const [payload, signature] = value.split('.');
	if (!payload || !signature) return null;

	const expected = sign(payload);
	const signatureBuf = Buffer.from(signature);
	const expectedBuf = Buffer.from(expected);
	if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
		return null;
	}

	try {
		const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as OAuthState & { iat: number };
		if (Date.now() - parsed.iat > STATE_TTL_MS) return null;
		return { state: parsed.state, userId: parsed.userId };
	} catch {
		return null;
	}
}

// Identify the caller from their Supabase access token. Returns null when the
// bearer is missing or invalid, so callers can answer 401.
export async function getUserFromRequest(request: Request): Promise<User | null> {
	const header = request.headers.get('authorization');
	const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
	if (!token) return null;

	const { data, error } = await supabase.auth.getUser(token);
	if (error) return null;
	return data.user;
}

export interface ResolvedTarget {
	callerId: string;
	targetId: string;
	impersonating: boolean;
}

// Resolve whose data a read route should serve: the caller, or — when an admin
// passes `?viewAs=<id>` — that target user. The admin gate is the whole security
// boundary of the "view as user" feature (HB-15): a non-admin's `viewAs` is
// silently ignored so they only ever get their own data, never someone else's.
// Returns null when the caller is unauthenticated so routes can answer 401.
export async function resolveTargetUserId(request: Request): Promise<ResolvedTarget | null> {
	const user = await getUserFromRequest(request);
	if (!user) return null;

	const viewAs = new URL(request.url).searchParams.get('viewAs');
	if (!viewAs || viewAs === user.id) {
		return { callerId: user.id, targetId: user.id, impersonating: false };
	}

	const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
	if (!profile?.is_admin) {
		return { callerId: user.id, targetId: user.id, impersonating: false };
	}

	return { callerId: user.id, targetId: viewAs, impersonating: true };
}
