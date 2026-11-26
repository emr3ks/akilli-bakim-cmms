import { Platform } from 'react-native';

export const colors = {
  ink: '#081735',
  inkMuted: '#53647A',
  primary: '#087FE5',
  primaryDark: '#0646A8',
  primarySoft: '#EAF4FC',
  accent: '#20B9F4',
  accentSoft: '#E4F8FE',
  background: '#F3F6FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFD',
  border: '#DCE4EE',
  borderStrong: '#C3CFDC',
  danger: '#D14343',
  dangerSoft: '#FDECEC',
  warning: '#C57A08',
  warningSoft: '#FFF4DA',
  success: '#17864E',
  successSoft: '#E5F7ED',
  neutral: '#617186',
  neutralSoft: '#EEF2F6',
  white: '#FFFFFF',
  black: '#000000',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const shadow = Platform.select({
  web: {
    boxShadow: '0 8px 24px rgba(16, 35, 63, 0.08)',
  } as object,
  default: {
    elevation: 3,
    shadowColor: '#10233F',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 10,
  },
});

export const typography = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800' as const },
  heading: { fontSize: 21, lineHeight: 27, fontWeight: '800' as const },
  subheading: { fontSize: 16, lineHeight: 22, fontWeight: '700' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '700' as const },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '500' as const },
};
