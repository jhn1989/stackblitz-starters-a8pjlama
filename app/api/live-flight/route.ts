import { NextResponse } from 'next/server';

type LiveFlightRequest = {
  origin: string;
  destination: string;
  outboundDate: string;
  inboundDate: string;
  travelers: number;
};

type NormalizedFlightPrice = {
  pricePerPerson: number;
  totalPrice: number;
  provider: string;
  currency: string;
  title: string;
  rawIndex: number;
  pricePath: string;
};

function parsePrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const original = value.trim();

  if (!original) {
    return null;
  }

  let cleaned = original.replace(/[^\d.,]/g, '');

  if (!cleaned) {
    return null;
  }

  const commaCount = (cleaned.match(/,/g) || []).length;
  const dotCount = (cleaned.match(/\./g) || []).length;

  if (commaCount > 0 && dotCount > 0) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');

    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (commaCount === 1 && dotCount === 0) {
    const parts = cleaned.split(',');

    if (parts[1] && parts[1].length === 2) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(',', '');
    }
  } else if (commaCount > 1 && dotCount === 0) {
    cleaned = cleaned.replace(/,/g, '');
  }

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function getString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return '';
}

function getNestedValue(obj: any, path: string): unknown {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}

function getProvider(item: any): string {
  const providerFields = [
    item.provider,
    item.source,
    item.site,
    item.agency,
    item.vendor,
    item.airline,
    item.airlines,
    item.carrier,
    item.carriers,
    item.bookingSite,
    item.booking_site,
    item.name,
  ];

  for (const field of providerFields) {
    if (typeof field === 'string' && field.trim()) {
      return field.trim();
    }

    if (Array.isArray(field) && field.length > 0) {
      return field.map(function (x) {
        return getString(x);
      }).filter(Boolean).join(', ');
    }
  }

  return 'Unknown provider';
}

function getTitle(item: any): string {
  const titleFields = [
    item.title,
    item.name,
    item.description,
    item.route,
    item.summary,
    item.flight,
    item.flights,
  ];

  for (const field of titleFields) {
    if (typeof field === 'string' && field.trim()) {
      return field.trim();
    }
  }

  return 'Flight result';
}

function getCurrency(item: any): string {
  const currencyFields = [
    item.currency,
    item.priceCurrency,
    item.price_currency,
    item.totalCurrency,
    item.price?.currency,
    item.price?.currencyCode,
    item.price?.currency_code,
  ];

  for (const field of currencyFields) {
    if (typeof field === 'string' && field.trim()) {
      return field.trim().toUpperCase();
    }
  }

  return 'EUR';
}

function hasRoundTripSignal(item: any): boolean {
  const text = JSON.stringify(item).toLowerCase();

  return (
    text.includes('return') ||
    text.includes('round') ||
    text.includes('roundtrip') ||
    text.includes('round_trip') ||
    text.includes('inbound') ||
    text.includes('outbound') ||
    text.includes('two-way') ||
    text.includes('2 way') ||
    text.includes('flightback') ||
    text.includes('backflight')
  );
}

function normalizeCandidateFromTotal(
  item: any,
  rawIndex: number,
  travelers: number,
  total: number,
  pricePath: string
): NormalizedFlightPrice | null {
  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }

  const pricePerPerson = total / Math.max(1, travelers);

  if (pricePerPerson < 100 || pricePerPerson > 10000) {
    return null;
  }

  return {
    pricePerPerson,
    totalPrice: total,
    provider: getProvider(item),
    currency: getCurrency(item),
    title: getTitle(item),
    rawIndex,
    pricePath,
  };
}

function normalizeCandidateFromPerPerson(
  item: any,
  rawIndex: number,
  travelers: number,
  pricePerPerson: number,
  pricePath: string
): NormalizedFlightPrice | null {
  if (!Number.isFinite(pricePerPerson) || pricePerPerson <= 0) {
    return null;
  }

  if (pricePerPerson < 100 || pricePerPerson > 10000) {
    return null;
  }

  return {
    pricePerPerson,
    totalPrice: pricePerPerson * Math.max(1, travelers),
    provider: getProvider(item),
    currency: getCurrency(item),
    title: getTitle(item),
    rawIndex,
    pricePath,
  };
}

function findExplicitPriceCandidates(
  item: any,
  rawIndex: number,
  travelers: number
): NormalizedFlightPrice[] {
  const candidates: NormalizedFlightPrice[] = [];

  const totalPricePaths = [
    'totalPrice',
    'total_price',
    'totalAmount',
    'total_amount',
    'priceTotal',
    'price_total',
    'grandTotal',
    'grand_total',
    'amountTotal',
    'amount_total',
    'price.total',
    'price.totalPrice',
    'price.total_price',
    'price.totalAmount',
    'price.total_amount',
    'price.grandTotal',
    'price.grand_total',
    'pricing.total',
    'pricing.totalPrice',
    'pricing.total_price',
    'fare.total',
    'fare.totalPrice',
    'fare.total_price',
    'fares.total',
    'fares.totalPrice',
    'fares.total_price',
  ];

  const perPersonPricePaths = [
    'pricePerPerson',
    'price_per_person',
    'perPersonPrice',
    'per_person_price',
    'pricePerAdult',
    'price_per_adult',
    'adultPrice',
    'adult_price',
    'price',
    'priceAmount',
    'price_amount',
    'amount',
    'value',
    'fare',
    'farePrice',
    'fare_price',
    'price.amount',
    'price.value',
    'price.raw',
    'price.formatted',
    'pricing.price',
    'pricing.amount',
    'pricing.value',
    'fare.price',
    'fare.amount',
    'fare.value',
  ];

  for (const path of totalPricePaths) {
    const parsed = parsePrice(getNestedValue(item, path));

    if (parsed !== null) {
      const candidate = normalizeCandidateFromTotal(
        item,
        rawIndex,
        travelers,
        parsed,
        path
      );

      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  for (const path of perPersonPricePaths) {
    const parsed = parsePrice(getNestedValue(item, path));

    if (parsed !== null) {
      const candidate = normalizeCandidateFromPerPerson(
        item,
        rawIndex,
        travelers,
        parsed,
        path
      );

      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

function findDeepTotalCandidates(
  value: unknown,
  rawIndex: number,
  travelers: number,
  item: any,
  path: string,
  candidates: NormalizedFlightPrice[]
) {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const lowerPath = path.toLowerCase();

    const looksLikeFullTotal =
      lowerPath.includes('totalprice') ||
      lowerPath.includes('total_price') ||
      lowerPath.includes('totalamount') ||
      lowerPath.includes('total_amount') ||
      lowerPath.endsWith('.total') ||
      lowerPath.includes('.total.');

    if (!looksLikeFullTotal) {
      return;
    }

    const parsed = parsePrice(value);

    if (parsed === null) {
      return;
    }

    const candidate = normalizeCandidateFromTotal(
      item,
      rawIndex,
      travelers,
      parsed,
      path
    );

    if (candidate) {
      candidates.push(candidate);
    }

    return;
  }

  if (Array.isArray(value)) {
    value.forEach(function (child, index) {
      findDeepTotalCandidates(
        child,
        rawIndex,
        travelers,
        item,
        path + '[' + index + ']',
        candidates
      );
    });

    return;
  }

  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(function ([key, child]) {
      const nextPath = path ? path + '.' + key : key;

      findDeepTotalCandidates(
        child,
        rawIndex,
        travelers,
        item,
        nextPath,
        candidates
      );
    });
  }
}

function dedupeCandidates(
  candidates: NormalizedFlightPrice[]
): NormalizedFlightPrice[] {
  const seen = new Set<string>();
  const result: NormalizedFlightPrice[] = [];

  for (const candidate of candidates) {
    const key =
      Math.round(candidate.pricePerPerson) +
      '|' +
      Math.round(candidate.totalPrice) +
      '|' +
      candidate.provider +
      '|' +
      candidate.pricePath;

    if (!seen.has(key)) {
      seen.add(key);
      result.push(candidate);
    }
  }

  return result;
}

function chooseBestCandidate(
  items: any[],
  travelers: number
): {
  selected: NormalizedFlightPrice | null;
  candidates: NormalizedFlightPrice[];
} {
  let allCandidates: NormalizedFlightPrice[] = [];

  items.forEach(function (item, index) {
    const explicitCandidates = findExplicitPriceCandidates(item, index, travelers);
    const deepTotalCandidates: NormalizedFlightPrice[] = [];

    findDeepTotalCandidates(
      item,
      index,
      travelers,
      item,
      'item',
      deepTotalCandidates
    );

    allCandidates = allCandidates.concat(explicitCandidates, deepTotalCandidates);
  });

  allCandidates = dedupeCandidates(allCandidates);

  allCandidates = allCandidates.filter(function (candidate) {
    return (
      candidate.pricePerPerson >= 100 &&
      candidate.pricePerPerson <= 10000 &&
      candidate.totalPrice >= candidate.pricePerPerson
    );
  });

  const roundTripCandidates = allCandidates.filter(function (candidate) {
    const item = items[candidate.rawIndex];

    return hasRoundTripSignal(item);
  });

  const usableCandidates =
    roundTripCandidates.length > 0 ? roundTripCandidates : allCandidates;

  usableCandidates.sort(function (a, b) {
    return a.pricePerPerson - b.pricePerPerson;
  });

  return {
    selected: usableCandidates.length > 0 ? usableCandidates[0] : null,
    candidates: usableCandidates.slice(0, 20),
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LiveFlightRequest;

    const token = process.env.APIFY_TOKEN;
    const actorId = process.env.APIFY_FLIGHT_ACTOR_ID;

    if (!token) {
      return NextResponse.json(
        {
          error: 'Missing APIFY_TOKEN in Vercel environment variables.',
        },
        { status: 500 }
      );
    }

    if (!actorId) {
      return NextResponse.json(
        {
          error: 'Missing APIFY_FLIGHT_ACTOR_ID in Vercel environment variables.',
        },
        { status: 500 }
      );
    }

    if (!body.origin || !body.destination || !body.outboundDate) {
      return NextResponse.json(
        {
          error: 'Missing required flight search fields.',
          received: body,
        },
        { status: 400 }
      );
    }

    const travelers = Math.max(1, Number(body.travelers) || 1);

    const input = {
      originAirport: body.origin.toUpperCase(),
      destinationAirport: body.destination.toUpperCase(),
      departureDate: body.outboundDate,
      returnDate: body.inboundDate,
      adults: travelers,
      cabinClass: 'ECONOMY',
      currency: 'EUR',
    };

    const apifyUrl =
      'https://api.apify.com/v2/acts/' +
      encodeURIComponent(actorId) +
      '/run-sync-get-dataset-items?token=' +
      encodeURIComponent(token);

    const response = await fetch(apifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const text = await response.text();

      return NextResponse.json(
        {
          error: 'Apify request failed.',
          status: response.status,
          input,
          details: text,
        },
        { status: 500 }
      );
    }

    const items = await response.json();

    if (!Array.isArray(items)) {
      return NextResponse.json(
        {
          error: 'Apify returned data, but it was not an array.',
          input,
          raw: items,
        },
        { status: 500 }
      );
    }

    if (items.length === 0) {
      return NextResponse.json(
        {
          error: 'Apify returned zero results.',
          input,
        },
        { status: 404 }
      );
    }

    const result = chooseBestCandidate(items, travelers);

    if (!result.selected) {
      return NextResponse.json(
        {
          error: 'Apify returned results, but no complete round-trip price was found.',
          input,
          rawCount: items.length,
          sample: items.slice(0, 3),
          candidates: result.candidates,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      pricePerPerson: Math.round(result.selected.pricePerPerson),
      totalFlightPrice: Math.round(result.selected.totalPrice),
      currency: result.selected.currency || 'EUR',
      source: 'apify',
      provider: result.selected.provider,
      title: result.selected.title,
      pricePath: result.selected.pricePath,
      fetchedAt: new Date().toISOString(),
      rawCount: items.length,
      input,
      candidates: result.candidates.map(function (candidate) {
        return {
          pricePerPerson: Math.round(candidate.pricePerPerson),
          totalPrice: Math.round(candidate.totalPrice),
          provider: candidate.provider,
          currency: candidate.currency,
          title: candidate.title,
          rawIndex: candidate.rawIndex,
          pricePath: candidate.pricePath,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unexpected error while fetching live flight price.',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
