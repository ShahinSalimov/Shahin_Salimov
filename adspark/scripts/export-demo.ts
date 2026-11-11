// Writes the sample campaign's PDF, TXT and JSON exports to docs/demo/ (used for sales material).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildDemoCampaign } from '../src/lib/demoCampaign';
import { buildReport } from '../src/lib/export/report';
import { renderReportPdf } from '../src/lib/export/pdf';
import { campaignToText } from '../src/lib/export/txt';
import { createProjectFile } from '../src/lib/backup';

const demo = buildDemoCampaign(Date.UTC(2026, 10, 11));
const out = new URL('../docs/demo/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const font = (f: string) => readFileSync(new URL(`../node_modules/dejavu-fonts-ttf/ttf/${f}`, import.meta.url)).toString('base64');
const pdf = await renderReportPdf(buildReport(demo), { regular: font('DejaVuSans.ttf'), bold: font('DejaVuSans-Bold.ttf') });
writeFileSync(`${out}sample-campaign.pdf`, Buffer.from(await pdf.arrayBuffer()));
writeFileSync(`${out}sample-campaign.txt`, campaignToText(demo));
writeFileSync(`${out}sample-campaign.adspark.json`, JSON.stringify(createProjectFile(demo), null, 2));
console.log('Sample exports written to docs/demo/');
