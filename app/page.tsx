import { NextResponse } from 'next/server';

type LiveFlightRequest = {
  origin: string;
  destination: string;
  outboundDate: string;
  inboundDate: string;
  travelers: number;
};

function parsePrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.,]/g, '').replace(',', '.');
    const number = Number(cleaned);

    if (Number.isFinite(number) && number > 0) {
      return number;
    }
  }

  return null;
}

function findPricePerPerson(item: any, travelers: number): number | null {
  const perPersonFields = [
    item.pricePerPerson,
    item.price_per_person,
    item.perPersonPrice,
    item.price,
    item.priceAmount,
    item.amount,
    item.value,
    item.cheapestPrice,
  ];

  for (const field of perPersonFields) {
    const price = parsePrice(field);

    if (price) {
      return price;
    }
  }

  const totalFields = [
    item.totalPrice,
    item.total_price,
    item.totalAmount,
    item.priceTotal,
    item.price_total,
  ];

  for (const field of totalFields) {
    const total = parsePrice(field);

    if (total) {
      return total / Math.max(1, travelers);
    }
  }

  if (item.price && typeof item.price === 'object') {
    const nestedPerPersonFields = [
      item.price.amount,
      item.price.value,
      item.price.raw,
      item.price.formatted,
      item.price.pricePerPerson,
    ];

    for (const field of nestedPerPersonFields) {
      const price = parsePrice(field);

      if (price) {
        return price;
      }
    }

    const nestedTotalFields = [
      item.price.total,
      item.price.totalAmount,
      item.price.totalPrice,
    ];

    for (const field of nestedTotalFields) {
      const total = parsePrice(field);

      if (total) {
        return total / Math.max(1, travelers);
      }
    }
  }

  return null;
}

function getLowestPricePerPerson(items: any[], travelers: number): number | null {
  let lowest: number | null = null;

  for (const item of items) {
    const pricePerPerson = findPricePerPerson(item, travelers);

    if (pricePerPerson && pricePerPerson > 0) {
      if (lowest === null || pricePerPerson < lowest) {
        lowest = pricePerPerson;
      }
    }
  }

  return lowest;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LiveFlightRequest;

    const token = process.env.APIFY_TOKEN;
    const actorId = process.env.APIFY_FLIGHT_ACTOR_ID;

    if (!token || !actorId) {
      return NextResponse.json(
        {
          error: 'Missing APIFY_TOKEN or APIFY_FLIGHT_ACTOR_ID in environment variables.',
        },
        { status: 500 }
      );
    }

    const input = {
      origin: body.origin,
      destination: body.destination,
      outboundDate: body.outboundDate,
      inboundDate: body.inboundDate,
      adults: Math.max(1, body.travelers),
      travelers: Math.max(1, body.travelers),
      cabinClass: 'economy',
      cabinclass: 'economy',
      currency: 'EUR',
      market: 'DK',
      locale: 'en-GB',
      sortBy: 'cheapest',
      sortby: 'cheapest',
    };

    const response = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify(input),
      }
    );

    if (!response.ok) {
      const text = await response.text();

      return NextResponse.json(
        {
          error: 'Apify request failed.',
          status: response.status,
          details: text,
        },
        { status: 500 }
      );
    }

    const items = await response.json();

    if (!Array.isArray(items)) {
      return NextResponse.json(
        {
          error: 'Apify result was not an array.',
          raw: items,
        },
        { status: 500 }
      );
    }

    const pricePerPerson = getLowestPricePerPerson(items, Math.max(1, body.travelers));

    if (!pricePerPerson) {
      return NextResponse.json(
        {
          error: 'No usable flight price found in Apify result.',
          rawCount: items.length,
          sample: items.slice(0, 3),
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      pricePerPerson: Math.round(pricePerPerson),
      totalFlightPrice: Math.round(pricePerPerson * Math.max(1, body.travelers)),
      currency: 'EUR',
      source: 'apify',
      fetchedAt: new Date().toISOString(),
      rawCount: items.length,
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
