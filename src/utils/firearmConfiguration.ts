// A practical recorded description, not a complete specification or SAPS classification.
export const FIREARM_CONFIGURATIONS = [
  { value: 'OVER_UNDER', label: 'Over-and-Under (O/U)' },
  { value: 'SIDE_BY_SIDE', label: 'Side-by-Side (SxS)' },
  { value: 'PUMP_ACTION', label: 'Pump/slide-action' },
  { value: 'SEMI_AUTOMATIC', label: 'Semi-automatic' },
  { value: 'SINGLE_SHOT', label: 'Single-shot (mechanism not specified)' },
  { value: 'SINGLE_SHOT_BREAK_ACTION', label: 'Single-shot break-action' },
  { value: 'SINGLE_ACTION', label: 'Single-action' },
  { value: 'DOUBLE_ACTION', label: 'Double-action (single/double capable)' },
  { value: 'DOUBLE_ACTION_ONLY', label: 'Double-action-only' },
  { value: 'BOLT_ACTION', label: 'Bolt-action' },
  { value: 'STRAIGHT_PULL', label: 'Straight-pull' },
  { value: 'LEVER_ACTION', label: 'Lever-action' },
  { value: 'FALLING_BLOCK', label: 'Falling-block' },
  { value: 'BREAK_ACTION', label: 'Break-action' },
  { value: 'ROLLING_BLOCK', label: 'Rolling-block' },
  { value: 'AUTOMATIC', label: 'Automatic' },
  { value: 'SELECTIVE_FIRE', label: 'Selective-fire' },
  { value: 'OTHER', label: 'Other compatible configuration' },
] as const;
export type FirearmConfiguration = typeof FIREARM_CONFIGURATIONS[number]['value'];
const MANUAL: readonly FirearmConfiguration[] = ['BOLT_ACTION', 'STRAIGHT_PULL', 'LEVER_ACTION', 'PUMP_ACTION', 'FALLING_BLOCK', 'BREAK_ACTION', 'ROLLING_BLOCK', 'SINGLE_SHOT', 'SINGLE_SHOT_BREAK_ACTION', 'OTHER'];
export const FIREARM_CONFIGURATION_TYPES: Record<string, readonly FirearmConfiguration[]> = {
  PISTOL: ['SEMI_AUTOMATIC', 'SINGLE_SHOT', 'SINGLE_SHOT_BREAK_ACTION', 'OTHER'],
  REVOLVER: ['SINGLE_ACTION', 'DOUBLE_ACTION', 'DOUBLE_ACTION_ONLY', 'OTHER'],
  BOLT_ACTION_RIFLE: ['BOLT_ACTION', 'STRAIGHT_PULL'],
  LEVER_ACTION_RIFLE: ['LEVER_ACTION'],
  MANUAL_RIFLE: MANUAL,
  MANUAL_CARBINE: MANUAL,
  SHOTGUN: ['OVER_UNDER', 'SIDE_BY_SIDE', 'PUMP_ACTION', 'SEMI_AUTOMATIC', 'SINGLE_SHOT', 'SINGLE_SHOT_BREAK_ACTION', 'BOLT_ACTION', 'LEVER_ACTION', 'OTHER'],
  SELF_LOADING_RIFLE: ['SEMI_AUTOMATIC'],
  HAND_MACHINE_CARBINE: ['SEMI_AUTOMATIC', 'AUTOMATIC', 'SELECTIVE_FIRE', 'OTHER'],
  PISTOL_CALIBRE_CARBINE: ['SEMI_AUTOMATIC', 'BOLT_ACTION', 'STRAIGHT_PULL', 'LEVER_ACTION', 'PUMP_ACTION', 'SINGLE_SHOT', 'SINGLE_SHOT_BREAK_ACTION', 'OTHER'],
  OTHER: ['OTHER'],
};
export function firearmConfigurationOptions(type: string) {
  return FIREARM_CONFIGURATIONS.filter(option => FIREARM_CONFIGURATION_TYPES[type]?.includes(option.value));
}
export function compatibleFirearmConfiguration(type: string, configuration?: string | null): boolean {
  return !configuration || !!FIREARM_CONFIGURATION_TYPES[type]?.includes(configuration as FirearmConfiguration);
}
export function firearmConfigurationFields(type: string, configuration?: string | null, other?: string | null) {
  if (!configuration) return { firearm_configuration: null, firearm_configuration_other: null };
  if (!compatibleFirearmConfiguration(type, configuration)) throw new Error('Select a valid configuration compatible with the firearm type.');
  const description = other?.trim() ?? '';
  if (configuration === 'OTHER' && (!description || description.length > 120)) throw new Error('Describe the other compatible firearm configuration (1?120 characters).');
  return { firearm_configuration: configuration as FirearmConfiguration, firearm_configuration_other: configuration === 'OTHER' ? description : null };
}
// A type change resets generic OTHER as its compatibility must be reviewed again.
export function firearmConfigurationForTypeChange(previousType: string, type: string, configuration?: FirearmConfiguration | null, other?: string) {
  const keep = compatibleFirearmConfiguration(type, configuration) && (type === previousType || configuration !== 'OTHER');
  return { firearmConfiguration: keep ? configuration ?? null : null, firearmConfigurationOther: keep && configuration === 'OTHER' ? other ?? '' : '' };
}
export function recordedFirearmConfiguration(type: string, configuration?: string | null, other?: string | null) {
  try { return firearmConfigurationFields(type, configuration, other); }
  catch { return { firearm_configuration: null, firearm_configuration_other: null }; }
}
export function firearmConfigurationLabel(configuration?: string | null, other?: string | null): string {
  const option = FIREARM_CONFIGURATIONS.find(option => option.value === configuration);
  return option ? option.value === 'OTHER' ? 'Other: ' + (other ?? '') : option.label : 'Unknown / not recorded';
}
