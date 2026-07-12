import { supabase } from '@/lib/supabase/client';

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const LOGO_BUCKET = 'project-logos';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const EXTENSION_BY_TYPE: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
};

export type LogoValidationError = 'not-image' | 'too-large';

export interface Project {
	id: string;
	owner_id: string;
	name: string;
	tagline: string;
	manifesto: string;
	repo_url: string | null;
	logo_path: string | null;
	created_at: string;
}

export interface CreateProjectInput {
	name: string;
	tagline: string;
	manifesto: string;
	repoUrl?: string;
	logo?: File | null;
}

export function validateLogo(file: File): LogoValidationError | null {
	if (!ALLOWED_LOGO_TYPES.includes(file.type)) return 'not-image';
	if (file.size > MAX_LOGO_BYTES) return 'too-large';
	return null;
}

// Add https:// to a bare host (github.com/x) so it becomes a clickable link;
// inputs that already carry a scheme are left for the render-time allowlist.
function normalizeRepoUrl(raw: string | undefined): string | null {
	const trimmed = raw?.trim();
	if (!trimmed) return null;
	return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export async function createProject(input: CreateProjectInput): Promise<void> {
	// Run as the signed-in user so Storage stamps owner_id — the logo bucket's RLS
	// keys off ownership, and the row insert must satisfy auth.uid() = owner_id.
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	if (authError || !user) throw authError ?? new Error('Not signed in');

	let logoPath: string | null = null;
	if (input.logo) {
		const ext = EXTENSION_BY_TYPE[input.logo.type] ?? 'png';
		logoPath = `${user.id}/${crypto.randomUUID()}.${ext}`;
		const { error: uploadError } = await supabase.storage
			.from(LOGO_BUCKET)
			.upload(logoPath, input.logo, { contentType: input.logo.type });
		if (uploadError) throw uploadError;
	}

	const { error: insertError } = await supabase.from('projects').insert({
		owner_id: user.id,
		name: input.name.trim(),
		tagline: input.tagline.trim(),
		manifesto: input.manifesto.trim(),
		repo_url: normalizeRepoUrl(input.repoUrl),
		logo_path: logoPath,
	});
	if (insertError) {
		if (logoPath) await supabase.storage.from(LOGO_BUCKET).remove([logoPath]);
		throw insertError;
	}
}

// Mirrors supabase.storage.getPublicUrl without pulling a client into server
// rendering: logo paths are hex/uuid segments, so no extra encoding is needed.
export function logoPublicUrl(path: string): string {
	return `${SUPABASE_URL}/storage/v1/object/public/${LOGO_BUCKET}/${path}`;
}
