// LLM provider configuration. Each provider is an OpenAI-compatible endpoint.
// The workflow orchestrates fallback between providers — this module just
// exposes the configured provider list and a single-provider call function.
//
// Configure via env vars:
//   LLM_PROVIDERS=gemini,openrouter        (comma-separated, order = fallback priority)
//   GEMINI_API_KEY=...                      (Google AI Studio key)
//   OPENROUTER_API_KEY=...                  (OpenRouter key)
//   VERCEL_AI_GATEWAY_API_KEY=...           (Vercel AI Gateway key)
//
// Override model per provider:
//   GEMINI_MODEL=gemini-3.5-flash
//   OPENROUTER_MODEL=openrouter/free
//   GATEWAY_MODEL=alibaba/qwen3.5-flash

import OpenAI from 'openai';

export interface ProviderInfo {
	name: string;
	displayName: string;
	model: string;
}

interface Provider extends ProviderInfo {
	client: OpenAI;
	maxTokens?: number;
}

const PROVIDER_CONFIGS: Record<string, {
	displayName: string;
	envKey: string;
	baseURL: string;
	defaultModel: string;
	modelEnv: string;
	maxTokens?: number;
}> = {
	gemini: {
		displayName: 'Google',
		envKey: 'GEMINI_API_KEY',
		baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
		defaultModel: 'gemini-3.5-flash',
		modelEnv: 'GEMINI_MODEL',
	},
	openrouter: {
		displayName: 'OpenRouter',
		envKey: 'OPENROUTER_API_KEY',
		baseURL: 'https://openrouter.ai/api/v1',
		defaultModel: 'openrouter/free',
		modelEnv: 'OPENROUTER_MODEL',
		maxTokens: 4096,
	},
	gateway: {
		displayName: 'Vercel',
		envKey: 'VERCEL_AI_GATEWAY_API_KEY',
		baseURL: 'https://ai-gateway.vercel.sh/v1',
		defaultModel: 'alibaba/qwen3.5-flash',
		modelEnv: 'GATEWAY_MODEL',
	},
};

let providers: Provider[] | null = null;

function buildProviders(): Provider[] {
	if (providers) return providers;

	const providerNames = process.env.LLM_PROVIDERS?.split(',').map((s) => s.trim()).filter(Boolean);

	if (providerNames?.length) {
		providers = [];
		for (const name of providerNames) {
			const config = PROVIDER_CONFIGS[name];
			if (!config) throw new Error(`Unknown LLM provider: ${name}. Available: ${Object.keys(PROVIDER_CONFIGS).join(', ')}`);

			const apiKey = process.env[config.envKey];
			if (!apiKey) continue; // Skip providers without keys

			providers.push({
				name,
				displayName: config.displayName,
				client: new OpenAI({ apiKey, baseURL: config.baseURL }),
				model: process.env[config.modelEnv] ?? config.defaultModel,
				maxTokens: config.maxTokens,
			});
		}

		if (providers.length === 0) {
			throw new Error(`No API keys found for providers: ${providerNames.join(', ')}`);
		}
	} else if (process.env.LLM_API_KEY) {
		providers = [{
			name: 'default',
			displayName: 'LLM',
			client: new OpenAI({
				apiKey: process.env.LLM_API_KEY,
				baseURL: process.env.LLM_BASE_URL ?? 'https://openrouter.ai/api/v1',
			}),
			model: process.env.LLM_MODEL ?? 'openrouter/free',
		}];
	} else {
		throw new Error('No LLM configured. Set LLM_PROVIDERS or LLM_API_KEY in env.');
	}

	return providers;
}

/** Get the ordered list of configured providers (name + model). */
export function getProviders(): ProviderInfo[] {
	return buildProviders().map(({ name, displayName, model }) => ({ name, displayName, model }));
}

export interface LLMCallOptions {
	messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
	tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
}

export interface LLMCallResult {
	response: OpenAI.Chat.Completions.ChatCompletion;
	provider: string;
	model: string;
}

/** Error thrown when a provider returns a retryable error (429/402/403). */
export class ProviderUnavailableError extends Error {
	readonly status: number;
	readonly provider: string;
	readonly model: string;

	constructor(provider: string, model: string, status: number, message: string) {
		super(message);
		this.name = 'ProviderUnavailableError';
		this.status = status;
		this.provider = provider;
		this.model = model;
	}
}

/**
 * Call a single provider by name. Throws ProviderUnavailableError on 429/402/403
 * so the workflow can catch it and try the next provider.
 */
export async function llmChatWithProvider(
	providerName: string,
	opts: LLMCallOptions,
): Promise<LLMCallResult> {
	const chain = buildProviders();
	const provider = chain.find((p) => p.name === providerName);
	if (!provider) throw new Error(`Provider not found: ${providerName}`);

	try {
		const response = await provider.client.chat.completions.create({
			model: provider.model,
			messages: opts.messages,
			tools: opts.tools,
			...(provider.maxTokens ? { max_completion_tokens: provider.maxTokens } : {}),
		});

		return { response, provider: provider.name, model: provider.model };
	} catch (err) {
		if (err instanceof OpenAI.APIError && (err.status === 429 || err.status === 402 || err.status === 403)) {
			throw new ProviderUnavailableError(
				provider.name,
				provider.model,
				err.status,
				err.message,
			);
		}
		throw err;
	}
}
