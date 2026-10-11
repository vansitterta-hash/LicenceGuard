const MANUAL = ['BOLT_ACTION', 'STRAIGHT_PULL', 'LEVER_ACTION', 'PUMP_ACTION', 'FALLING_BLOCK', 'BREAK_ACTION', 'ROLLING_BLOCK', 'SINGLE_SHOT', 'SINGLE_SHOT_BREAK_ACTION', 'OTHER'];
const FIREARM_CONFIGURATION_TYPES = {
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

const requestCounts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 8;

function sendError(response, status, error) {
  return response.status(status).json({ error });
}

function boundedText(value, maximumLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maximumLength);
}

function validResearchInput(body) {
  const fields = {
    applicationType: boundedText(body?.applicationType, 80),
    licenceSection: boundedText(body?.licenceSection, 8),
    purpose: boundedText(body?.purpose, 160),
    discipline: boundedText(body?.discipline, 120),
    association: boundedText(body?.association, 120),
    firearmMake: boundedText(body?.firearm?.make, 80),
    firearmModel: boundedText(body?.firearm?.model, 100),
    calibre: boundedText(body?.firearm?.calibre, 40),
    firearmType: boundedText(body?.firearm?.firearmType, 60),
    firearmConfiguration: boundedText(body?.firearm?.firearmConfiguration, 30),
    firearmConfigurationOther: boundedText(body?.firearm?.firearmConfigurationOther, 120),
  };
  if (fields.firearmConfiguration && (!FIREARM_CONFIGURATION_TYPES[fields.firearmType]?.includes(fields.firearmConfiguration))) return null;
  if (fields.firearmConfiguration === 'OTHER' && !fields.firearmConfigurationOther) return null;
  if (fields.firearmConfiguration !== 'OTHER') fields.firearmConfigurationOther = '';
  const serialized = Object.values(fields).join(' ');
  if (!fields.calibre
    || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialized)
    || /\b\d{7,}\b/.test(serialized)) return null;
  return fields;
}

function subjectType(title, content, fields) {
  const text = `${title} ${content}`.toLowerCase();
  if (/ballistic|trajectory|muzzle velocity|bullet drop/.test(text)) return 'BALLISTIC';
  if (fields.discipline && text.includes(fields.discipline.toLowerCase())) return 'DISCIPLINE';
  if (fields.calibre && text.includes(fields.calibre.toLowerCase())) return 'CALIBRE';
  if (/association|sporting rules|competition rules/.test(text)) return 'ASSOCIATION';
  return 'GENERAL';
}

const RELEVANCE_THRESHOLD = 14;
// Discovery relevance is not fact verification or claim approval. Evaluate only
// the supplied title/excerpt; unrelated results never pad the source budget.
function relevanceScore(source, fields, group) {
  const normalize = value => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const title = normalize(source.title), content = normalize(source.summary);
  const text = `${title} ${content}`;
  const contains = (haystack, value) => Boolean(value && (` ${haystack} `).includes(` ${normalize(value)} `));
  const category = /shotgun/i.test(fields.firearmType) ? 'shotgun'
    : /rifle/i.test(fields.firearmType) ? 'rifle'
      : /pistol|revolver|handgun/i.test(fields.firearmType) ? 'handgun' : normalize(fields.firearmType);
  const categoryMatch = text => contains(text, category) || contains(text, `${category}s`) || (category === 'handgun' && /\b(pistols?|revolvers?)\b/.test(text));
  const gaugeMatch = text => /^12\s*(?:br|bore|ga(?:uge)?)(?:\s|$)/i.test(fields.calibre)
    ? /\b12\s*(?:bore|gauge|ga|br)\b/.test(text) : contains(text, fields.calibre);
  const make = contains(text, fields.firearmMake), model = contains(text, fields.firearmModel);
  const categoryFound = categoryMatch(text), gauge = gaugeMatch(text);
  const technical = /\b(manufacturer|specifications?|technical|barrels?|chokes?|action|production|history|manufactured|design)\b/.test(content);
  const disciplines = fields.discipline.toLowerCase().split(/\s*(?:\band\b|[&,/])\s*/).filter(Boolean);
  const discipline = disciplines.some(value => value !== 'hunting' && contains(text, value));
  const hunting = /\bhunting\b/i.test(`${fields.purpose} ${fields.discipline}`) && /\bhunting\b/.test(text);
  const use = /\b(targets?|clays?|competition|rules?|equipment|game|sporting|suitability|hunting)\b/.test(content);
  // Additive evidence: no fixed sentence length, mandatory verb, same-passage
  // conjunction or mandatory CZ/Section 16 term for useful category research.
  // 14 requires several signals; context terms alone carry only one point.
  let score = group === 0
    ? Number(make) * 5 + Number(model) * 7 + Number(categoryFound) * 4 + Number(gauge) * 4 + Number(technical) * 5 + Number(use) * 2
      + Number((make || model) && categoryFound && technical) * 4
    : Number(categoryFound) * 4 + Number(gauge) * 4 + Number(discipline) * 6 + Number(hunting) * 3 + Number(use) * 6
      + Number((categoryFound || gauge) && (discipline || hunting || /\b(competition|sporting)\b/.test(content)) && use) * 4;
  if (group === 1 && disciplines.some(value => value !== 'hunting' && contains(title, value))) score += 2;
  if (contains(text, fields.purpose) || contains(text, `Section ${fields.licenceSection}`)) score += 1;
  // Conflicts outweigh every positive combination. Title subjects matter even
  // when menus elsewhere mention the requested category.
  const categories = ['shotgun', 'rifle', 'pistol', 'revolver', 'handgun'];
  const conflict = value => categories.some(other => other !== category
    && !(category === 'handgun' && ['pistol', 'revolver'].includes(other))
    && new RegExp(`\\b${other}s?\\b`).test(value)) && !categoryMatch(value);
  if (conflict(title) || conflict(content)) score -= 40;
  const labelledIdentity = source.summary.match(/\b(?:manufacturer|make|model)\s*:\s*([^.;\n|]+)/i);
  if (labelledIdentity) {
    const recorded = /model/i.test(labelledIdentity[0].split(':')[0]) ? fields.firearmModel : fields.firearmMake;
    if (recorded && !contains(normalize(labelledIdentity[1]), recorded)) score -= 40;
  }
  const labelledDiscipline = source.summary.match(/\bdiscipline\s*:\s*([^.;\n|]+)/i);
  if (labelledDiscipline && disciplines.length && !disciplines.some(value => contains(normalize(labelledDiscipline[1]), value))) score -= 40;
  if (/\b(dedicated.*status|membership|member help|firearm help|licensing|licence application)\b/.test(title)) score -= 16;
  // Structural quality penalties instead of an expanding menu-word blacklist:
  // many short fragments, or long label lists dominating a small prose excerpt.
  const passages = source.summary.split(/[.!?;\n|]+/).map(normalize).filter(Boolean);
  const words = content.split(' ').length;
  const proseWords = passages.filter(p => /\b(is|are|was|were|has|have|uses?|used|requires?|provides?|designed|features?|must|should|can)\b/.test(p))
    .reduce((sum, p) => sum + p.split(' ').length, 0);
  const shortFragments = passages.filter(p => p.split(' ').length < 5).length;
  if ((passages.length >= 4 && shortFragments / passages.length >= 0.6)
    || (words >= 25 && proseWords / words < 0.4 && !/\b\d+(?:\.\d+)?\s*(?:mm|cm|inch|inches|kg|lbs)\b/i.test(source.summary))
    || /\b(home|menu)\b.*\b(contact|login|log in|privacy)\b/i.test(content)) score -= 24;
  return score;
}

function consumeRequest(userId) {
  const now = Date.now();
  const recent = (requestCounts.get(userId) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) return false;
  recent.push(now);
  requestCounts.set(userId, recent);
  return true;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendError(response, 405, 'Use POST to request application research.');
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const authorization = request.headers.authorization || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!supabaseUrl || !publishableKey || !token) {
    return sendError(response, 401, 'A signed-in LicenceGuard session is required.');
  }

  let authenticatedUser;
  try {
    const authResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
    });
    if (!authResponse.ok) return sendError(response, 401, 'The LicenceGuard session is invalid or expired.');
    authenticatedUser = await authResponse.json();
  } catch {
    return sendError(response, 502, 'Authentication could not be verified.');
  }

  if (!authenticatedUser?.id) return sendError(response, 401, 'The LicenceGuard session is invalid or expired.');
  if (Number(request.headers['content-length'] ?? 0) > 6000) return sendError(response, 413, 'Research request is too large.');
  const fields = validResearchInput(request.body);
  if (!fields) return sendError(response, 400, 'Provide a calibre and valid non-personal research context.');
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return sendError(response, 503, 'Live research is not configured. Add the TAVILY_API_KEY production environment variable.');
  if (!consumeRequest(authenticatedUser.id)) return sendError(response, 429, 'Research rate limit reached. Try again later.');

  const shotgunAlias = /shotgun/i.test(fields.firearmType) && /^12\s*(?:br|bore|ga(?:uge)?)(?:\s|$)/i.test(fields.calibre) ? '12 bore 12 gauge' : '';
  const firearmQuery = [
    fields.firearmMake,
    fields.firearmModel,
    fields.calibre,
    fields.firearmType,
    fields.firearmConfiguration === 'OTHER' ? fields.firearmConfigurationOther : fields.firearmConfiguration.replaceAll('_', ' '),
    shotgunAlias,
    'manufacturer specifications technical characteristics firearm history production background sporting suitability',
  ].filter(Boolean).join(' ').slice(0, 700);
  const purposeQuery = [
    fields.licenceSection ? `Section ${fields.licenceSection}` : '',
    fields.applicationType,
    fields.purpose,
    fields.discipline.trim().toLowerCase(),
    fields.association,
    fields.firearmType,
    'sporting discipline firearm category suitability competition rules dedicated sport official sources South Africa',
  ].filter(Boolean).join(' ').slice(0, 700);

  try {
    const searches = [{ query: firearmQuery, subject: 'Firearm-specific discovery' }, { query: purposeQuery, subject: 'Application-purpose/discipline discovery', country: 'south africa' }];
    const responses = await Promise.all(searches.map(search => fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: search.query,
        search_depth: 'basic',
        topic: 'general',
        ...(search.country ? { country: search.country } : {}),
        max_results: 6,
        include_answer: false,
        include_raw_content: false,
        include_usage: true,
      }),
    })));
    if (responses.some(response => !response.ok)) {
      return sendError(response, 502, 'The live research provider could not complete the search.');
    }

    const payloads = await Promise.all(responses.map(response => response.json()));
    const generatedAt = new Date().toISOString();
    const groups = payloads.map((payload, group) => (Array.isArray(payload.results) ? payload.results : []).flatMap((result, index) => {
      let url;
      try {
        url = new URL(result.url);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return [];
      } catch {
        return [];
      }
      const title = boundedText(result.title, 240);
      const summary = boundedText(result.content, 1800);
      if (!title || !summary) return [];
      return [{
        id: `tavily:${group}:${boundedText(result.id, 100) || index}`,
        title,
        publisher: url.hostname,
        url: url.toString(),
        retrievalDate: generatedAt,
        trustLevel: 'UNREVIEWED',
        subjectType: subjectType(title, summary, fields),
        summary,
        applicability: `${searches[group].subject} for the supplied context. Verify the original source and its relevance before relying on any claim.`,
        category: 'Live internet research',
        association: fields.association || null,
        discipline: fields.discipline || null,
        firearmMake: fields.firearmMake || null,
        firearmModel: fields.firearmModel || null,
        calibre: fields.calibre || null,
        sourceKind: 'EXTERNAL_PROVIDER',
        publishedDate: boundedText(result.published_date, 80) || null,
      }];
    }).map(source => ({ source, score: relevanceScore(source, fields, group) }))
      .filter(item => item.score >= RELEVANCE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .map(item => item.source));
    // Alternate subjects within the existing six-source budget. Skip duplicate
    // URLs without losing remaining unique results from either search.
    const sources = [], seen = new Set();
    const positions = [0, 0];
    while (sources.length < 6 && groups.some((group, i) => positions[i] < group.length)) {
      for (let i = 0; i < groups.length && sources.length < 6; i++) {
        while (positions[i] < groups[i].length) {
          const source = groups[i][positions[i]++];
          const key = new URL(source.url); key.hash = '';
          key.pathname = key.pathname.replace(/\/$/, '') || '/'; key.searchParams.sort();
          if (seen.has(key.toString())) continue;
          seen.add(key.toString()); sources.push(source); break;
        }
      }
    }
    const usage = {};
    for (const payload of payloads) for (const [key, value] of Object.entries(payload.usage ?? {})) {
      if (typeof value === 'number') usage[key] = (usage[key] ?? 0) + value;
    }

    return response.status(200).json({
      provider: 'EXTERNAL_PROVIDER',
      providerStatus: sources.length ? 'PARTIAL' : 'REQUIRES_EXTERNAL_PROVIDER',
      applicationType: fields.applicationType || null,
      licenceSection: fields.licenceSection || null,
      purpose: fields.purpose || null,
      discipline: fields.discipline || null,
      association: fields.association || null,
      firearm: {
        make: fields.firearmMake || null,
        model: fields.firearmModel || null,
        calibre: fields.calibre || null,
        firearmType: fields.firearmType || null,
        firearmConfiguration: fields.firearmConfiguration || null,
        firearmConfigurationOther: fields.firearmConfigurationOther || null,
      },
      sourceCount: sources.length,
      sources,
      findings: sources.map((source) => ({
        subject: source.subjectType,
        summary: source.summary,
        sourceId: source.id,
        sourceTitle: source.title,
        sourceUrl: source.url,
      })),
      warnings: [
        'Live search results are discovery leads, not verified facts or applicant-specific evidence. Review each original source before use.',
        ...(sources.length < 6 ? ['Insufficient relevant sources to fill the six-source limit; unrelated results were not used as substitutes.'] : []),
        ...groups.flatMap((group, i) => group.length ? [] : [`No relevant ${searches[i].subject.toLowerCase()} sources were found in the returned excerpts.`]),
        ...(sources.length ? [] : ['No usable search results were returned.']),
      ],
      generatedAt,
      usage: Object.keys(usage).length ? usage : null,
    });
  } catch {
    return sendError(response, 502, 'The live research provider is temporarily unavailable.');
  }
}
