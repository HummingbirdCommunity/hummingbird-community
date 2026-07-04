import { supabase } from '@/lib/supabase/client';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const PDF_MIME = 'application/pdf';
const BUCKET = 'submissions';

export type SubmissionKind = 'resume' | 'jd';
export type FileValidationError = 'not-pdf' | 'too-large';

const KIND_CONFIG: Record<SubmissionKind, { folder: string; table: string }> = {
	resume: { folder: 'resumes', table: 'resumes' },
	jd: { folder: 'jds', table: 'uploaded_jds' },
};

export function validateFile(file: File): FileValidationError | null {
	if (file.type !== PDF_MIME) return 'not-pdf';
	if (file.size > MAX_FILE_BYTES) return 'too-large';
	return null;
}

export async function submitFile(kind: SubmissionKind, file: File): Promise<void> {
	const { folder, table } = KIND_CONFIG[kind];

	// Run as the signed-in user so Storage stamps owner_id — the bucket's RLS
	// keys off ownership, and the table insert must satisfy auth.uid() = user_id.
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	if (authError || !user) throw authError ?? new Error('Not signed in');

	const path = `${folder}/${user.id}/${crypto.randomUUID()}.pdf`;

	const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: PDF_MIME });
	if (uploadError) throw uploadError;

	const { error: insertError } = await supabase.from(table).insert({ user_id: user.id, file_path: path });
	if (insertError) {
		await supabase.storage.from(BUCKET).remove([path]);
		throw insertError;
	}
}
