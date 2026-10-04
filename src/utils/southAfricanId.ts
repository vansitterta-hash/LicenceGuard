export type SouthAfricanIdDetails = {
  dateOfBirth: string;
  age: number;
  gender: 'Male' | 'Female';
  citizenship: 'SA_CITIZEN' | 'PERMANENT_RESIDENT' | null;
};

export function isValidSouthAfricanId(rawIdNumber: string): boolean {
  const idNumber = rawIdNumber.replace(/\s/g, '');
  if (!/^\d{13}$/.test(idNumber)) return false;

  const digits = idNumber.split('').map(Number);
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    if (index % 2 === 0) sum += digits[index];
    else {
      const doubled = digits[index] * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
  }
  return (10 - (sum % 10)) % 10 === digits[12];
}

export function deriveSouthAfricanIdDetails(
  rawIdNumber: string,
  today = new Date()
): SouthAfricanIdDetails | null {
  const idNumber = rawIdNumber.replace(/\s/g, '');
  if (!isValidSouthAfricanId(idNumber)) return null;

  const yearPart = Number(idNumber.slice(0, 2));
  const month = Number(idNumber.slice(2, 4));
  const day = Number(idNumber.slice(4, 6));
  const year = yearPart <= today.getFullYear() % 100 ? 2000 + yearPart : 1900 + yearPart;
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  if (birthDate.getUTCFullYear() !== year || birthDate.getUTCMonth() !== month - 1 || birthDate.getUTCDate() !== day) return null;

  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
  if (age < 0) return null;

  const citizenshipDigit = idNumber[10];
  const citizenship = citizenshipDigit === '0'
    ? 'SA_CITIZEN'
    : citizenshipDigit === '1'
      ? 'PERMANENT_RESIDENT'
      : null;

  return {
    dateOfBirth: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    age,
    gender: Number(idNumber.slice(6, 10)) >= 5000 ? 'Male' : 'Female',
    citizenship,
  };
}
