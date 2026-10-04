import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// Exact e271.pdf retrieved from the registered SAPS URL with Windows TLS
// certificate validation on 2026-10-04. SAPS omits an intermediate certificate,
// so Node's live fetch fails. Serve the unchanged, hash-pinned official bytes.
const SAPS_271_SHA256 = '0d1a74484ab5831db8ebf4b0d11bf8b18e6c9e26b3e4c38631bfec6959e82bdd';

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
    let bytes;
    if (code === 'SAPS_271') {
      bytes = await readFile(join(process.cwd(), 'public/saps-templates/SAPS_271_EN_OFFICIAL.pdf'));
      if (createHash('sha256').update(bytes).digest('hex') !== SAPS_271_SHA256) throw new Error('Pinned SAPS 271 template integrity check failed.');
    } else {
      const upstream = await fetch(sourceUrl, { headers: { 'User-Agent': 'LicenceGuard/1.0' } });
      if (!upstream.ok) return response.status(502).json({ error: 'SAPS template source is unavailable.' });
      bytes = Buffer.from(await upstream.arrayBuffer());
    }
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    response.setHeader('Content-Disposition', `inline; filename="${code}.pdf"`);
    return response.status(200).send(bytes);
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : 'Unable to retrieve SAPS template.' });
  }
}
