import { normalizeLowercaseStringOrEmpty } from "@openclaw/normalization-core/string-coerce";

/**
 * After lowercasing, a word-final capital sigma becomes final sigma (ς) while a
 * typed Σ or σ stays medial sigma (σ). Fold ς so case-insensitive search treats
 * all three forms as one letter without rewriting stored titles or paths.
 */
export function foldSearchSigma(value: string): string {
  return value.replaceAll("ς", "σ");
}

/** Titles share canonical Unicode and word separators across Gateway selection and palette ranking. */
export function normalizeSessionSearchText(value: unknown): string {
  return foldSearchSigma(normalizeLowercaseStringOrEmpty(value).normalize("NFC"))
    .replace(/[\p{P}\s]+/gu, " ")
    .trim();
}
