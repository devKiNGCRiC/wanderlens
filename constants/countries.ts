export const COUNTRIES = [
  { code: 'IN', name: 'India' }, { code: 'US', name: 'United States' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' }, { code: 'AU', name: 'Australia' }, { code: 'NZ', name: 'New Zealand' },
  { code: 'DE', name: 'Germany' }, { code: 'FR', name: 'France' }, { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' }, { code: 'PT', name: 'Portugal' }, { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' }, { code: 'CH', name: 'Switzerland' }, { code: 'AT', name: 'Austria' },
  { code: 'SE', name: 'Sweden' }, { code: 'NO', name: 'Norway' }, { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' }, { code: 'IE', name: 'Ireland' }, { code: 'PL', name: 'Poland' },
  { code: 'GR', name: 'Greece' }, { code: 'TR', name: 'Turkey' }, { code: 'RU', name: 'Russia' },
  { code: 'UA', name: 'Ukraine' }, { code: 'CZ', name: 'Czech Republic' }, { code: 'HU', name: 'Hungary' },
  { code: 'RO', name: 'Romania' }, { code: 'IS', name: 'Iceland' },
  { code: 'CN', name: 'China' }, { code: 'JP', name: 'Japan' }, { code: 'KR', name: 'South Korea' },
  { code: 'TH', name: 'Thailand' }, { code: 'VN', name: 'Vietnam' }, { code: 'ID', name: 'Indonesia' },
  { code: 'MY', name: 'Malaysia' }, { code: 'SG', name: 'Singapore' }, { code: 'PH', name: 'Philippines' },
  { code: 'NP', name: 'Nepal' }, { code: 'BT', name: 'Bhutan' }, { code: 'LK', name: 'Sri Lanka' },
  { code: 'BD', name: 'Bangladesh' }, { code: 'PK', name: 'Pakistan' }, { code: 'MM', name: 'Myanmar' },
  { code: 'KH', name: 'Cambodia' }, { code: 'LA', name: 'Laos' }, { code: 'MN', name: 'Mongolia' },
  { code: 'AE', name: 'United Arab Emirates' }, { code: 'SA', name: 'Saudi Arabia' }, { code: 'QA', name: 'Qatar' },
  { code: 'IL', name: 'Israel' }, { code: 'JO', name: 'Jordan' }, { code: 'EG', name: 'Egypt' },
  { code: 'ZA', name: 'South Africa' }, { code: 'KE', name: 'Kenya' }, { code: 'TZ', name: 'Tanzania' },
  { code: 'MA', name: 'Morocco' }, { code: 'NG', name: 'Nigeria' }, { code: 'ET', name: 'Ethiopia' },
  { code: 'BR', name: 'Brazil' }, { code: 'AR', name: 'Argentina' }, { code: 'CL', name: 'Chile' },
  { code: 'PE', name: 'Peru' }, { code: 'CO', name: 'Colombia' }, { code: 'MX', name: 'Mexico' },
  { code: 'BO', name: 'Bolivia' }, { code: 'EC', name: 'Ecuador' }, { code: 'UY', name: 'Uruguay' },
  { code: 'CR', name: 'Costa Rica' }, { code: 'CU', name: 'Cuba' },
  { code: 'FJ', name: 'Fiji' }, { code: 'MV', name: 'Maldives' }, { code: 'SC', name: 'Seychelles' },
  { code: 'MU', name: 'Mauritius' }, { code: 'GE', name: 'Georgia' }, { code: 'AM', name: 'Armenia' },
  { code: 'KZ', name: 'Kazakhstan' }, { code: 'UZ', name: 'Uzbekistan' },
];

export function flagEmoji(code: string) {
  return code.toUpperCase().replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}