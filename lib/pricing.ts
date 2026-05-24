import type { Destination } from './destinations';

export type FlightOffer = {
  price: number;
  currency: string;
  durationMinutes: number;
  stops: number;
  source: 'demo';
};

export type TripEstimate = {
  nights: number;
  travelers: number;
  flightTotal: number;
  hotelTotal: number;
  foodTotal: number;
  transportTotal: number;
  activitiesTotal: number;
  safetyBuffer: number;
  total: number;
};

export function nightsBetween(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 5;
  const diff = new Date(endDate).getTime() - new Date(startDate).getTime();
  return Math.max(Math.ceil(diff / 86400000), 1);
}

const LONG_HAUL_AIRPORTS = [
  'DPS',
  'HKT',
  'MLE',
  'ZNZ',
  'KBV',
  'MPH',
  'MRU',
  'DAD',
  'CUN',
  'SID',
  'NRT',
  'SIN',
  'BKK',
  'DXB',
  'HKG',
  'MEX',
  'ITM',
  'EZE',
  'CPT',
  'KTM',
  'PUQ',
  'YYC',
  'KWL',
  'SFO',
  'ASR',
  'ZQN',
  'SJO',
  'DYG',
  'JRO',
  'SGN',
  'KIX',
  'LIM',
  'CMB',
  'CTS',
  'WDH',
  'MDE',
  'MCT',
  'KEF',
  'REP',
  'CUZ',
  'FEZ',
  'SKD',
  'HAV',
  'AMM',
  'CAI',
  'VNS',
  'RAK',
  'SID',
  'CV',
];

export function demoFlight(
  origin: string,
  dest: Destination,
  startDate: string
): FlightOffer {
  const seed =
    origin.charCodeAt(0) +
    dest.airportCode.charCodeAt(0) +
    new Date(startDate || Date.now()).getMonth() +
    dest.hotelNightEstimate;
  const isLongHaul = LONG_HAUL_AIRPORTS.includes(dest.airportCode);
  const base = isLongHaul
    ? dest.costLevel === 'budget'
      ? 420
      : dest.costLevel === 'mid'
      ? 580
      : 950
    : dest.costLevel === 'budget'
    ? 95
    : dest.costLevel === 'mid'
    ? 155
    : 240;
  const price = Math.round(base + (seed % (isLongHaul ? 200 : 90)));
  const durationBase = isLongHaul
    ? 600
    : dest.costLevel === 'premium'
    ? 210
    : dest.costLevel === 'mid'
    ? 180
    : 150;
  return {
    price,
    currency: 'EUR',
    durationMinutes: durationBase + (seed % 120),
    stops: isLongHaul ? 1 : seed % 3 === 0 ? 1 : 0,
    source: 'demo',
  };
}

export function calculateTrip(
  dest: Destination,
  flight: FlightOffer,
  startDate: string,
  endDate: string,
  travelers: number
): TripEstimate {
  const nights = nightsBetween(startDate, endDate);
  const t = Math.max(Number(travelers) || 1, 1);
  const flightTotal = flight.price * t;
  const hotelTotal = dest.hotelNightEstimate * nights;
  const foodTotal = dest.foodPerDay * nights * t;
  const transportTotal = dest.transportPerDay * nights * t;
  const activitiesTotal = dest.activityPerDay * nights * t;
  const safetyBuffer = Math.round(
    (flightTotal + hotelTotal + foodTotal + transportTotal + activitiesTotal) *
      0.08
  );
  return {
    nights,
    travelers: t,
    flightTotal,
    hotelTotal,
    foodTotal,
    transportTotal,
    activitiesTotal,
    safetyBuffer,
    total:
      flightTotal +
      hotelTotal +
      foodTotal +
      transportTotal +
      activitiesTotal +
      safetyBuffer,
  };
}

export function fmt(amount: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function skyscannerLink(
  origin: string,
  destAirport: string,
  startDate: string,
  endDate: string,
  travelers: number
) {
  const t = Math.max(Number(travelers) || 1, 1);
  const formatDate = (d: string) => {
    if (!d) return '';
    const [year, month, day] = d.split('-');
    return `${year.slice(2)}${month}${day}`;
  };
  const d1 = formatDate(startDate);
  const d2 = formatDate(endDate);
  const orig = origin.toLowerCase();
  const dest = destAirport.toLowerCase();
  if (d1 && d2) {
    return `https://www.skyscanner.net/transport/flights/${orig}/${dest}/${d1}/${d2}/?adults=${t}&currency=EUR&locale=en-GB`;
  }
  return `https://www.skyscanner.net/transport/flights/${orig}/${dest}/?adults=${t}&currency=EUR&locale=en-GB`;
}

export function bookingLink(
  dest: Destination,
  startDate: string,
  endDate: string,
  travelers: number
) {
  const maxPrice = Math.round(dest.hotelNightEstimate * 1.5);
  const params = new URLSearchParams({
    ss: `${dest.city}, ${dest.country}`,
    checkin: startDate || '',
    checkout: endDate || '',
    group_adults: String(Math.max(Number(travelers) || 1, 1)),
    no_rooms: '1',
    group_children: '0',
    nflt: `price=EUR-min-${maxPrice}-1`,
    order: 'price',
  });
  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}
