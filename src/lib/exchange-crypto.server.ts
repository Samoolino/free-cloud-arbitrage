import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1:";

function key(): Buffer {
  const configured = process.env.EXCHANGE_CREDENTIALS_ENCRYPTION_KEY;
  if (!configured) throw new Error("EXCHANGE_CREDENTIALS_ENCRYPTION_KEY is not configured");
  const value = /^[0-9a-fA-F]{64}$/.test(configured)
    ? Buffer.from(configured, "hex")
    : createHash("sha256").update(configured).digest();
  if (value.length !== 32) throw new Error("credential encryption key must resolve to 32 bytes");
  return value;
}

export function encryptExchangeSecret(value: string): string {
  if (!value) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptExchangeSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (!value.startsWith(PREFIX)) {
    // Backward compatibility for the old btoa() representation. Existing
    // credentials should be re-saved through the UI to migrate them.
    return Buffer.from(value, "base64").toString("utf8");
  }
  const [ivText, tagText, ciphertextText] = value.slice(PREFIX.length).split(".");
  if (!ivText || !tagText || !ciphertextText) throw new Error("invalid encrypted exchange credential");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
