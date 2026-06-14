import { NextResponse } from 'next/server';

const ROUTE_VERSION = 'live-flight-route-v6-bestprice-correct-input';

type LiveFlightRequest = {
  origin: string;
  destination: string;
  outboundDate: string;
  inboundDate: string;
  travelers: number;
};

type ApifyFlightItem = {
  airline?: string;
  bestPrice?: number | string;
  prices?: {
    cached?: number | string;
    googleFlights?: number | string;
    kiwi?: number | string;
    travelpayouts?: number | string;
    ryanair?: number | string;
    easyjet?: number | string;
    wizzair?: number | string;
    norwegian?: number | string;
    [key: string]: unknown;
  };
  duration?: string;
  stops?: number;
  from?: {
    airport?: string;
  };
  to?: {
    airport?: string;
  };
  baggage?: unknown;
  links?: {
    googleFlights?: string | null;
    kiwi?: string | null;
    book?: string | null;
    [key: string]: unknown;
  };
  departDate?: string;
  returnDate?: string;
  [key: string]: unknown;
};

function parsePrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value.replace(/[^\d.,]/g, '').replace(',', '.');
  const number = Number(cleaned);

  if (Number.isFinite(number) && number > 0) {
    return number;
  }

  return null;
}

function normalizeAirport(value: string) {
  return value.trim().toUpperCase();
}

function findBestPricePerPerson(items: ApifyFlightItem[]): {
  pricePerPerson: number | null;
  selectedItem: ApifyFlightItem | null;
  priceSource: string;
} {
  let bestPrice: number | null = null;
  let selectedItem: ApifyFlightItem | null = null;
  let priceSource = '';

  items.forEach(function (item) {
    const candidates: { value: number; source: string }[] = [];

    const itemBestPrice = parsePrice(item.bestPrice);

    if (itemBestPrice !== null) {
      candidates.push({
        value: itemBestPrice,
        source: 'bestPrice',
      });
    }

    if (item.prices && typeof item.prices === 'object') {
      Object.entries(item.prices).forEach(function ([key, value]) {
        const parsed = parsePrice(value);

        if (parsed !== null) {
          candidates.push({
            value: parsed,
            source: 'prices.' + key,
          });
        }
      });
    }

    candidates.forEach(function (candidate) {
      if (candidate.value < 50 || candidate.value > 10000) {
        return;
      }

      if (bestPrice === null || candidate.value < bestPrice) {
        bestPrice = candidate.value;
        selectedItem = item;
        priceSource = candidate.source;
      }
    });
  });

  return {
    pricePerPerson: bestPrice,
    selectedItem,
    priceSource,
  };
}

function validateReturnedRoute(
  item: ApifyFlightItem | null,
  origin: string,
  destination: string,
  outboundDate: string
) {
  if (!item) {
    return {
      valid: false,
      reason: 'No selected flight item was returned.',
    };
  }

  const returnedOrigin = normalizeAirport(item.from?.airport || '');
  const returnedDestination = normalizeAirport(item.to?.airport || '');
  const returnedDate = String(item.departDate || '');

  if (returnedOrigin && returnedOrigin !== origin) {
    return {
      valid: false,
      reason:
        'Apify returned the wrong origin. Expected ' +
        origin +
        ', got ' +
        returnedOrigin +
        '.',
    };
  }

  if (returnedDestination && returnedDestination !== destination) {
    return {
      valid: false,
      reason:
        'Apify returned the wrong destination. Expected ' +
        destination +
        ', got ' +
        returnedDestination +
        '.',
    };
  }

  if (returnedDate && returnedDate !== outboundDate) {
    return {
      valid: false,
      reason:
        'Apify returned the wrong departure date. Expected ' +
        outboundDate +
        ', got ' +
        returnedDate +
        '.',
    };
  }

  return {
    valid: true,
    reason: '',
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
          routeVersion: ROUTE_VERSION,
        },
        { status: 500 }
      );
    }

    if (!actorId) {
      return NextResponse.json(
        {
          error: 'Missing APIFY_FLIGHT_ACTOR_ID in Vercel environment variables.',
          routeVersion: ROUTE_VERSION,
        },
        { status: 500 }
      );
    }

    if (!body.origin || !body.destination || !body.outboundDate) {
      return NextResponse.json(
        {
          error: 'Missing required flight search fields.',
          received: body,
          routeVersion: ROUTE_VERSION,
        },
        { status: 400 }
      );
    }

    const travelers = Math.max(1, Number(body.travelers) || 1);
    const origin = normalizeAirport(body.origin);
    const destination = normalizeAirport(body.destination);

    const input = {
      origin: origin,
      destination: destination,
      departDate: body.outboundDate,
      returnDate: body.inboundDate || '',
      adults: travelers,
      cabinClass: 'ECONOMY',
      currency: 'EUR',
      maxFlights: 20,
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
          routeVersion: ROUTE_VERSION,
        },
        { status: 500 }
      );
    }

    const items = (await response.json()) as ApifyFlightItem[];

    if (!Array.isArray(items)) {
      return NextResponse.json(
        {
          error: 'Apify returned data, but it was not an array.',
          input,
          raw: items,
          routeVersion: ROUTE_VERSION,
        },
        { status: 500 }
      );
    }

    if (items.length === 0) {
      return NextResponse.json(
        {
          error: 'Apify returned zero results.',
          input,
          routeVersion: ROUTE_VERSION,
        },
        { status: 404 }
      );
    }

    const result = findBestPricePerPerson(items);

    if (!result.pricePerPerson || !result.selectedItem) {
      return NextResponse.json(
        {
          error: 'Apify returned results, but no usable bestPrice was found.',
          input,
          rawCount: items.length,
          sample: items.slice(0, 3),
          routeVersion: ROUTE_VERSION,
        },
        { status: 404 }
      );
    }

    const routeValidation = validateReturnedRoute(
      result.selectedItem,
      origin,
      destination,
      body.outboundDate
    );

    if (!routeValidation.valid) {
      return NextResponse.json(
        {
          error: routeValidation.reason,
          input,
          rawCount: items.length,
          selectedItem: result.selectedItem,
          sample: items.slice(0, 3),
          routeVersion: ROUTE_VERSION,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      pricePerPerson: Math.round(result.pricePerPerson),
      totalFlightPrice: Math.round(result.pricePerPerson * travelers),
      currency: 'EUR',
      source: 'apify',
      provider: result.selectedItem.airline || 'Apify flight scraper',
      pricePath: result.priceSource,
      fetchedAt: new Date().toISOString(),
      rawCount: items.length,
      input,
      selectedItem: result.selectedItem,
      routeVersion: ROUTE_VERSION,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unexpected error while fetching live flight price.',
        details: error instanceof Error ? error.message : String(error),
        routeVersion: ROUTE_VERSION,
      },
      { status: 500 }
    );
  }
}
