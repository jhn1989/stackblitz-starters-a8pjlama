import { NextResponse } from 'next/server';

const ROUTE_VERSION = 'live-flight-route-v10-total-price-provider-link';

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
  cheapestSource?: string;
  sourcesFound?: string[];
  currency?: string;
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
  origin?: string;
  destination?: string;
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

function addSearchParamsToUrl(
  url: string,
  travelers: number,
  currency: string
): string {
  if (!url || !url.trim()) {
    return '';
  }

  try {
    const parsedUrl = new URL(url);

    parsedUrl.searchParams.set('adults', String(Math.max(1, travelers)));
    parsedUrl.searchParams.set('children', '0');
    parsedUrl.searchParams.set('infants', '0');
    parsedUrl.searchParams.set('currency', currency || 'EUR');
    parsedUrl.searchParams.set('sortBy', 'price');
    parsedUrl.searchParams.set('sort', 'price');

    return parsedUrl.toString();
  } catch {
    return url;
  }
}

function getBestProviderLink(
  item: ApifyFlightItem | null,
  travelers: number
): string {
  if (!item || !item.links) {
    return '';
  }

  const currency = item.currency || 'EUR';
  const cheapestSource = String(item.cheapestSource || '').toLowerCase();

  if (cheapestSource && item.links[cheapestSource]) {
    const link = item.links[cheapestSource];

    if (typeof link === 'string' && link.trim()) {
      return addSearchParamsToUrl(link, travelers, currency);
    }
  }

  if (typeof item.links.kiwi === 'string' && item.links.kiwi.trim()) {
    return addSearchParamsToUrl(item.links.kiwi, travelers, currency);
  }

  if (typeof item.links.book === 'string' && item.links.book.trim()) {
    return addSearchParamsToUrl(item.links.book, travelers, currency);
  }

  if (
    typeof item.links.googleFlights === 'string' &&
    item.links.googleFlights.trim()
  ) {
    return addSearchParamsToUrl(item.links.googleFlights, travelers, currency);
  }

  return '';
}

function findBestTotalFlightPrice(items: ApifyFlightItem[]): {
  totalFlightPrice: number | null;
  selectedItem: ApifyFlightItem | null;
  priceSource: string;
} {
  let bestTotalPrice: number | null = null;
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
      if (candidate.value < 50 || candidate.value > 50000) {
        return;
      }

      if (bestTotalPrice === null || candidate.value < bestTotalPrice) {
        bestTotalPrice = candidate.value;
        selectedItem = item;
        priceSource = candidate.source;
      }
    });
  });

  return {
    totalFlightPrice: bestTotalPrice,
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

  const returnedOrigin = normalizeAirport(
    item.from?.airport || item.origin || ''
  );

  const returnedDestination = normalizeAirport(
    item.to?.airport || item.destination || ''
  );

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

export async function GET() {
  return NextResponse.json({
    ok: true,
    routeVersion: ROUTE_VERSION,
    message:
      'This is the active live-flight API route. Apify bestPrice is treated as total flight price.',
  });
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

    const result = findBestTotalFlightPrice(items);

    if (!result.totalFlightPrice || !result.selectedItem) {
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

    const providerLink = getBestProviderLink(result.selectedItem, travelers);
    const totalFlightPrice = Math.round(result.totalFlightPrice);
    const pricePerPerson = Math.round(totalFlightPrice / travelers);

    return NextResponse.json({
      pricePerPerson: pricePerPerson,
      totalFlightPrice: totalFlightPrice,
      currency: result.selectedItem.currency || 'EUR',
      source: 'apify',
      provider:
        result.selectedItem.cheapestSource ||
        result.selectedItem.airline ||
        'Cheapest provider',
      cheapestSource:
        result.selectedItem.cheapestSource ||
        result.priceSource ||
        'bestPrice',
      providerLink: providerLink,
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
