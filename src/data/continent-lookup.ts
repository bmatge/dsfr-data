/**
 * Country code lookups: continent mapping and ISO code conversions.
 * Data from Natural Earth / UN M49 classification.
 * Covers all 177 countries in world-atlas countries-110m.json.
 */

/** ISO 3166-1 numeric → continent */
export const COUNTRY_CONTINENT: Record<string, string> = {
  // Africa
  '012': 'Africa', '024': 'Africa', '072': 'Africa', '084': 'Africa',
  '108': 'Africa', '120': 'Africa', '140': 'Africa', '148': 'Africa',
  '178': 'Africa', '180': 'Africa', '204': 'Africa', '226': 'Africa',
  '231': 'Africa', '232': 'Africa', '260': 'Africa', '262': 'Africa',
  '266': 'Africa', '270': 'Africa', '288': 'Africa', '324': 'Africa',
  '384': 'Africa', '404': 'Africa', '426': 'Africa', '430': 'Africa',
  '434': 'Africa', '450': 'Africa', '454': 'Africa', '466': 'Africa',
  '478': 'Africa', '504': 'Africa', '508': 'Africa', '516': 'Africa',
  '562': 'Africa', '566': 'Africa', '624': 'Africa', '646': 'Africa',
  '686': 'Africa', '694': 'Africa', '706': 'Africa', '710': 'Africa',
  '716': 'Africa', '728': 'Africa', '729': 'Africa', '732': 'Africa',
  '748': 'Africa', '768': 'Africa', '788': 'Africa', '800': 'Africa',
  '834': 'Africa', '854': 'Africa', '894': 'Africa',
  // Europe
  '008': 'Europe', '040': 'Europe', '056': 'Europe', '070': 'Europe',
  '100': 'Europe', '112': 'Europe', '191': 'Europe', '196': 'Europe',
  '203': 'Europe', '208': 'Europe', '233': 'Europe', '246': 'Europe',
  '250': 'Europe', '268': 'Europe', '276': 'Europe', '300': 'Europe',
  '348': 'Europe', '352': 'Europe', '372': 'Europe', '380': 'Europe',
  '428': 'Europe', '440': 'Europe', '442': 'Europe', '498': 'Europe',
  '499': 'Europe', '528': 'Europe', '578': 'Europe', '616': 'Europe',
  '620': 'Europe', '642': 'Europe', '643': 'Europe', '688': 'Europe',
  '703': 'Europe', '705': 'Europe', '724': 'Europe', '752': 'Europe',
  '756': 'Europe', '804': 'Europe', '807': 'Europe', '826': 'Europe',
  // Asia
  '004': 'Asia', '031': 'Asia', '048': 'Asia', '050': 'Asia',
  '051': 'Asia', '064': 'Asia', '096': 'Asia', '104': 'Asia',
  '116': 'Asia', '144': 'Asia', '156': 'Asia', '158': 'Asia',
  '275': 'Asia', '356': 'Asia', '360': 'Asia', '364': 'Asia',
  '368': 'Asia', '376': 'Asia', '392': 'Asia', '398': 'Asia',
  '400': 'Asia', '408': 'Asia', '410': 'Asia', '414': 'Asia',
  '417': 'Asia', '418': 'Asia', '422': 'Asia', '458': 'Asia',
  '496': 'Asia', '512': 'Asia', '524': 'Asia', '586': 'Asia',
  '608': 'Asia', '626': 'Asia', '634': 'Asia', '682': 'Asia',
  '702': 'Asia', '704': 'Asia', '760': 'Asia', '762': 'Asia',
  '764': 'Asia', '784': 'Asia', '792': 'Asia', '795': 'Asia',
  '860': 'Asia', '887': 'Asia',
  // North America
  '044': 'North America', '124': 'North America', '188': 'North America',
  '192': 'North America', '214': 'North America', '222': 'North America',
  '320': 'North America', '332': 'North America', '340': 'North America',
  '388': 'North America', '484': 'North America', '558': 'North America',
  '591': 'North America', '630': 'North America', '780': 'North America',
  '840': 'North America',
  // South America
  '032': 'South America', '068': 'South America', '076': 'South America',
  '152': 'South America', '170': 'South America', '218': 'South America',
  '238': 'South America', '328': 'South America', '600': 'South America',
  '604': 'South America', '740': 'South America', '858': 'South America',
  '862': 'South America',
  // Oceania
  '010': 'Oceania', '036': 'Oceania', '090': 'Oceania',
  '242': 'Oceania', '540': 'Oceania', '548': 'Oceania',
  '554': 'Oceania', '598': 'Oceania',
  // Antarctica
  '304': 'Oceania', // Greenland → grouped with Oceania for map zoom
};

/** ISO 3166-1 alpha-2 → numeric */
export const ISO_A2_TO_NUM: Record<string, string> = {
  AF: '004', AL: '008', AQ: '010', DZ: '012', AO: '024', AZ: '031',
  AR: '032', AU: '036', AT: '040', BS: '044', BD: '050', AM: '051',
  BE: '056', BT: '064', BO: '068', BA: '070', BW: '072', BZ: '084',
  BR: '076', BN: '096', BG: '100', MM: '104', BI: '108', BY: '112',
  KH: '116', CM: '120', CA: '124', CF: '140', LK: '144', TD: '148',
  CL: '152', CN: '156', TW: '158', CO: '170', CG: '178', CD: '180',
  CR: '188', HR: '191', CU: '192', CY: '196', CZ: '203', BJ: '204',
  DK: '208', DO: '214', EC: '218', SV: '222', GQ: '226', ER: '232',
  EE: '233', ET: '231', FK: '238', FJ: '242', FI: '246', FR: '250',
  DJ: '262', GA: '266', GE: '268', GM: '270', PS: '275', DE: '276',
  GH: '288', GR: '300', GL: '304', GT: '320', GN: '324', GY: '328',
  HT: '332', HN: '340', HU: '348', IS: '352', IN: '356', ID: '360',
  IR: '364', IQ: '368', IE: '372', IL: '376', IT: '380', CI: '384',
  JM: '388', JP: '392', KZ: '398', JO: '400', KE: '404', KP: '408',
  KR: '410', KW: '414', KG: '417', LA: '418', LB: '422', LS: '426',
  LV: '428', LR: '430', LY: '434', LT: '440', LU: '442', MG: '450',
  MW: '454', MY: '458', ML: '466', MR: '478', MX: '484', MN: '496',
  MD: '498', ME: '499', MA: '504', MZ: '508', OM: '512', NA: '516',
  NP: '524', NL: '528', NC: '540', VU: '548', NZ: '554', NI: '558',
  NE: '562', NG: '566', NO: '578', PK: '586', PA: '591', PG: '598',
  PY: '600', PE: '604', PH: '608', PL: '616', PT: '620', GW: '624',
  TL: '626', PR: '630', QA: '634', RO: '642', RU: '643', RW: '646',
  SA: '682', SN: '686', RS: '688', SL: '694', SK: '703', VN: '704',
  SI: '705', SO: '706', ZA: '710', ZW: '716', SS: '728', SD: '729',
  EH: '732', SR: '740', SZ: '748', SE: '752', CH: '756', SY: '760',
  TJ: '762', TH: '764', TG: '768', TT: '780', AE: '784', TN: '788',
  TR: '792', TM: '795', UG: '800', UA: '804', MK: '807', EG: '818',
  GB: '826', TZ: '834', US: '840', BF: '854', UY: '858', UZ: '860',
  VE: '862', YE: '887', ZM: '894',
  // Missing from initial mapping
  ES: '724', SG: '702', BH: '048',
  // SB missing in 110m but keep for completeness
  SB: '090', GD: '308',
};

/** ISO 3166-1 alpha-3 → numeric */
export const ISO_A3_TO_NUM: Record<string, string> = {
  AFG: '004', ALB: '008', ATA: '010', DZA: '012', AGO: '024', AZE: '031',
  ARG: '032', AUS: '036', AUT: '040', BHS: '044', BGD: '050', ARM: '051',
  BEL: '056', BTN: '064', BOL: '068', BIH: '070', BWA: '072', BLZ: '084',
  BRA: '076', BRN: '096', BGR: '100', MMR: '104', BDI: '108', BLR: '112',
  KHM: '116', CMR: '120', CAN: '124', CAF: '140', LKA: '144', TCD: '148',
  CHL: '152', CHN: '156', TWN: '158', COL: '170', COG: '178', COD: '180',
  CRI: '188', HRV: '191', CUB: '192', CYP: '196', CZE: '203', BEN: '204',
  DNK: '208', DOM: '214', ECU: '218', SLV: '222', GNQ: '226', ERI: '232',
  EST: '233', ETH: '231', FLK: '238', FJI: '242', FIN: '246', FRA: '250',
  DJI: '262', GAB: '266', GEO: '268', GMB: '270', PSE: '275', DEU: '276',
  GHA: '288', GRC: '300', GRL: '304', GTM: '320', GIN: '324', GUY: '328',
  HTI: '332', HND: '340', HUN: '348', ISL: '352', IND: '356', IDN: '360',
  IRN: '364', IRQ: '368', IRL: '372', ISR: '376', ITA: '380', CIV: '384',
  JAM: '388', JPN: '392', KAZ: '398', JOR: '400', KEN: '404', PRK: '408',
  KOR: '410', KWT: '414', KGZ: '417', LAO: '418', LBN: '422', LSO: '426',
  LVA: '428', LBR: '430', LBY: '434', LTU: '440', LUX: '442', MDG: '450',
  MWI: '454', MYS: '458', MLI: '466', MRT: '478', MEX: '484', MNG: '496',
  MDA: '498', MNE: '499', MAR: '504', MOZ: '508', OMN: '512', NAM: '516',
  NPL: '524', NLD: '528', NCL: '540', VUT: '548', NZL: '554', NIC: '558',
  NER: '562', NGA: '566', NOR: '578', PAK: '586', PAN: '591', PNG: '598',
  PRY: '600', PER: '604', PHL: '608', POL: '616', PRT: '620', GNB: '624',
  TLS: '626', PRI: '630', QAT: '634', ROU: '642', RUS: '643', RWA: '646',
  SAU: '682', SEN: '686', SRB: '688', SLE: '694', SVK: '703', VNM: '704',
  SVN: '705', SOM: '706', ZAF: '710', ZWE: '716', SSD: '728', SDN: '729',
  ESH: '732', SUR: '740', SWZ: '748', SWE: '752', CHE: '756', SYR: '760',
  TJK: '762', THA: '764', TGO: '768', TTO: '780', ARE: '784', TUN: '788',
  TUR: '792', TKM: '795', UGA: '800', UKR: '804', MKD: '807', EGY: '818',
  GBR: '826', TZA: '834', USA: '840', BFA: '854', URY: '858', UZB: '860',
  VEN: '862', YEM: '887', ZMB: '894',
  // Missing from initial mapping
  ESP: '724', SGP: '702', BHR: '048',
  SLB: '090',
};

/** Normalize any ISO code format to numeric */
export function toIsoNumeric(code: string, format: 'iso-a2' | 'iso-a3' | 'iso-num'): string {
  const upper = code.trim().toUpperCase();
  switch (format) {
    case 'iso-a2': return ISO_A2_TO_NUM[upper] || '';
    case 'iso-a3': return ISO_A3_TO_NUM[upper] || '';
    case 'iso-num': return upper.padStart(3, '0');
  }
}

/** All continent names used in the lookup */
export const CONTINENTS = [
  'Africa', 'Europe', 'Asia', 'North America', 'South America', 'Oceania'
] as const;

export type ContinentName = (typeof CONTINENTS)[number];
