begin;

-- Provision only explicitly requested public registrations. Existing/admin-created
-- accounts and all existing privacy/RLS policies remain unchanged.
create or replace function public.initialize_public_registration()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_dealer_id uuid;
  v_first text := btrim(new.raw_user_meta_data->>'first_name');
  v_surname text := btrim(new.raw_user_meta_data->>'surname');
  v_id text := new.raw_user_meta_data->>'id_number';
  v_sum integer := 0;
  v_digit integer;
  v_index integer;
begin
  if new.raw_user_meta_data->>'licenceguard_registration' is distinct from 'v1' then
    return new;
  end if;
  if coalesce(length(v_first), 0) not between 1 and 100
     or coalesce(length(v_surname), 0) not between 1 and 100
     or coalesce(v_id, '') !~ '^[0-9]{13}$'
     or new.email is null then
    raise exception 'Invalid LicenceGuard registration details.';
  end if;
  for v_index in 1..12 loop
    v_digit := substr(v_id, v_index, 1)::integer;
    if v_index % 2 = 0 then
      v_digit := v_digit * 2;
      if v_digit > 9 then v_digit := v_digit - 9; end if;
    end if;
    v_sum := v_sum + v_digit;
  end loop;
  if (10 - v_sum % 10) % 10 <> substr(v_id, 13, 1)::integer then
    raise exception 'Invalid South African ID number.';
  end if;
  -- No caller-supplied user, dealer, role, scope or permission is accepted.
  insert into public.dealers (name, email, workspace_kind)
  values (v_first || ' ' || v_surname, new.email, 'PRODUCTION')
  returning id into v_dealer_id;

  insert into public.dealer_users (dealer_id, user_id, role, full_name, is_active)
  values (v_dealer_id, new.id, 'owner', v_first || ' ' || v_surname, true);

  insert into public.clients (
    dealer_id, first_name, surname, id_number, email,
    owner_user_id, record_scope, created_by, updated_by
  ) values (
    v_dealer_id, v_first, v_surname, v_id, new.email,
    new.id, 'PRIVATE', new.id, new.id
  );
  -- Keep the ID in the private client, rather than long-lived Auth metadata/JWTs.
  update auth.users set raw_user_meta_data = raw_user_meta_data - 'id_number'
  where id = new.id;
  -- Any error aborts the Auth user and all provisioning in the same transaction.
  return new;
end;
$function$;

revoke all on function public.initialize_public_registration() from public, anon, authenticated;
drop trigger if exists licenceguard_public_registration on auth.users;
create trigger licenceguard_public_registration
after insert on auth.users
for each row execute function public.initialize_public_registration();

commit;
