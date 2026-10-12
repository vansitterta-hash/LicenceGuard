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
function sourceEvaluation(source) {
  const text = `${source.title} ${source.summary}`;
  const technical = /\b(barrels?|chokes?|patterns?|recoil|balance|handling|trigger|equipment|gauge|bore)\b/i.test(source.summary);
  const firstHand = /\bI (?:have |had )?(?:used|shot|fired|hunted|tested|owned)|\bmy (?:shotgun|gun)|\bour (?:field|range) test/i.test(source.summary);
  const byline = source.summary.match(/\b(?:author|by)\s*:\s*([^.;\n|]+)/i)?.[1]?.trim() ?? null;
  const declaredExpertise = /\b(gunsmith|competitive shooter|gun writer|shooting instructor|experienced hunter)\b/i.test(source.summary);
  const rules = /\b(rules|regulations|specifications)\b/i.test(text);
  const institutional = /\.(?:gov|org)(?:\.[a-z]{2})?$/i.test(source.publisher ?? '');
  const classification = rules && institutional ? 'Rules/technical source candidate'
    : byline && declaredExpertise && technical ? 'Attributed expert-analysis candidate (credentials unverified)'
      : firstHand && technical ? 'First-hand practical-experience candidate'
        : technical ? 'Technical-analysis candidate' : 'Unsupported opinion';
  return { classification, byline, firstHand, technical };
}
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
  // A comma-separated user description is retained in context, but must not
  // require sources to repeat that description as part of the model name.
  const modelName = fields.firearmModel.split(',')[0].trim();
  const make = contains(text, fields.firearmMake), model = contains(text, modelName);
  if (modelName && group === 0 && (!make || !model)) return -100;
  if (modelName && contains(title, fields.firearmMake) && !contains(title, modelName)) return -100;
  const recordedGauge = fields.calibre.match(/^(\d+)\s*(?:br|bore|ga(?:uge)?)(?:\s|$)/i)?.[1];
  const gauges = value => [...value.matchAll(/\b(\d+)\s*(?:gauge|bore|ga|br)\b/g)].map(match => match[1]);
  if (recordedGauge && (group === 0 || make || model)) {
    const titleGauges = gauges(title), excerptGauges = gauges(content);
    if (titleGauges.some(gauge => gauge !== recordedGauge)
      || (excerptGauges.length && !excerptGauges.includes(recordedGauge))
      || (group === 0 && modelName && !gauges(text).includes(recordedGauge))) return -100;
  }
  // Named-maker material in a purpose result must also match the recorded
  // model. General discipline/category sources need no maker/model mention.
  if (modelName && make && !model) return -100;
  const sportingPurpose = ['15', '16'].includes(fields.licenceSection);
  // Product titles often contain an unlabelled model name (for example Drake).
  // With no recorded model, accept only generic maker/category title words,
  // rather than maintaining a guessed list of model names.
  if (!fields.firearmModel && make) {
    const genericTitle = normalize(fields.firearmMake).split(' ').concat(
      ['12', '20', '28', '410', 'gauge', 'bore', 'ga', 'br', 'shotgun', 'shotguns',
        'rifle', 'rifles', 'handgun', 'pistol', 'revolver', 'specifications', 'technical',
        'characteristics', 'production', 'history', 'manufacturer', 'manufacturing',
        'background', 'equipment', 'rules', 'skeet', 'sporting', 'hunting', 'and', 'for', 'of', 'the']);
    if (contains(title, fields.firearmMake) && title.split(' ').some(word => !genericTitle.includes(word))) return -100;
    const makerMentions = ` ${content} `.split(` ${normalize(fields.firearmMake)} `);
    if (makerMentions.slice(1).some(passage => {
      const next = passage.split(' ')[0];
      return !genericTitle.includes(next) && !['is', 'are', 'was', 'were', 'has', 'have', 'uses', 'used', 'manufactures', 'manufactured', 'produces', 'produced'].includes(next);
    })) return -100;
  }
  const sourcePath = (() => { try { return new URL(source.url).pathname; } catch { return ''; } })();
  if (/\b(?:top|best)\s+(?:\d+\s+)?(?:best\s+)?(?:12\s+gauge\s+)?shotguns?\b/.test(title)
    || /\b(category|categories|portfolio|showcase|buying guide|search results)\b/.test(title)
    || /\b(buy|sale|deals|catalogue|catalog|products)\b/.test(title)
    || (/\/(?:product|products)(?:\/|$)/i.test(sourcePath) && !(model && /\b(specifications?|technical|barrels?|chokes?)\b/.test(content)))
    || /\/(?:shop|catalog|catalogue|category)(?:\/|$)/i.test(sourcePath)
    || (make && /\/(?:shotguns|shotgun)\/?$/i.test(sourcePath))
    || /^\w+ shotguns?$/.test(title)) return -100;
  // A named model is not evidence for an unidentified firearm. Apply this to
  // every discovery group so a purpose search cannot bypass identity checks.
  const labelledModel = source.summary.match(/\bmodel\s*:\s*([^.;\n|]+)/i);
  const modelTitle = make && /\b(?:\d{3,}[a-z]*|[a-z]+\d+|g\d+)\b/i.test(title);
  if ((labelledModel && (!modelName || !contains(normalize(labelledModel[1]), modelName)))
    || (modelTitle && (!modelName || !contains(title, modelName)))) return -100;
  if (/\b(catalogue|catalog|newsletter|dealer locator|find a dealer)\b/i.test(title)) return -100;
  if (make && !fields.firearmModel && !fields.firearmConfiguration
    && /\b(semi automatic|over and under|over under|side by side|pump action)\b/.test(text)) return -100;
  if (/\b(best in class|ultimate|unmatched|buy now|shop now)\b/.test(content)) return -100;
  const evaluation = sourceEvaluation(source);
  if (/\b(review|reviews|forum|opinion)\b/.test(title)
    && (!evaluation.technical || (!evaluation.firstHand && !evaluation.byline))) return -100;
  const categoryFound = categoryMatch(text), gauge = gaugeMatch(text);
  const technical = /\b(manufacturer|specifications?|technical|barrels?|chokes?|action|production|history|manufactured|design)\b/.test(content);
  const disciplines = fields.discipline.toLowerCase().split(/\s*(?:\band\b|[&,/])\s*/).filter(Boolean);
  const discipline = disciplines.some(value => value !== 'hunting' && contains(text, value));
  const hunting = /\bhunting\b/i.test(`${fields.purpose} ${fields.discipline}`)
    && /\bhunting\b|\bupland game birds?\b|\bwaterfowl\b|\bbird hunting\b/.test(text);
  if (sportingPurpose && group === 1 && disciplines.some(value => value !== 'hunting') && !discipline) return -100;
  if (sportingPurpose && group === 2 && !hunting) return -100;
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
    const recorded = /model/i.test(labelledIdentity[0].split(':')[0]) ? modelName : fields.firearmMake;
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
  const navigationTerms = content.match(/\b(menu|catalogue|catalog|newsletter|subscribe|dealer locator|privacy|login|shop|cart|downloads|contact)\b/g) ?? [];
  if (navigationTerms.length >= 3 && navigationTerms.length * 5 >= words) return -100;
  // Prefer attributable technical/rules material, without approving its claims.
  if (/\.(?:gov|org)(?:\.[a-z]{2})?$/i.test(source.publisher ?? '') && /\b(rules|technical|equipment|safety)\b/.test(content)) score += 3;
  if (evaluation.firstHand && evaluation.technical) score += 2;
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

function researchSourceKeys(source) {
  const url = new URL(source.url);
  url.hash = '';
  url.hostname = url.hostname.replace(/^www\./, '');
  url.pathname = url.pathname.replace(/\/$/, '') || '/';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|gclid$|fbclid$|ref$)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  const normalize = value => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return [url.toString().replace(/^http:/, 'https:'),
    // Exact normalized substantial excerpts also catch syndicated copies.
    source.summary.length >= 80 ? `excerpt:${normalize(source.summary)}` : `publication:${url.hostname}:${normalize(source.title)}:${normalize(source.summary)}`];
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
  const recordedConfiguration = fields.firearmConfiguration === 'OTHER' ? fields.firearmConfigurationOther : fields.firearmConfiguration.replaceAll('_', ' ');
  const recordedDescription = fields.firearmModel.includes(',') ? fields.firearmModel.slice(fields.firearmModel.indexOf(',') + 1).trim() : '';
  const firearmQuery = [
    fields.firearmMake,
    fields.firearmModel ? `"${fields.firearmModel.split(',')[0].trim()}"` : '',
    fields.calibre,
    fields.firearmType,
    recordedConfiguration, recordedDescription,
    shotgunAlias,
    'manufacturer specifications technical characteristics firearm history production background sporting suitability',
  ].filter(Boolean).join(' ').slice(0, 700);
  const purposeQuery = [
    // Keep a saved discipline search focused; hunting gets its own search below.
    fields.discipline ? '' : fields.purpose,
    fields.discipline.toLowerCase().split(/\s*(?:\band\b|[&,/])\s*/).filter(value => value && value !== 'hunting').join(' '),
    fields.firearmType,
    fields.calibre, shotgunAlias,
    recordedConfiguration, recordedDescription,
    'discipline equipment competition rules technical governing body official sources',
  ].filter(Boolean).join(' ').slice(0, 700);

  try {
    const searches = [{ query: firearmQuery, subject: 'Firearm-specific discovery', lane: 0, priority: 3 }, { query: purposeQuery, subject: 'Application-purpose/discipline discovery', lane: 1, priority: 0 }];
    if (/\bhunting\b/i.test(`${fields.purpose} ${fields.discipline}`)) {
      // General suitability only: no quarry, frequency or personal circumstances
      // are introduced when those facts are absent from the saved context.
      searches.push({ query: [fields.firearmType, fields.calibre, shotgunAlias, recordedConfiguration, recordedDescription,
        'hunting suitability safety technical guidance upland game birds ducks geese quail snipe field experience hunting publications organizations'].filter(Boolean).join(' '),
      subject: 'Saved hunting-purpose discovery', lane: 2, priority: 2 });
    }
    if (['15', '16'].includes(fields.licenceSection) && /\bskeet\b/i.test(fields.discipline)) searches.push({
      query: [fields.firearmType, fields.calibre, shotgunAlias, recordedConfiguration, recordedDescription,
        'Skeet discipline suitability technical equipment guidance recognized shooting organization'].filter(Boolean).join(' '),
      subject: 'Saved Skeet equipment/suitability discovery', lane: 1, priority: 1,
    });
    const responses = await Promise.all(searches.map(search => fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: search.query,
        search_depth: 'advanced',
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
        applicability: `${searches[group].subject} for the supplied context. ${sourceEvaluation({ title, summary, publisher: url.hostname }).classification}. Author expertise and corroboration require independent review. First-hand observations do not establish specifications, legal requirements or applicant activities. Hunting species are discovery topics, not saved applicant facts. Verify the original source and the specific proposition before relying on any claim.`,
        category: 'Live internet research',
        association: fields.association || null,
        discipline: fields.discipline || null,
        firearmMake: fields.firearmMake || null,
        firearmModel: fields.firearmModel || null,
        calibre: fields.calibre || null,
        sourceKind: 'EXTERNAL_PROVIDER',
        publishedDate: boundedText(result.published_date, 80) || null,
      }];
    }).map(source => ({ source, score: relevanceScore(source, fields, searches[group].lane) }))
      .filter(item => item.score >= RELEVANCE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .map(item => item.source));
    // Alternate subjects within the existing six-source budget. Skip duplicate
    // URLs without losing remaining unique results from either search.
    const sources = [], seen = new Set();
    const positions = groups.map(() => 0);
    const groupOrder = groups.map((_, i) => i);
    if (['15', '16'].includes(fields.licenceSection)) groupOrder.sort((a, b) => searches[a].priority - searches[b].priority);
    while (sources.length < 6 && groups.some((group, i) => positions[i] < group.length)) {
      for (const i of groupOrder) {
        if (sources.length >= 6) break;
        while (positions[i] < groups[i].length) {
          const source = groups[i][positions[i]++];
          const keys = researchSourceKeys(source);
          if (keys.some(key => seen.has(key))) continue;
          keys.forEach(key => seen.add(key)); sources.push(source); break;
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
