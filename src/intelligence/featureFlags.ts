import type { IntelligenceFeatureFlag } from './types';

export type IntelligenceFeatureFlags = Record<IntelligenceFeatureFlag, boolean>;

export const DEFAULT_INTELLIGENCE_FEATURE_FLAGS: Readonly<IntelligenceFeatureFlags> = {
  READ_ONLY_INTELLIGENCE: false,
  PRIVATE_LIBRARY_INTEGRATION: false,
  PROACTIVE_RENEWALS: false,
  DEALER_LIBRARY: false,
  PUBLIC_LIBRARY: false,
  LEARNING_FEEDBACK: false,
};

export function resolveIntelligenceFeatureFlags(
  overrides: Partial<IntelligenceFeatureFlags> = {}
): IntelligenceFeatureFlags {
  return { ...DEFAULT_INTELLIGENCE_FEATURE_FLAGS, ...overrides };
}

export function isIntelligenceFeatureEnabled(
  feature: IntelligenceFeatureFlag,
  overrides: Partial<IntelligenceFeatureFlags> = {}
): boolean {
  return resolveIntelligenceFeatureFlags(overrides)[feature];
}

export function getLocalIntelligenceFeatureFlags(): IntelligenceFeatureFlags {
  return resolveIntelligenceFeatureFlags({
    READ_ONLY_INTELLIGENCE:
      process.env.EXPO_PUBLIC_LG_READ_ONLY_INTELLIGENCE === 'true',
    PRIVATE_LIBRARY_INTEGRATION:
      process.env.EXPO_PUBLIC_LG_PRIVATE_LIBRARY_INTEGRATION === 'true',
    PROACTIVE_RENEWALS:
      process.env.EXPO_PUBLIC_LG_PROACTIVE_RENEWALS === 'true',
  });
}
