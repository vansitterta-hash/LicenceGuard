export type DeclarationAnswer = 'NOT_ANSWERED' | 'YES' | 'NO';
export type DeclarationKey = 'convictions' | 'pendingCases' | 'lostStolen' | 'negligence' | 'unfitness' | 'confiscation';
export type DeclarationDetailKey = 'policeStation' | 'caseNumber' | 'charge' | 'outcome' | 'offence' | 'circumstances' | 'firearmDetails' | 'dateFrom' | 'period';
export type DeclarationIncident = Partial<Record<DeclarationDetailKey, string>>;
export type Saps271Declarations = {
  answers: Record<DeclarationKey, { answer: DeclarationAnswer; incidents: DeclarationIncident[] }>;
  confirmedAt: string | null;
};
