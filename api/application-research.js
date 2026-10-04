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
  };
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

  const query = [
    fields.firearmMake,
    fields.firearmModel,
    fields.calibre,
    fields.firearmType,
    fields.purpose,
    fields.discipline,
    fields.association,
    'manufacturer specifications technical data cartridge ballistics suitability sporting rules official sources South Africa',
  ].filter(Boolean).join(' ').slice(0, 700);

  try {
    const searchResponse = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        topic: 'general',
        country: 'south africa',
        max_results: 6,
        include_answer: false,
        include_raw_content: false,
        include_usage: true,
      }),
    });
    if (!searchResponse.ok) {
      return sendError(response, 502, 'The live research provider could not complete the search.');
    }

    const payload = await searchResponse.json();
    const generatedAt = new Date().toISOString();
    const sources = (Array.isArray(payload.results) ? payload.results : []).flatMap((result, index) => {
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
        id: `tavily:${boundedText(result.id, 100) || index}`,
        title,
        publisher: url.hostname,
        url: url.toString(),
        retrievalDate: generatedAt,
        trustLevel: 'UNREVIEWED',
        subjectType: subjectType(title, summary, fields),
        summary,
        applicability: 'Search result for the supplied application context. Verify the original source and its relevance before relying on any claim.',
        category: 'Live internet research',
        association: fields.association || null,
        discipline: fields.discipline || null,
        firearmMake: fields.firearmMake || null,
        firearmModel: fields.firearmModel || null,
        calibre: fields.calibre || null,
        sourceKind: 'EXTERNAL_PROVIDER',
        publishedDate: boundedText(result.published_date, 80) || null,
      }];
    });

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
        ...(sources.length ? [] : ['No usable search results were returned.']),
      ],
      generatedAt,
      usage: payload.usage ?? null,
    });
  } catch {
    return sendError(response, 502, 'The live research provider is temporarily unavailable.');
  }
}
