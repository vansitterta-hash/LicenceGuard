import type { DocumentEngineContext, DocumentFieldDefinition } from '../types/documentEngine';
import type { DocumentLayoutElement } from '../types/documentLayout';
import { saps517Address, saps517ApplicantFields } from '../utils/saps517Applicant';

// Only SAPS 271 uses these computed values. Shared profile facts are reused;
// legal declarations and acquisition data are not inferred from missing values.
export function saps271PhysicalValues({ data, reviewValues: review = {} }: DocumentEngineContext): Record<string, string> {
  const address = saps517Address({ address_line_1: review.residentialAddress ?? data.applicant.residentialAddress, suburb: review.suburb ?? data.applicant.suburb, city: review.city ?? data.applicant.city, province: review.province ?? data.applicant.province });
  const profile = saps517ApplicantFields({ profile: data.saps271Declarations, idNumber: review.idNumber ?? data.applicant.idNumber, competencyCategory: data.competency?.category, residentialAddress: address.street, residentialLocality: address.locality, residentialPostalCode: review.postalCode ?? data.applicant.postalCode });
  const type = data.firearm?.firearmType;
  const firearmType = type === 'SHOTGUN' ? 'SHOTGUN' : ['PISTOL','REVOLVER'].includes(type ?? '') ? 'HANDGUN' : ['BOLT_ACTION_RIFLE','LEVER_ACTION_RIFLE','MANUAL_RIFLE','MANUAL_CARBINE','SELF_LOADING_RIFLE'].includes(type ?? '') ? 'RIFLE' : '';
  const action = data.formFields?.saps271Action ?? '';
  const initials = (review.firstName ?? data.applicant.firstName ?? '').trim().split(/\s+/).filter(Boolean).map(n => n[0]).join('').toUpperCase();
  const seller = data.supplier?.acquisitionSource;
  const applicable = seller === 'DEALER' || seller === 'PRIVATE_SELLER';
  const clean = (s: string | undefined) => !s || /^\s*(?:n\/?a|not applicable)\s*$/i.test(s) ? '' : s.trim();
  const profileStrings = Object.fromEntries(Object.entries(profile).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  return { ...profileStrings, ...data.formFields, initials: initials.length <= 4 ? initials : '', firearmType, action,
    competencyType: data.competency?.certificateNumber && ['HANDGUN','RIFLE','SHOTGUN','SLR'].includes(data.competency.category ?? '') ? 'POSSESS' : '',
    supplierSource: applicable ? seller! : '',
    supplierName: applicable ? clean(review.supplierName ?? data.supplier?.name) : '',
    supplierId: seller === 'PRIVATE_SELLER' ? clean(review.supplierIdOrRegistration ?? data.supplier?.idOrRegistration) : '',
    supplierContact: applicable ? clean(review.supplierContact ?? data.supplier?.contact) : '',
    dealerNumber: seller === 'DEALER' ? clean(review.supplierLicenceNumber ?? data.supplier?.dealerLicenceNumber) : '',
  };
}

const keys = ['citizenship','dateOfBirth','age','gender','initials','residentialAddress','residentialLocality','postalAddress','postalLocality','postalAddressPostalCode','residenceDescription','occupation','selfEmploymentDetails','employerName','businessAddress','businessPostalCode','workTelephone','faxNumber','maritalStatus','otherMaritalStatus','firearmType','action','competencyType','supplierSource','supplierName','supplierId','supplierContact','dealerNumber'];
const supplementKeys = ['OtherAction','BarrelSerial','FrameSerial','ReceiverSerial','AssociationMember','AssociationName','AssociationFar','AssociationNumber','AssociationJoined','AssociationExpiry','Purpose','PrescribedSafe','SafeType','SafeDetails','SafeMounted','MountWall','MountFloor'].map(key=>`saps271${key}`);
export const SAPS271_PHYSICAL_FIELDS: DocumentFieldDefinition[] = [...keys,...supplementKeys].map(key => ({ id: `application.saps271.${key}`, label: key, dataType: 'TEXT', sourcePath: '', normalise: 'TRIM' }));
const field = (key: string) => `application.saps271.${key}` as const;
const text = (id:string, fieldId:DocumentLayoutElement['fieldId'], page:number,x:number,y:number,width:number):DocumentLayoutElement => ({id:`s271-${id}`,kind:'TEXT',fieldId,page,x,y,width,fontSize:8});
const box = (id:string,fieldId:DocumentLayoutElement['fieldId'],page:number,x:number,y:number,choiceValue:string):DocumentLayoutElement => ({id:`s271-${id}`,kind:'CHECKBOX',fieldId,page,x,y,fontSize:9,choiceValue,mark:'X'});
const cells = (id:string,fieldId:DocumentLayoutElement['fieldId'],page:number,y:number,bounds:number[],skip:number[]=[]):DocumentLayoutElement => {
  // Individual elements use measured borders, including the non-uniform ID/date cells.
  const widths=bounds.slice(1).map((r,i)=>r-bounds[i]);
  return {id:`s271-${id}`,kind:'BOXED_TEXT',fieldId,page,x:bounds[0],y,width:bounds[bounds.length-1]-bounds[0],boxCount:widths.length-skip.length,boxWidths:widths.filter((_,i)=>!skip.includes(i)),separatorAfter:skip.map((v,i)=>v-i),separatorWidth:skip.length?widths[skip[0]]:undefined,fontSize:8,characterSet:'DIGITS'};
};

// Coordinates measured from the vector borders/text baselines of pinned e271.pdf
// SHA256 0d1a74484ab5831db8ebf4b0d11bf8b18e6c9e26b3e4c38631bfec6959e82bdd.
export const SAPS271_PHYSICAL_ELEMENTS: DocumentLayoutElement[] = [
  ...[['13',726.48],['14',709.08],['15',691.68],['16',674.28],['17',656.88],['19',639.48]].map(([s,y])=>box(`section-${s}`,'application.section',2,538,Number(y),String(s))),
  // Section 20 has six distinct purpose rows; the generic section alone cannot select one.
  ...[['RIFLE',160],['SHOTGUN',278],['HANDGUN',414]].map(([v,x])=>box(`firearm-${v}`,field('firearmType'),2,Number(x),446,String(v))),
  ...[['SEMI_AUTOMATIC',281],['AUTOMATIC',435],['MANUAL',548]].map(([v,x])=>box(`action-${v}`,field('action'),2,Number(x),354,String(v))),
  text('action-other',field('saps271OtherAction'),2,279,336.06,276),
  text('firearm-calibre','firearm.calibre',2,199,272.1,160),
  text('firearm-make','firearm.make',2,199,253.98,355),
  text('firearm-model','firearm.model',2,199,235.86,355),
  // Only explicit component answers are rendered; never the generic serial.
  ...[['BarrelSerial',199.62],['FrameSerial',181.5],['ReceiverSerial',163.38]].map(([key,y])=>text(String(key),field(`saps271${key}`),2,199,Number(y),223)),
  {...text('private-owner-name',field('supplierName'),3,125,748.56,430),conditionFieldId:field('supplierSource'),conditionValue:'PRIVATE_SELLER'},
  {...cells('private-owner-id',field('supplierId'),3,730.44,[255.12,274.20,293.28,312.36,331.44,350.52,369.60,388.68,407.76,427.44,445.92,465,484.08,503.16,522.24,541.32,560.28],[6,11,14]),conditionFieldId:field('supplierSource'),conditionValue:'PRIVATE_SELLER'},
  {...text('private-owner-contact',field('supplierContact'),3,168,621.72,190),conditionFieldId:field('supplierSource'),conditionValue:'PRIVATE_SELLER'},
  {...text('dealer-name',field('supplierName'),3,182,502.32,373),conditionFieldId:field('supplierSource'),conditionValue:'DEALER'},
  {...text('dealer-contact',field('supplierContact'),3,275,373.38,90),conditionFieldId:field('supplierSource'),conditionValue:'DEALER'},
  // Dealer licence number is not the FAR number printed on this page.
  box('competency-possess',field('competencyType'),5,383,435.6,'POSSESS'),
  ...[['HANDGUN',181],['RIFLE',289],['SHOTGUN',383]].map(([v,x])=>box(`competency-${v}`,'competency.category',5,Number(x),417.54,String(v))),
  text('competency-number','competency.certificateNumber',5,182,399.42,373),
  cells('competency-issued','competency.issueDate',5,381.3,[104.88,121.56,140.64,159.72,178.8,197.88,216.96,236.04,255.12,274.2,293.28],[4,7]),
  cells('competency-expiry','competency.expiryDate',5,381.3,[369.6,388.68,407.76,426.84,445.92,465,484.08,503.16,522.24,541.32,560.52],[4,7]),
  box('citizen',field('citizenship'),6,125,468.84,'SA_CITIZEN'),box('resident',field('citizenship'),6,315,468.84,'PERMANENT_RESIDENT'),
  cells('applicant-id','applicant.idNumber',6,450.72,[252.12,271.44,290.76,310.08,328.44,348.72,368.04,387.36,406.68,426,445.32,464.64,483.96,503.28,522.6,541.92,560.52],[6,11,14]),
  text('applicant-surname','applicant.surname',6,125,432.6,297),
  {...cells('initials',field('initials'),6,432.6,[484.08,503.28,522.48,541.68,560.52]),characterSet:'ALPHANUMERIC'},
  text('applicant-first-names','applicant.firstNames',6,125,414.54,430),
  cells('birth',field('dateOfBirth'),6,396.42,[121.8,138.84,157.68,176.88,196.08,215.28,234.48,253.68,272.88,292.08,311.28],[4,7]),
  cells('age',field('age'),6,396.42,[368.88,388.08,407.28,426.48]),
  {...box('male',field('gender'),6,515,396.42,'Male'),fontSize:7}, {...box('female',field('gender'),6,555,396.42,'Female'),fontSize:6},
  text('applicant-address',field('residentialAddress'),6,142,378.3,413),text('applicant-locality',field('residentialLocality'),6,48,360.18,366),
  cells('applicant-postal-code','applicant.postalCode',6,360.18,[484.08,503.28,522.48,541.68,560.52]),
  text('postal-address',field('postalAddress'),6,142,342.06,413),text('postal-locality',field('postalLocality'),6,48,323.94,366),
  cells('postal-code',field('postalAddressPostalCode'),6,323.94,[484.08,503.28,522.48,541.68,560.52]),
  text('residence',field('residenceDescription'),6,346,305.82,209),text('occupation',field('occupation'),6,166,287.7,122),text('self-employed',field('selfEmploymentDetails'),6,413,287.7,142),
  text('employer',field('employerName'),6,166,269.58,389),text('business-address',field('businessAddress'),6,166,251.46,389),
  cells('business-code',field('businessPostalCode'),6,233.34,[484.08,503.16,522.24,541.32,560.52]),
  text('work-phone',field('workTelephone'),6,465,215.22,90),text('applicant-cellphone','applicant.cellphone',6,164,197.1,200),text('fax',field('faxNumber'),6,465,197.1,90),text('applicant-email','applicant.email',6,164,178.98,390),
  ...[['SINGLE',127],['MARRIED',242],['DIVORCED',337],['WIDOW',452],['WIDOWER',547]].map(([v,x])=>box(`marital-${v}`,field('maritalStatus'),6,Number(x),123.9,String(v))),
  text('marital-other',field('otherMaritalStatus'),6,125,105.78,430),
  box('association-yes',field('saps271AssociationMember'),7,337,223.02,'YES'),
  box('association-no',field('saps271AssociationMember'),7,394,223.02,'NO'),
  text('association-name',field('saps271AssociationName'),7,202,204.9,354),
  {...cells('association-far',field('saps271AssociationFar'),7,186.78,[197.88,215.4,235.2,255,274.92,293.28,311.76,331.44,350.52,369.6,388.68,407.76,426.84,445.92,465,484.08,503.16,522.24,541.32,560.28]),characterSet:'ALPHANUMERIC'},
  text('association-number',field('saps271AssociationNumber'),7,145,168.66,144),
  cells('association-joined',field('saps271AssociationJoined'),7,168.66,[369.6,388.68,407.76,426.84,445.92,465,484.08,503.16,522.24,541.32,560.28],[4,7]),
  cells('association-expiry',field('saps271AssociationExpiry'),7,150.54,[369.6,388.68,407.76,426.84,445.92,465,484.08,503.16,522.24,541.32,560.28],[4,7]),
  {...text('purpose',field('saps271Purpose'),7,48,105,508),maxLines:3,lineHeight:18.12},
  box('safe-yes',field('saps271PrescribedSafe'),9,126,738.48,'YES'),box('safe-no',field('saps271PrescribedSafe'),9,223,738.48,'NO'),
  box('safe-handgun',field('saps271SafeType'),9,223,701.88,'HANDGUN'),box('safe-rifle',field('saps271SafeType'),9,336,701.88,'RIFLE'),
  box('safe-strongroom',field('saps271SafeType'),9,126,683.76,'STRONGROOM'),box('safe-device',field('saps271SafeType'),9,126,665.64,'DEVICE'),
  ...(['HANDGUN','RIFLE','STRONGROOM','DEVICE'] as const).map(type=>({...text(`safe-description-${type}`,field('saps271SafeDetails'),9,type==='HANDGUN'||type==='RIFLE'?351:142,type==='STRONGROOM'?683.76:type==='DEVICE'?665.64:701.88,type==='HANDGUN'||type==='RIFLE'?205:414),conditionFieldId:field('saps271SafeType'),conditionValue:type})),
  box('mounted-yes',field('saps271SafeMounted'),9,126,629.04,'YES'),box('mounted-no',field('saps271SafeMounted'),9,223,629.04,'NO'),
  box('mounted-wall',field('saps271MountWall'),9,126,592.08,'X'),box('mounted-floor',field('saps271MountFloor'),9,224,592.08,'X'),
];
