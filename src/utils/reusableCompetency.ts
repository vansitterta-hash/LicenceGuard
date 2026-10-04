import type { CompetencyCategory } from '../types/competency';

/** Resolve only records already read within the current client's RLS scope.
 * A SAPS competency certificate is not an accredited training certificate.
 */
export function resolveReusableCompetency<T extends { id: string; category: CompetencyCategory }>(
  records: readonly T[],
  category: CompetencyCategory | null | undefined,
  linkedId: string | null | undefined,
  furtherCompetency = false
): T | null {
  if (linkedId) {
    const linked = records.find((record) => record.id === linkedId);
    // A further-competency case can explicitly reference an existing different category.
    return linked && (furtherCompetency || !category || linked.category === category) ? linked : null;
  }
  // Do not guess which previous certificate a further-competency application refers to.
  if (!category || furtherCompetency) return null;
  const matching = records.filter((record) => record.category === category);
  return matching.length === 1 ? matching[0] : null;
}
