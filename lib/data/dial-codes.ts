/**
 * Country dialling codes, for the phone number on the campaign-details form.
 *
 * Google and Meta both want a phone number with its country code: a bare
 * "9876543210" could be a number in any of a dozen countries, and the ad
 * platform either refuses it or guesses. So the form asks for the code
 * separately and the number goes out in international form, `+919876543210`
 * (2026-10-09).
 *
 * The form posts the ISO country (`IN`), not the code (`91`): several
 * countries share one code (`+1` is the US, Canada and much of the
 * Caribbean), and posting the code alone would turn "Canada" back into
 * "United States" when the form is shown again.
 *
 * A static list, not a call to a third-party API: this is a fixed fact about
 * the world, and a phone field must never depend on someone else being up.
 */

export interface DialCountry {
  /** ISO 3166-1 alpha-2, what the form posts. */
  iso: string;
  name: string;
  /** Digits only, no `+`. */
  code: string;
}

// Sorted by name, which is the order the picker shows.
export const DIAL_COUNTRIES: readonly DialCountry[] = [
  { iso: "AF", name: "Afghanistan", code: "93" },
  { iso: "AL", name: "Albania", code: "355" },
  { iso: "DZ", name: "Algeria", code: "213" },
  { iso: "AD", name: "Andorra", code: "376" },
  { iso: "AO", name: "Angola", code: "244" },
  { iso: "AG", name: "Antigua and Barbuda", code: "1" },
  { iso: "AR", name: "Argentina", code: "54" },
  { iso: "AM", name: "Armenia", code: "374" },
  { iso: "AU", name: "Australia", code: "61" },
  { iso: "AT", name: "Austria", code: "43" },
  { iso: "AZ", name: "Azerbaijan", code: "994" },
  { iso: "BS", name: "Bahamas", code: "1" },
  { iso: "BH", name: "Bahrain", code: "973" },
  { iso: "BD", name: "Bangladesh", code: "880" },
  { iso: "BB", name: "Barbados", code: "1" },
  { iso: "BY", name: "Belarus", code: "375" },
  { iso: "BE", name: "Belgium", code: "32" },
  { iso: "BZ", name: "Belize", code: "501" },
  { iso: "BJ", name: "Benin", code: "229" },
  { iso: "BT", name: "Bhutan", code: "975" },
  { iso: "BO", name: "Bolivia", code: "591" },
  { iso: "BA", name: "Bosnia and Herzegovina", code: "387" },
  { iso: "BW", name: "Botswana", code: "267" },
  { iso: "BR", name: "Brazil", code: "55" },
  { iso: "BN", name: "Brunei", code: "673" },
  { iso: "BG", name: "Bulgaria", code: "359" },
  { iso: "BF", name: "Burkina Faso", code: "226" },
  { iso: "BI", name: "Burundi", code: "257" },
  { iso: "KH", name: "Cambodia", code: "855" },
  { iso: "CM", name: "Cameroon", code: "237" },
  { iso: "CA", name: "Canada", code: "1" },
  { iso: "CV", name: "Cape Verde", code: "238" },
  { iso: "CF", name: "Central African Republic", code: "236" },
  { iso: "TD", name: "Chad", code: "235" },
  { iso: "CL", name: "Chile", code: "56" },
  { iso: "CN", name: "China", code: "86" },
  { iso: "CO", name: "Colombia", code: "57" },
  { iso: "KM", name: "Comoros", code: "269" },
  { iso: "CG", name: "Congo", code: "242" },
  { iso: "CD", name: "Congo (DRC)", code: "243" },
  { iso: "CR", name: "Costa Rica", code: "506" },
  { iso: "CI", name: "Côte d'Ivoire", code: "225" },
  { iso: "HR", name: "Croatia", code: "385" },
  { iso: "CU", name: "Cuba", code: "53" },
  { iso: "CY", name: "Cyprus", code: "357" },
  { iso: "CZ", name: "Czechia", code: "420" },
  { iso: "DK", name: "Denmark", code: "45" },
  { iso: "DJ", name: "Djibouti", code: "253" },
  { iso: "DM", name: "Dominica", code: "1" },
  { iso: "DO", name: "Dominican Republic", code: "1" },
  { iso: "EC", name: "Ecuador", code: "593" },
  { iso: "EG", name: "Egypt", code: "20" },
  { iso: "SV", name: "El Salvador", code: "503" },
  { iso: "GQ", name: "Equatorial Guinea", code: "240" },
  { iso: "ER", name: "Eritrea", code: "291" },
  { iso: "EE", name: "Estonia", code: "372" },
  { iso: "SZ", name: "Eswatini", code: "268" },
  { iso: "ET", name: "Ethiopia", code: "251" },
  { iso: "FJ", name: "Fiji", code: "679" },
  { iso: "FI", name: "Finland", code: "358" },
  { iso: "FR", name: "France", code: "33" },
  { iso: "GA", name: "Gabon", code: "241" },
  { iso: "GM", name: "Gambia", code: "220" },
  { iso: "GE", name: "Georgia", code: "995" },
  { iso: "DE", name: "Germany", code: "49" },
  { iso: "GH", name: "Ghana", code: "233" },
  { iso: "GR", name: "Greece", code: "30" },
  { iso: "GD", name: "Grenada", code: "1" },
  { iso: "GT", name: "Guatemala", code: "502" },
  { iso: "GN", name: "Guinea", code: "224" },
  { iso: "GW", name: "Guinea-Bissau", code: "245" },
  { iso: "GY", name: "Guyana", code: "592" },
  { iso: "HT", name: "Haiti", code: "509" },
  { iso: "HN", name: "Honduras", code: "504" },
  { iso: "HK", name: "Hong Kong", code: "852" },
  { iso: "HU", name: "Hungary", code: "36" },
  { iso: "IS", name: "Iceland", code: "354" },
  { iso: "IN", name: "India", code: "91" },
  { iso: "ID", name: "Indonesia", code: "62" },
  { iso: "IR", name: "Iran", code: "98" },
  { iso: "IQ", name: "Iraq", code: "964" },
  { iso: "IE", name: "Ireland", code: "353" },
  { iso: "IL", name: "Israel", code: "972" },
  { iso: "IT", name: "Italy", code: "39" },
  { iso: "JM", name: "Jamaica", code: "1" },
  { iso: "JP", name: "Japan", code: "81" },
  { iso: "JO", name: "Jordan", code: "962" },
  { iso: "KZ", name: "Kazakhstan", code: "7" },
  { iso: "KE", name: "Kenya", code: "254" },
  { iso: "KI", name: "Kiribati", code: "686" },
  { iso: "KW", name: "Kuwait", code: "965" },
  { iso: "KG", name: "Kyrgyzstan", code: "996" },
  { iso: "LA", name: "Laos", code: "856" },
  { iso: "LV", name: "Latvia", code: "371" },
  { iso: "LB", name: "Lebanon", code: "961" },
  { iso: "LS", name: "Lesotho", code: "266" },
  { iso: "LR", name: "Liberia", code: "231" },
  { iso: "LY", name: "Libya", code: "218" },
  { iso: "LI", name: "Liechtenstein", code: "423" },
  { iso: "LT", name: "Lithuania", code: "370" },
  { iso: "LU", name: "Luxembourg", code: "352" },
  { iso: "MO", name: "Macao", code: "853" },
  { iso: "MG", name: "Madagascar", code: "261" },
  { iso: "MW", name: "Malawi", code: "265" },
  { iso: "MY", name: "Malaysia", code: "60" },
  { iso: "MV", name: "Maldives", code: "960" },
  { iso: "ML", name: "Mali", code: "223" },
  { iso: "MT", name: "Malta", code: "356" },
  { iso: "MH", name: "Marshall Islands", code: "692" },
  { iso: "MR", name: "Mauritania", code: "222" },
  { iso: "MU", name: "Mauritius", code: "230" },
  { iso: "MX", name: "Mexico", code: "52" },
  { iso: "FM", name: "Micronesia", code: "691" },
  { iso: "MD", name: "Moldova", code: "373" },
  { iso: "MC", name: "Monaco", code: "377" },
  { iso: "MN", name: "Mongolia", code: "976" },
  { iso: "ME", name: "Montenegro", code: "382" },
  { iso: "MA", name: "Morocco", code: "212" },
  { iso: "MZ", name: "Mozambique", code: "258" },
  { iso: "MM", name: "Myanmar", code: "95" },
  { iso: "NA", name: "Namibia", code: "264" },
  { iso: "NR", name: "Nauru", code: "674" },
  { iso: "NP", name: "Nepal", code: "977" },
  { iso: "NL", name: "Netherlands", code: "31" },
  { iso: "NZ", name: "New Zealand", code: "64" },
  { iso: "NI", name: "Nicaragua", code: "505" },
  { iso: "NE", name: "Niger", code: "227" },
  { iso: "NG", name: "Nigeria", code: "234" },
  { iso: "KP", name: "North Korea", code: "850" },
  { iso: "MK", name: "North Macedonia", code: "389" },
  { iso: "NO", name: "Norway", code: "47" },
  { iso: "OM", name: "Oman", code: "968" },
  { iso: "PK", name: "Pakistan", code: "92" },
  { iso: "PW", name: "Palau", code: "680" },
  { iso: "PS", name: "Palestine", code: "970" },
  { iso: "PA", name: "Panama", code: "507" },
  { iso: "PG", name: "Papua New Guinea", code: "675" },
  { iso: "PY", name: "Paraguay", code: "595" },
  { iso: "PE", name: "Peru", code: "51" },
  { iso: "PH", name: "Philippines", code: "63" },
  { iso: "PL", name: "Poland", code: "48" },
  { iso: "PT", name: "Portugal", code: "351" },
  { iso: "PR", name: "Puerto Rico", code: "1" },
  { iso: "QA", name: "Qatar", code: "974" },
  { iso: "RO", name: "Romania", code: "40" },
  { iso: "RU", name: "Russia", code: "7" },
  { iso: "RW", name: "Rwanda", code: "250" },
  { iso: "KN", name: "Saint Kitts and Nevis", code: "1" },
  { iso: "LC", name: "Saint Lucia", code: "1" },
  { iso: "VC", name: "Saint Vincent and the Grenadines", code: "1" },
  { iso: "WS", name: "Samoa", code: "685" },
  { iso: "SM", name: "San Marino", code: "378" },
  { iso: "ST", name: "São Tomé and Príncipe", code: "239" },
  { iso: "SA", name: "Saudi Arabia", code: "966" },
  { iso: "SN", name: "Senegal", code: "221" },
  { iso: "RS", name: "Serbia", code: "381" },
  { iso: "SC", name: "Seychelles", code: "248" },
  { iso: "SL", name: "Sierra Leone", code: "232" },
  { iso: "SG", name: "Singapore", code: "65" },
  { iso: "SK", name: "Slovakia", code: "421" },
  { iso: "SI", name: "Slovenia", code: "386" },
  { iso: "SB", name: "Solomon Islands", code: "677" },
  { iso: "SO", name: "Somalia", code: "252" },
  { iso: "ZA", name: "South Africa", code: "27" },
  { iso: "KR", name: "South Korea", code: "82" },
  { iso: "SS", name: "South Sudan", code: "211" },
  { iso: "ES", name: "Spain", code: "34" },
  { iso: "LK", name: "Sri Lanka", code: "94" },
  { iso: "SD", name: "Sudan", code: "249" },
  { iso: "SR", name: "Suriname", code: "597" },
  { iso: "SE", name: "Sweden", code: "46" },
  { iso: "CH", name: "Switzerland", code: "41" },
  { iso: "SY", name: "Syria", code: "963" },
  { iso: "TW", name: "Taiwan", code: "886" },
  { iso: "TJ", name: "Tajikistan", code: "992" },
  { iso: "TZ", name: "Tanzania", code: "255" },
  { iso: "TH", name: "Thailand", code: "66" },
  { iso: "TL", name: "Timor-Leste", code: "670" },
  { iso: "TG", name: "Togo", code: "228" },
  { iso: "TO", name: "Tonga", code: "676" },
  { iso: "TT", name: "Trinidad and Tobago", code: "1" },
  { iso: "TN", name: "Tunisia", code: "216" },
  { iso: "TR", name: "Türkiye", code: "90" },
  { iso: "TM", name: "Turkmenistan", code: "993" },
  { iso: "TV", name: "Tuvalu", code: "688" },
  { iso: "UG", name: "Uganda", code: "256" },
  { iso: "UA", name: "Ukraine", code: "380" },
  { iso: "AE", name: "United Arab Emirates", code: "971" },
  { iso: "GB", name: "United Kingdom", code: "44" },
  { iso: "US", name: "United States", code: "1" },
  { iso: "UY", name: "Uruguay", code: "598" },
  { iso: "UZ", name: "Uzbekistan", code: "998" },
  { iso: "VU", name: "Vanuatu", code: "678" },
  { iso: "VA", name: "Vatican City", code: "39" },
  { iso: "VE", name: "Venezuela", code: "58" },
  { iso: "VN", name: "Vietnam", code: "84" },
  { iso: "YE", name: "Yemen", code: "967" },
  { iso: "ZM", name: "Zambia", code: "260" },
  { iso: "ZW", name: "Zimbabwe", code: "263" },
];

const BY_ISO = new Map(DIAL_COUNTRIES.map((country) => [country.iso, country]));

/** The country for an ISO code the form posted, or null for anything else. */
export function dialCountry(iso: string): DialCountry | null {
  return BY_ISO.get(iso.trim().toUpperCase()) ?? null;
}

/**
 * The number in international form: `+` + code + the national digits.
 *
 * The national part loses its spaces, dashes and brackets, and any leading
 * zero — the trunk prefix dialled inside the country (`0` in the UK and
 * India), which is not part of the number once the code is in front.
 *
 * A number already typed WITH a `+` is the customer's own international form
 * and is kept as typed (digits only), whatever the picker says. With no
 * country chosen and no `+`, the digits come back bare, which
 * `phoneProblems` then refuses.
 */
export function internationalNumber(iso: string, typed: string): string {
  const trimmed = typed.trim();
  if (trimmed === "") return "";
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return `+${digits}`;
  const country = dialCountry(iso);
  if (!country) return digits;
  return `+${country.code}${digits.replace(/^0+/, "")}`;
}

/**
 * A stored international number back into its two parts, to show the form
 * again: the country that owns the longest matching code, and the rest.
 *
 * `preferIso` breaks a shared code (`+1`) in favour of the country the
 * customer picked before; without one the first country listed for that code
 * is used. Anything without a `+` is all national number, no country.
 */
export function splitInternational(value: string, preferIso = ""): { iso: string; national: string } {
  const trimmed = value.trim();
  if (!trimmed.startsWith("+")) return { iso: "", national: trimmed };
  const digits = trimmed.replace(/\D/g, "");
  const preferred = dialCountry(preferIso);
  if (preferred && digits.startsWith(preferred.code)) {
    return { iso: preferred.iso, national: digits.slice(preferred.code.length) };
  }
  // Longest code first, so "+353…" is Ireland rather than a guess at "+35".
  for (const length of [3, 2, 1]) {
    const code = digits.slice(0, length);
    const owner = SHARED_CODE_OWNER[code] ?? DIAL_COUNTRIES.find((country) => country.code === code)?.iso;
    if (owner) return { iso: owner, national: digits.slice(length) };
  }
  return { iso: "", national: trimmed };
}

/**
 * Who a shared code is shown as when nothing says otherwise. Alphabetical
 * order would show every `+1` number as Antigua and Barbuda.
 */
const SHARED_CODE_OWNER: Record<string, string> = { "1": "US", "7": "RU", "39": "IT" };

/**
 * Whether an international number is long enough to be one: 8 to 15 digits
 * with the code (the international standard's ceiling is 15), and at least 6
 * after it. Not a "10 digits" rule — that refuses most of the world
 * (Singapore has 8, Australia 9 once the leading 0 goes).
 */
export function isPlausibleInternational(value: string): boolean {
  if (!value.startsWith("+")) return false;
  const digits = value.replace(/\D/g, "");
  const { national } = splitInternational(value);
  return digits.length >= 8 && digits.length <= 15 && national.length >= 6;
}
