import { NextResponse } from 'next/server';

type LiveFlightRequest = {
  origin: string;
  destination: string;
  outboundDate: string;
  inboundDate: string;
  travelers: number;
};

type PriceCandidate = {
  value: number;
  path: string;
};

function parsePriceValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const hasCurrencySymbol =
    trimmed.includes('€') ||
    trimmed.includes('$') ||
    trimmed.includes('£') ||
    trimmed.toLowerCase().includes('eur') ||
    trimmed.toLowerCase().includes('usd') ||
    trimmed.toLowerCase().includes('gbp');

  const hasPriceLikeNumber = /\d/.test(trimmed);

  if (!hasPriceLikeNumber) {
    return null;
  }

  let cleaned = trimmed.replace(/[^\d.,]/g, '');

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

  if (!hasCurrencySymbol && parsed < 20) {
    return null;
  }

  return parsed;
}

function isPricePath(path: string): boolean {
  const lower = path.toLowerCase();

  return (
    lower.includes('price') ||
    lower.includes('amount') ||
    lower.includes('fare') ||
    lower.includes('cost') ||
    lower.includes('total')
  );
}

function collectPriceCandidates(
  value: unknown,
  path: string,
  results: PriceCandidate[]
) {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    if (isPricePath(path)) {
      const parsed = parsePriceValue(value);

      if (parsed !== null) {
        results.push({
          value: parsed,
          path,
        });
      }
    }

    return;
  }

  if (Array.isArray(value)) {
    value.forEach(function (item, index) {
      collectPriceCandidates(item, path + '[' + index + ']', results);
    });

    return;
  }

  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(function ([key, item]) {
      const nextPath = path ? path + '.' + key : key;
      collectPriceCandidates(item, nextPath, results);
    });
  }
}

function findBestPricePerPerson(items: unknown[], travelers: number): {
  pricePerPerson: number | null;
  debugCandidates: PriceCandidate[];
} {
  const candidates: PriceCandidate[] = [];

  collectPriceCandidates(items, 'items', candidates);

  const filtered = candidates.filter(function (candidate) {
    return candidate.value >= 20 && candidate.value <= 20000;
  });

  if (filtered.length === 0) {
    return {
      pricePerPerson: null,
      debugCandidates: candidates.slice(0, 20),
    };
  }

  const perPersonCandidates = filtered.filter(function (candidate) {
    const lower = candidate.path.toLowerCase();

    return (
      lower.includes('perperson') ||
      lower.includes('per_person') ||
      lower.includes('per-passenger') ||
      lower.includes('perpassenger') ||
      lower.includes('adult') ||
      lower.endsWith('.price') ||
      lower.endsWith('.amount') ||
      lower.endsWith('.value')
    );
  });

  const totalCandidates = filtered.filter(function (candidate) {
    const lower = candidate.path.toLowerCase();

    return (
      lower.includes('total') ||
      lower.includes('totalprice') ||
      lower.includes('total_price') ||
      lower.includes('grandtotal')
    );
  });

  if (perPersonCandidates.length > 0) {
    const lowestPerPerson = perPersonCandidates.reduce(function (lowest, current) {
      return current.value < lowest.value ? current : lowest;
    });

    return {
      pricePerPerson: lowestPerPerson.value,
      debugCandidates: filtered.slice(0, 20),
    };
  }

  if (totalCandidates.length > 0) {
    const lowestTotal = totalCandidates.reduce(function (lowest, current) {
      return current.value < lowest.value ? current : lowest;
    });

    return {
      pricePerPerson: lowestTotal.value / Math.max(1, travelers),
      debugCandidates: filtered.slice(0, 20),
    };
  }

  const lowest = filtered.reduce(function (lowestCandidate, currentCandidate) {
    return currentCandidate.value < lowestCandidate.value
      ? currentCandidate
      : lowestCandidate;
  });

  return {
    pricePerPerson: lowest.value,
    debugCandidates: filtered.slice(0, 20),
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

    const result = findBestPricePerPerson(items, travelers);

    if (!result.pricePerPerson) {
      return NextResponse.json(
        {
          error: 'Apify returned results, but no usable price field was found.',
          input,
          rawCount: items.length,
          sample: items.slice(0, 3),
          debugCandidates: result.debugCandidates,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      pricePerPerson: Math.round(result.pricePerPerson),
      totalFlightPrice: Math.round(result.pricePerPerson * travelers),
      currency: 'EUR',
      source: 'apify',
      fetchedAt: new Date().toISOString(),
      rawCount: items.length,
      input,
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
