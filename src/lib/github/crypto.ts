import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Symmetric encryption for GitHub tokens at rest (HB-6). Server-only — imports
// node:crypto and reads a secret key, so it must never reach the browser bundle.
//
// Stored format is base64 of `iv | authTag | ciphertext`. AES-256-GCM gives us
// authenticated encryption: decryption fails loudly if the ciphertext or IV was
// tampered with.

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

let key: Buffer | null = null;

// Load the key lazily so importing this module never throws at build time — the
// error is deferred until a token is actually encrypted/decrypted.
function getKey(): Buffer {
	if (key) return key;
	const raw = process.env.GITHUB_TOKEN_ENC_KEY;
	if (!raw) {
		throw new Error('GITHUB_TOKEN_ENC_KEY is not set');
	}
	const decoded = Buffer.from(raw, 'base64');
	if (decoded.length !== KEY_BYTES) {
		throw new Error(
			`GITHUB_TOKEN_ENC_KEY must decode to ${KEY_BYTES} bytes; generate with \`openssl rand -base64 32\``
		);
	}
	key = decoded;
	return key;
}

export function encryptToken(plaintext: string): string {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, getKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptToken(encoded: string): string {
	const data = Buffer.from(encoded, 'base64');
	const iv = data.subarray(0, IV_BYTES);
	const authTag = data.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
	const ciphertext = data.subarray(IV_BYTES + AUTH_TAG_BYTES);
	const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
