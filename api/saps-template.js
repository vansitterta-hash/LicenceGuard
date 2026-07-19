const TEMPLATES = {
  SAPS_271: 'https://www.saps.gov.za/services/flash/firearms/forms/english/e271.pdf',
  SAPS_517: 'https://www.saps.gov.za/services/flash/firearms/forms/english/e517.pdf',
  SAPS_517_A: 'https://www.saps.gov.za/services/flash/firearms/forms/english/e517a.pdf',
  SAPS_517_G: 'https://www.saps.gov.za/services/flash/firearms/forms/english/e517g.pdf',
  SAPS_518_A: 'https://www.saps.gov.za/services/flash/firearms/forms/english/e518a.pdf',
};

export default async function handler(request, response) {
  const code = String(request.query?.code || '');
  const sourceUrl = TEMPLATES[code];
  if (!sourceUrl) return response.status(404).json({ error: 'Unknown SAPS template.' });

  try {
    const upstream = await fetch(sourceUrl, { headers: { 'User-Agent': 'LicenceGuard/1.0' } });
    if (!upstream.ok) return response.status(502).json({ error: 'SAPS template source is unavailable.' });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    response.setHeader('Content-Disposition', `inline; filename="${code}.pdf"`);
    return response.status(200).send(bytes);
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : 'Unable to retrieve SAPS template.' });
  }
}
