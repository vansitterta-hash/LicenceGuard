import { supabase } from '../lib/supabase';
import { validatePassword } from './passwordService';
import { isValidSouthAfricanId } from '../utils/southAfricanId';

export type RegistrationDetails = {
  firstName: string; surname: string; idNumber: string;
  email: string; password: string; confirmation: string;
};

export async function registerAccount(details: RegistrationDetails): Promise<void> {
  const firstName = details.firstName.trim();
  const surname = details.surname.trim();
  const idNumber = details.idNumber.replace(/\s/g, '');
  const email = details.email.trim().toLowerCase();
  if (!firstName || !surname || firstName.length > 100 || surname.length > 100) throw new Error('Enter your first name and surname (up to 100 characters each).');
  if (!/^\d{13}$/.test(idNumber) || !isValidSouthAfricanId(idNumber)) throw new Error('Enter a valid 13-digit South African ID number.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  validatePassword(details.password, details.confirmation);
  const { error } = await supabase.auth.signUp({
    email, password: details.password,
    options: {
      ...(typeof window !== 'undefined' ? { emailRedirectTo: new URL('/', window.location.href).toString() } : {}),
      data: { licenceguard_registration: 'v1', first_name: firstName, surname, id_number: idNumber },
    },
  });
  if (error) throw new Error(error.message);
  // Always return to explicit login, including projects with confirmation disabled.
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
  if (signOutError) throw new Error(signOutError.message);
}
