export type ReleaseMetadata = {
  version: string;
  commit: string;
  sourceTimestamp: string;
  publicConfigFingerprint: string;
  releaseId: string;
  dirty: boolean;
};

export function resolveReleaseMetadata(options?: {
  root?: string;
  environment?: NodeJS.ProcessEnv;
}): ReleaseMetadata;

export function resolvePublicConfigFingerprint(
  environment?: NodeJS.ProcessEnv,
): string;
