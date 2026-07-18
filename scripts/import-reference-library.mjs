import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const projectRoot = path.resolve(process.cwd());
const libraryRoot = path.join(projectRoot, 'reference-library', 'Firearm Apllications');
const manifestPath = path.join(projectRoot, 'reference-library', 'manifest.json');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this importer.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
let imported = 0;
let skipped = 0;

for (const item of manifest) {
  const localPath = path.join(libraryRoot, ...item.relativePath.split('/'));
  const bytes = await fs.readFile(localPath);
  const storagePath = `reference-library/${item.relativePath}`;

  const { error: uploadError } = await supabase.storage
    .from('licenceguard-templates')
    .upload(storagePath, bytes, {
      upsert: true,
      contentType: item.format === 'PDF'
        ? 'application/pdf'
        : item.format === 'DOCX'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/octet-stream',
    });

  if (uploadError) {
    console.error(`Upload failed: ${item.relativePath}: ${uploadError.message}`);
    continue;
  }

  const { error: rowError } = await supabase
    .from('document_templates')
    .upsert({
      template_code: item.templateCode,
      template_name: item.templateName,
      description: item.description,
      application_type: item.applicationType,
      document_type: item.documentType,
      format: item.format,
      status: 'ACTIVE',
      source_authority: 'LicenceGuard reference library',
      storage_path: storagePath,
      current_version: 1,
      field_map: {},
      notes: `Imported from ${item.relativePath}`,
    }, { onConflict: 'template_code' });

  if (rowError) {
    console.error(`Database row failed: ${item.relativePath}: ${rowError.message}`);
    skipped += 1;
    continue;
  }

  imported += 1;
  console.log(`[${imported}/${manifest.length}] ${item.relativePath}`);
}

console.log(`Reference-library import complete. Imported: ${imported}. Failed/skipped: ${skipped}.`);
