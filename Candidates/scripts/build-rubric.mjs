#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const candidatesDir = path.resolve(scriptDir, '..');
const repoDir = path.resolve(candidatesDir, '..');
const sourcePath = path.join(candidatesDir, 'data/rubrics/wy-primary-2026-v1.md');
const jsonPath = path.join(candidatesDir, 'data/rubrics/generated/wy-primary-2026-v1.json');
const guideJsonPath = path.join(repoDir, 'Guide/src/data/wy-primary-2026-v1.generated.json');
const pdfPath = path.join(candidatesDir, 'docs/rubrics/wy-primary-2026-v1.pdf');
const sqlPath = path.join(candidatesDir, 'db/seed/guide_rubric_2026_v1.sql');
const checkOnly = process.argv.includes('--check');

function parseScalar(value) {
  const trimmed = value.trim();
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function parseRubric(markdown) {
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatterMatch) throw new Error('Rubric must begin with YAML-style frontmatter.');

  const metadata = {};
  for (const line of frontmatterMatch[1].split('\n')) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.+)$/);
    if (!match) throw new Error(`Invalid frontmatter line: ${line}`);
    metadata[match[1]] = parseScalar(match[2]);
  }

  const body = markdown.slice(frontmatterMatch[0].length);
  const categoryPattern = /^## (\d+)\. (.+)\n([\s\S]*?)(?=^## \d+\.|(?![\s\S]))/gm;
  const categories = [];
  let match;
  while ((match = categoryPattern.exec(body))) {
    const [, numberText, heading, section] = match;
    const key = section.match(/^- Key:\s*`([^`]+)`/m)?.[1];
    const weight = Number(section.match(/^- Weight:\s*(\d+)/m)?.[1]);
    const displayOrder = Number(section.match(/^- Display order:\s*(\d+)/m)?.[1]);
    const standard = section.match(/^### Standard\n\n([\s\S]*?)(?=\n### |$)/m)?.[1]?.trim();
    const evidenceGuidance = section.match(/^### Evidence guidance\n\n([\s\S]*?)(?=\n### |$)/m)?.[1]?.trim();
    categories.push({
      number: Number(numberText),
      key,
      label: heading.trim(),
      weight,
      displayOrder,
      standard,
      evidenceGuidance,
    });
  }

  const rubric = {
    schemaVersion: 1,
    rubricKey: metadata.rubricKey,
    title: metadata.title,
    electionCycle: metadata.electionCycle,
    status: metadata.status,
    scoring: {
      min: metadata.scoreMin,
      max: metadata.scoreMax,
      unknownPolicy: metadata.unknownPolicy,
      labels: {
        0: 'Serious documented concern',
        1: 'Weak documented record',
        2: 'Below-standard documented record',
        3: 'Acceptable or neutral documented record',
        4: 'Strong documented record',
        5: 'Exceptional documented record',
      },
    },
    evidenceWeights: {
      5: 'Official records, filings, statutes, court records, and recorded votes',
      4: "Candidate's own published statements or campaign materials",
      3: 'Candidate questionnaires, public forums, and direct interviews',
      2: 'Credible local reporting with identifiable sourcing',
      1: 'Social posts, mailers, and other low-context campaign communications',
    },
    categories,
  };

  validateRubric(rubric);
  return rubric;
}

function validateRubric(rubric) {
  if (!rubric.rubricKey || !rubric.title || !rubric.electionCycle) throw new Error('Missing required rubric metadata.');
  if (rubric.scoring.min !== 0 || rubric.scoring.max !== 5) throw new Error('The 2026 rubric score range must be 0-5.');
  if (rubric.scoring.unknownPolicy !== 'excluded') throw new Error('Unknown evidence policy must be excluded.');
  if (rubric.categories.length !== 10) throw new Error(`Expected 10 categories; found ${rubric.categories.length}.`);

  const keys = new Set();
  const orders = new Set();
  let totalWeight = 0;
  rubric.categories.forEach((category, index) => {
    if (category.number !== index + 1) throw new Error(`Category numbering is not sequential at ${category.label}.`);
    if (!category.key || !/^[a-z][a-z0-9_]+$/.test(category.key)) throw new Error(`Invalid category key: ${category.key}`);
    if (keys.has(category.key)) throw new Error(`Duplicate category key: ${category.key}`);
    if (!category.label || !category.standard || !category.evidenceGuidance) throw new Error(`Incomplete category: ${category.key}`);
    if (!Number.isInteger(category.weight) || category.weight <= 0) throw new Error(`Invalid weight for ${category.key}.`);
    if (!Number.isInteger(category.displayOrder) || orders.has(category.displayOrder)) throw new Error(`Invalid display order for ${category.key}.`);
    keys.add(category.key);
    orders.add(category.displayOrder);
    totalWeight += category.weight;
  });
  if (totalWeight !== 100) throw new Error(`Category weights must total 100; found ${totalWeight}.`);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function buildSql(rubric, sourceSha256) {
  const lines = [
    '-- Generated from Candidates/data/rubrics/wy-primary-2026-v1.md',
    '-- Do not edit this file directly.',
    '',
    'INSERT OR IGNORE INTO guide_rubric_versions',
    '  (rubric_key, title, election_cycle, score_min, score_max, unknown_policy, status, source_sha256, activated_at)',
    `VALUES (${sqlString(rubric.rubricKey)}, ${sqlString(rubric.title)}, ${sqlString(rubric.electionCycle)}, ${rubric.scoring.min}, ${rubric.scoring.max}, ${sqlString(rubric.scoring.unknownPolicy)}, ${sqlString(rubric.status)}, ${sqlString(sourceSha256)}, datetime('now'));`,
    '',
  ];
  for (const category of rubric.categories) {
    lines.push(
      'INSERT OR IGNORE INTO guide_rubric_categories',
      '  (rubric_version_id, category_key, label, description, evidence_guidance, weight, display_order)',
      'SELECT id, ' + [
        sqlString(category.key),
        sqlString(category.label),
        sqlString(category.standard),
        sqlString(category.evidenceGuidance),
        category.weight,
        category.displayOrder,
      ].join(', ') + ` FROM guide_rubric_versions WHERE rubric_key = ${sqlString(rubric.rubricKey)};`,
      '',
    );
  }
  return lines.join('\n');
}

function ascii(value) {
  return String(value)
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E]/g, '');
}

function wrap(text, width = 92) {
  const words = ascii(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= width) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function pdfEscape(text) {
  return text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function buildPdf(rubric, sourceSha256) {
  const lines = [
    rubric.title,
    `Version: ${rubric.rubricKey}`,
    `Source checksum: ${sourceSha256}`,
    '',
    `Score range: ${rubric.scoring.min}-${rubric.scoring.max}. Missing evidence: Unknown and excluded from scoring.`,
    'Weights total 100. Maximum fully evidenced weighted score: 500.',
    '',
  ];
  for (const category of rubric.categories) {
    lines.push(`${category.number}. ${category.label} (weight ${category.weight})`);
    lines.push(...wrap(`Standard: ${category.standard}`));
    lines.push(...wrap(`Evidence: ${category.evidenceGuidance}`));
    lines.push('');
  }

  const pages = [];
  for (let i = 0; i < lines.length; i += 47) pages.push(lines.slice(i, i + 47));
  const objects = [];
  const addObject = (content) => { objects.push(content); return objects.length; };
  const catalogId = addObject('');
  const pagesId = addObject('');
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];

  for (const pageLines of pages) {
    const commands = ['BT', '/F1 10 Tf', '13 TL', '50 752 Td'];
    pageLines.forEach((line, index) => {
      if (index > 0) commands.push('T*');
      commands.push(`(${pdfEscape(ascii(line))}) Tj`);
    });
    commands.push('ET');
    const stream = commands.join('\n');
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'binary');
}

const source = await readFile(sourcePath, 'utf8');
const sourceSha256 = createHash('sha256').update(source).digest('hex');
const rubric = parseRubric(source);
const generated = { ...rubric, generatedFrom: 'Candidates/data/rubrics/wy-primary-2026-v1.md', sourceSha256 };
const json = `${JSON.stringify(generated, null, 2)}\n`;
const sql = `${buildSql(rubric, sourceSha256)}\n`;
const pdf = buildPdf(rubric, sourceSha256);
const outputs = [[jsonPath, json], [guideJsonPath, json], [sqlPath, sql], [pdfPath, pdf]];

if (checkOnly) {
  for (const [outputPath, expected] of outputs) {
    const actual = await readFile(outputPath);
    const expectedBuffer = Buffer.isBuffer(expected) ? expected : Buffer.from(expected);
    if (!actual.equals(expectedBuffer)) throw new Error(`Generated rubric artifact is stale: ${path.relative(repoDir, outputPath)}`);
  }
  process.stdout.write(`Rubric artifacts are current (${sourceSha256.slice(0, 12)}).\n`);
} else {
  for (const [outputPath, contents] of outputs) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, contents);
  }
  process.stdout.write(`Generated rubric JSON, SQL, and PDF (${sourceSha256.slice(0, 12)}).\n`);
}
