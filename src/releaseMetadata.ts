export type ReleaseMetadata = {
  version: string;
  commit: string;
  sourceTimestamp: string;
  publicConfigFingerprint: string;
  releaseId: string;
  dirty: boolean;
};

export const releaseMetadata: Readonly<ReleaseMetadata> =
  __SCAVENGER_RELEASE__;
