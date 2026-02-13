import { decode as nip19decode } from "snstr";

/**
 * Normalize a private key to 64-char lowercase hex.
 * Accepts:
 * - 64-char hex
 * - nsec (NIP-19)
 */
export function normalizePrivateKey(privateKey: string): string {
  const pk = privateKey.trim();

  if (pk.startsWith("nsec")) {
    // Validate nsec format before type assertion
    if (!/^nsec1[0-9a-z]+$/.test(pk)) {
      throw new Error("Invalid nsec format: must match pattern nsec1[0-9a-z]+");
    }

    const decoded = nip19decode(pk as `${string}1${string}`);
    if (decoded.type !== "nsec") {
      throw new Error("Invalid nsec format");
    }
    return String(decoded.data).toLowerCase();
  }

  // Validate hex format for non-nsec keys
  if (!/^[0-9a-f]{64}$/i.test(pk)) {
    throw new Error("Invalid private key format: must be 64-character hex string or valid nsec format");
  }

  return pk.toLowerCase();
}

