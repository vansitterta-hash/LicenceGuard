-- Revised before application: generic canonical description; no SAPS classification.
begin;

alter table public.firearms
  add column firearm_configuration text,
  add column firearm_configuration_other text,
  add constraint firearms_configuration_check check (
    (firearm_configuration is null and firearm_configuration_other is null)
    or (
      firearm_configuration is not null
      and (
      (firearm_type = 'PISTOL' and firearm_configuration in ('SEMI_AUTOMATIC', 'SINGLE_SHOT', 'SINGLE_SHOT_BREAK_ACTION', 'OTHER'))
      or
      (firearm_type = 'REVOLVER' and firearm_configuration in ('SINGLE_ACTION', 'DOUBLE_ACTION', 'DOUBLE_ACTION_ONLY', 'OTHER'))
      or
      (firearm_type = 'BOLT_ACTION_RIFLE' and firearm_configuration in ('BOLT_ACTION', 'STRAIGHT_PULL'))
      or
      (firearm_type = 'LEVER_ACTION_RIFLE' and firearm_configuration in ('LEVER_ACTION'))
      or
      (firearm_type = 'MANUAL_RIFLE' and firearm_configuration in ('BOLT_ACTION', 'STRAIGHT_PULL', 'LEVER_ACTION', 'PUMP_ACTION', 'FALLING_BLOCK', 'BREAK_ACTION', 'ROLLING_BLOCK', 'SINGLE_SHOT', 'SINGLE_SHOT_BREAK_ACTION', 'OTHER'))
      or
      (firearm_type = 'MANUAL_CARBINE' and firearm_configuration in ('BOLT_ACTION', 'STRAIGHT_PULL', 'LEVER_ACTION', 'PUMP_ACTION', 'FALLING_BLOCK', 'BREAK_ACTION', 'ROLLING_BLOCK', 'SINGLE_SHOT', 'SINGLE_SHOT_BREAK_ACTION', 'OTHER'))
      or
      (firearm_type = 'SHOTGUN' and firearm_configuration in ('OVER_UNDER', 'SIDE_BY_SIDE', 'PUMP_ACTION', 'SEMI_AUTOMATIC', 'SINGLE_SHOT', 'SINGLE_SHOT_BREAK_ACTION', 'BOLT_ACTION', 'LEVER_ACTION', 'OTHER'))
      or
      (firearm_type = 'SELF_LOADING_RIFLE' and firearm_configuration in ('SEMI_AUTOMATIC'))
      or
      (firearm_type = 'HAND_MACHINE_CARBINE' and firearm_configuration in ('SEMI_AUTOMATIC', 'AUTOMATIC', 'SELECTIVE_FIRE', 'OTHER'))
      or
      (firearm_type = 'PISTOL_CALIBRE_CARBINE' and firearm_configuration in ('SEMI_AUTOMATIC', 'BOLT_ACTION', 'STRAIGHT_PULL', 'LEVER_ACTION', 'PUMP_ACTION', 'SINGLE_SHOT', 'SINGLE_SHOT_BREAK_ACTION', 'OTHER'))
      or
      (firearm_type = 'OTHER' and firearm_configuration in ('OTHER'))
      )
      and (
        (firearm_configuration = 'OTHER' and firearm_configuration_other is not null
          and length(btrim(firearm_configuration_other)) between 1 and 120)
        or (firearm_configuration <> 'OTHER' and firearm_configuration_other is null)
      )
    )
  );

commit;
