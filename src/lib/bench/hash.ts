import { createHash } from "node:crypto";

export type Digest = { sha256: string; sha512: string };

export function sha256(buf: Buffer | Uint8Array) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha512(buf: Buffer | Uint8Array) {
  return createHash("sha512").update(buf).digest("hex");
}

export function digest(buf: Buffer | Uint8Array): Digest {
  return { sha256: sha256(buf), sha512: sha512(buf) };
}

export function digestsMatch(a: Digest, b: Digest) {
  return a.sha256 === b.sha256 && a.sha512 === b.sha512;
}

/** FIPS 180-4 empty-message vectors. */
export const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
export const EMPTY_SHA512 =
  "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e";
