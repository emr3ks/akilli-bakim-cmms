import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const assetDirectory = new URL('../../assets/brand/', import.meta.url);
const generatedAssetsUrl = new URL('../../src/brand/generated-assets.ts', import.meta.url);
const printingUrl = new URL('../../src/printing.ts', import.meta.url);

describe('Meknivo official brand assets', () => {
  it('keeps the generated application source synchronized with every official SVG', () => {
    const generated = fs.readFileSync(generatedAssetsUrl, 'utf8');
    const officialFiles = [
      'meknivo-app-icon.svg',
      'meknivo-primary-horizontal.svg',
      'meknivo-primary-dark.svg',
      'meknivo-monochrome-white.svg',
      'meknivo-symbol.svg',
    ];

    for (const fileName of officialFiles) {
      const source = fs.readFileSync(new URL(fileName, assetDirectory), 'utf8').trim();
      expect(generated).toContain(JSON.stringify(source));
    }
  });

  it('embeds the official monochrome logo in printable machine cards', () => {
    const printing = fs.readFileSync(printingUrl, 'utf8');
    expect(printing).toContain('BRAND_SVG.monochromeWhite');
    expect(printing).toContain('Meknivo CMMS');
  });
});
