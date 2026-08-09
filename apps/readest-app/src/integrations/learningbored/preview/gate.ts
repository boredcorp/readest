export const LEARNINGBORED_PREVIEW_PATH = '/design/learningbored' as const;
export const LEARNINGBORED_PREVIEW_ENV_KEY = 'ENABLE_LEARNINGBORED_READER_PREVIEW' as const;

export function isLearningBoredPreviewEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    environment['NODE_ENV'] !== 'production' &&
    environment[LEARNINGBORED_PREVIEW_ENV_KEY] === 'true'
  );
}
