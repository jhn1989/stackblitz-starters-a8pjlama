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

function collectPriceCandidates(
  value: unknown,
  path: string,
  results: PriceCandidate[]
) {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const lowerPath = path.toLowerCase();

    const looksLikePrice =
      lowerPath.includes('price') ||
      lowerPath.includes('amount') ||
      lowerPath.includes('fare') ||
      lowerPath.includes('cost') ||
      lowerPath.includes('total');

    if (!looksLikePrice) {
      return;
    }

    const parsed = parsePrice(value);

    if (parsed !== null) {
      results.push({
        value: parsed,
        path,
      });
    }

    return;
  }

  if (Array.isArray(value)) {
    value.forEach(function (child, index) {
      collectPriceCandidates(child, path + '[' + index + ']', results);
    });

    return;
  }

  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(function ([key, child]) {
      const nextPath = path ? path + '.' + key : key;
      collectPriceCandidates(child, nextPath, results);
    });
  }
}

function getBestPricePerPerson(
  items: unknown[],
  travelers: number
): {
  pricePerPerson: number | null;
  totalPrice: number | null;
  pricePath: string;
  candidates: PriceCandidate[];
} {
  const candidates: PriceCandidate[] = [];

  collectPriceCandidates(items, 'items', candidates);

  const validCandidates = candidates.filter(function (candidate) {
    return candidate.value >= 100 && candidate.value <= 20000;
  });

  if (validCandidates.length === 0) {
    return {
      pricePerPerson: null,
      totalPrice: null,
      pricePath: '',
      candidates: candidates.slice(0, 30),
    };
  }

  const totalCandidates = validCandidates.filter(function (candidate) {
    const path = candidate.path.toLowerCase();

    return (
      path.includes('totalprice') ||
      path.includes('total_price') ||
      path.includes('totalamount') ||
      path.includes('total_amount') ||
      path.endsWith('.total') ||
      path.includes('.total.')
    );
  });

  const perPersonCandidates = validCandidates.filter(function (candidate) {
    const path = candidate.path.toLowerCase();

    return (
      path.includes('priceperperson') ||
      path.includes('price_per_person') ||
      path.includes('perperson') ||
      path.includes('per_person') ||
      path.includes('adultprice') ||
      path.includes('adult_price')
    );
  });

  if (totalCandidates.length > 0) {
    totalCandidates.sort(function (a, b) {
      return a.value - b.value;
    });

    const selected = totalCandidates[0];

    return {
      pricePerPerson: selected.value / Math.max(1, travelers),
      totalPrice: selected.value,
      pricePath: selected.path,
      candidates: validCandidates.slice(0, 30),
    };
  }

  if (perPersonCandidates.length > 0) {
    perPersonCandidates.sort(function (a, b) {
      return a.value - b.value;
    });

    const selected = perPersonCandidates[0];

    return {
      pricePerPerson: selected.value,
      totalPrice: selected.value * Math.max(1, travelers),
      pricePath: selected.path,
      candidates: validCandidates.slice(0, 30),
    };
  }

  validCandidates.sort(function (a, b) {
    return a.value - b.value;
  });

  const selected = validCandidates[0];

  return {
    pricePerPerson: selected.value,
    totalPrice: selected.value * Math.max(1, travelers),
    pricePath: selected.path,
    candidates: validCandidates.slice(0, 30),
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

    const result = getBestPricePerPerson(items, travelers);

    if (!result.pricePerPerson || !result.totalPrice) {
      return NextResponse.json(
        {
          error: 'Apify returned results, but no usable flight price was found.',
          input,
          rawCount: items.length,
          sample: items.slice(0, 3),
          candidates: result.candidates,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      pricePerPerson: Math.round(result.pricePerPerson),
      totalFlightPrice: Math.round(result.totalPrice),
      currency: 'EUR',
      source: 'apify',
      provider: 'Apify flight scraper',
      pricePath: result.pricePath,
      fetchedAt: new Date().toISOString(),
      rawCount: items.length,
      input,
      candidates: result.candidates.map(function (candidate) {
        return {
          value: Math.round(candidate.value),
          path: candidate.path,
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
