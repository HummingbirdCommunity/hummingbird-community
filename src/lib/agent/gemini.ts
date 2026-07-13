// Gemini API client wrapper. Lazily initializes the SDK so the import is
// safe in environments where GEMINI_API_KEY isn't set (e.g., client bundles).

import { GoogleGenAI } from '@google/genai';

let client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
	if (!client) {
		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
		client = new GoogleGenAI({ apiKey });
	}
	return client;
}

/** Generate a structured JSON response from Gemini using a JSON Schema. */
export async function generateStructuredOutput<T>(opts: {
	model?: string;
	systemPrompt: string;
	userPrompt: string;
	schema: Record<string, unknown>;
}): Promise<T> {
	const ai = getGeminiClient();
	const response = await ai.models.generateContent({
		model: opts.model ?? 'gemini-3.5-flash',
		contents: opts.userPrompt,
		config: {
			systemInstruction: opts.systemPrompt,
			responseMimeType: 'application/json',
			responseSchema: opts.schema,
		},
	});
	return JSON.parse(response.text!) as T;
}
