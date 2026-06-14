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

function isTotalPricePath(path: string): boolean {
  const lower = path.toLowerCase();

  return (
    lower.includes('totalprice') ||
    lower.includes('total_price') ||
    lower.includes('totalamount') ||
    lower.includes('total_amount') ||
    lower.includes('pricetotal') ||
    lower.includes('price_total') ||
    lower.includes('grandtotal') ||
    lower.includes('grand_total') ||
    lower.includes('amounttotal') ||
    lower.includes('amount_total') ||
    lower.endsWith('.total') ||
    lower.includes('.total.')
  );
}

function isPerPersonPricePath(path: string): boolean {
  const lower = path.toLowerCase();

  return (
    lower.includes('priceperperson') ||
    lower.includes('price_per_person') ||
    lower.includes('perpersonprice') ||
    lower.includes('per_person_price') ||
    lower.includes('peradult') ||
    lower.includes('per_adult') ||
    lower.includes('adultprice') ||
    lower.includes('adult_price') ||
    lower.includes('passengerprice') ||
    lower.includes('passenger_price')
  );
}

function collectCandidates(
  value: unknown,
  path: string,
  totalCandidates: PriceCandidate[],
  perPersonCandidates: PriceCandidate[]
) {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = parsePrice(value);

    if (parsed === null) {
      return;
    }

    if (isTotalPricePath(path)) {
      totalCandidates.push({
        value: parsed,
        path,
      });
    }

    if (isPerPersonPricePath(path)) {
      perPersonCandidates.push({
        value: parsed,
        path,
      });
    }

    return;
  }

  if (Array.isArray(value)) {
    value.forEach(function (child, index) {
      collectCandidates(
        child,
        path + '[' + index + ']',
        totalCandidates,
        perPersonCandidates
      );
    });

    return;
  }

  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(function ([key, child]) {
      const nextPath = path ? path + '.' + key : key;

      collectCandidates(
        child,
        nextPath,
        totalCandidates,
        perPersonCandidates
      );
    });
  }
}

function findBestPrice(
  items: unknown[],
  travelers: number
): {
  pricePerPerson: number | null;
  totalFlightPrice: number | null;
  pricePath: string;
  totalCandidates: PriceCandidate[];
  perPersonCandidates: PriceCandidate[];
} {
  const totalCandidates: PriceCandidate[] = [];
  const perPersonCandidates: PriceCandidate[] = [];

  collectCandidates(items, 'items', totalCandidates, perPersonCandidates);

  const minimumTotal = travelers * 100;
  const maximumTotal = travelers * 10000;

  const validTotalCandidates = totalCandidates
    .filter(function (candidate) {
      return candidate.value >= minimumTotal && candidate.value <= maximumTotal;
    })
    .sort(function (a, b) {
      return a.value - b.value;
    });

  if (validTotalCandidates.length > 0) {
    const selected = validTotalCandidates[0];

    return {
      pricePerPerson: selected.value / travelers,
      totalFlightPrice: selected.value,
      pricePath: selected.path,
      totalCandidates: validTotalCandidates.slice(0, 20),
      perPersonCandidates: perPersonCandidates.slice(0, 20),
    };
  }

  const minimumPerPerson = 100;
  const maximumPerPerson = 10000;

  const validPerPersonCandidates = perPersonCandidates
    .filter(function (candidate) {
      return candidate.value >= minimumPerPerson && candidate.value <= maximumPerPerson;
    })
    .sort(function (a, b) {
      return a.value - b.value;
    });

  if (validPerPersonCandidates.length > 0) {
    const selected = validPerPersonCandidates[0];

    return {
      pricePerPerson: selected.value,
      totalFlightPrice: selected.value * travelers,
      pricePath: selected.path,
      totalCandidates: totalCandidates.slice(0, 20),
      perPersonCandidates: validPerPersonCandidates.slice(0, 20),
    };
  }

  return {
    pricePerPerson: null,
    totalFlightPrice: null,
    pricePath: '',
    totalCandidates: totalCandidates.slice(0, 20),
    perPersonCandidates: perPersonCandidates.slice(0, 20),
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

    const result = findBestPrice(items, travelers);

    if (!result.pricePerPerson || !result.totalFlightPrice) {
      return NextResponse.json(
        {
          error:
            'Apify returned results, but no full total price field was found. The app refused to use generic price fields because they can be partial prices.',
          input,
          rawCount: items.length,
          totalCandidates: result.totalCandidates,
          perPersonCandidates: result.perPersonCandidates,
          sample: items.slice(0, 2),
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      pricePerPerson: Math.round(result.pricePerPerson),
      totalFlightPrice: Math.round(result.totalFlightPrice),
      currency: 'EUR',
      source: 'apify',
      provider: 'Apify flight scraper',
      pricePath: result.pricePath,
      fetchedAt: new Date().toISOString(),
      rawCount: items.length,
      input,
      totalCandidates: result.totalCandidates.map(function (candidate) {
        return {
          value: Math.round(candidate.value),
          path: candidate.path,
        };
      }),
      perPersonCandidates: result.perPersonCandidates.map(function (candidate) {
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
