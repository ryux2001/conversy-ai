export const WHISPER_MODEL_ID = process.env.NEXT_PUBLIC_WHISPER_MODEL_ID?.trim()
  || "onnx-community/whisper-base.en";
export const WHISPER_SUPPORTED_MODEL_ID = "onnx-community/whisper-base.en";
export const WHISPER_MODEL_SOURCE = process.env.NEXT_PUBLIC_WHISPER_MODEL_SOURCE === "local" ? "local" : "hub";
export const WHISPER_REVISION = "51eefc0af78b103839eda9e7e4f4186acc6517fe";
export const WHISPER_CACHE_KEY_FRAGMENT = `${WHISPER_MODEL_ID}/resolve/${WHISPER_REVISION}/`;
export const WHISPER_CACHE_NAME = `conversy-whisper-${WHISPER_MODEL_ID.replaceAll("/", "-")}-${WHISPER_REVISION}`;
export const WHISPER_LOCAL_BASE = "/api/local-models/";
export const WHISPER_ESTIMATED_BYTES = 207 * 1024 * 1024;

export const WHISPER_REQUIRED_FILES = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "vocab.json",
  "merges.txt",
  "normalizer.json",
  "added_tokens.json",
  "special_tokens_map.json",
  "quantize_config.json",
  "onnx/encoder_model.onnx",
  "onnx/decoder_model_merged_q4.onnx",
] as const;

export const WHISPER_CACHE_VERIFICATION_FILES = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/encoder_model.onnx",
  "onnx/decoder_model_merged_q4.onnx",
] as const;

export function getLocalModelUrl(filePath: string): string {
  return `${WHISPER_LOCAL_BASE}${WHISPER_MODEL_ID}/${filePath}`;
}
