import { SvgXml } from 'react-native-svg';

import { BRAND_SVG, type BrandAssetName } from './generated-assets';

export type MeknivoLogoVariant =
  | 'app-icon'
  | 'primary-horizontal'
  | 'primary-dark'
  | 'monochrome-white'
  | 'symbol';

const assetByVariant: Record<MeknivoLogoVariant, BrandAssetName> = {
  'app-icon': 'appIcon',
  'primary-horizontal': 'primaryHorizontal',
  'primary-dark': 'primaryDark',
  'monochrome-white': 'monochromeWhite',
  symbol: 'symbol',
};

const defaultDimensions: Record<MeknivoLogoVariant, { width: number; height: number }> = {
  'app-icon': { width: 72, height: 72 },
  'primary-horizontal': { width: 220, height: 51 },
  'primary-dark': { width: 220, height: 51 },
  'monochrome-white': { width: 220, height: 51 },
  symbol: { width: 72, height: 39 },
};

export function MeknivoLogo({
  variant = 'primary-horizontal',
  width,
  height,
  accessibilityLabel = 'Meknivo',
}: {
  variant?: MeknivoLogoVariant;
  width?: number;
  height?: number;
  accessibilityLabel?: string;
}) {
  const dimensions = defaultDimensions[variant];
  // react-native-svg's web renderer maps the source SVG's aria-labelledby
  // attribute incorrectly. The accessible label below supplies the equivalent
  // semantics without emitting an invalid DOM attribute.
  const svg = BRAND_SVG[assetByVariant[variant]]
    .replace(' role="img" aria-labelledby="title desc"', '');
  return (
    <SvgXml
      accessibilityLabel={accessibilityLabel}
      xml={svg}
      width={width ?? dimensions.width}
      height={height ?? dimensions.height}
    />
  );
}
