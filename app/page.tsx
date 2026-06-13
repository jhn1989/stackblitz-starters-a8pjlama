'use client';

import { useState } from 'react';
import { themes } from '../lib/destinations';
import type { Destination, Theme } from '../lib/destinations';
import { demoFlight, calculateTrip, fmt } from '../lib/pricing';

type Step = 1 | 2 | 3 | 4;
type SortBy = 'price-asc' | 'price-desc' | 'name';
type FlightSort = 'best' | 'cheapest' | 'fastest';
type StopsFilter = 'any' | 'direct' | '1stop';

function toYYMMDD(d: string) {
  if (!d) return '';
  const parts = d.split('-');
  return parts[0].slice(2) + parts[1] + parts[2];
}

function buildSkyscannerUrl(
  origin: string,
  destCode: string,
  start: string,
  end: string,
  travelers: number,
  flightSort: FlightSort,
  stopsFilter: StopsFilter
) {
  const o = (origin || 'CPH').toLowerCase();
  const de = (destCode || '').toLowerCase();
  let path = 'https://www.skyscanner.net/transport/flights/' + o + '/' + de + '/';
  const out = toYYMMDD(start);
  const inb = toYYMMDD(end);
  if (out) { path = path + out + '/'; }
  if (inb) { path = path + inb + '/'; }
  const params = new URLSearchParams();
  params.set('adults', String(travelers));
  params.set('currency', 'EUR');
  params.set('locale', 'en-GB');
  if (flightSort !== 'best') { params.set('sort', flightSort); }
  if (stopsFilter === 'direct') { params.set('preferdirects', 'true'); params.set('stops', '0'); }
  if (stopsFilter === '1stop') { params.set('stops', '1'); }
  return path + '?' + params.toString();
}

function buildBookingUrl(
  city: string,
  country: string,
  start: string,
  end: string,
  travelers: number
) {
  const params = new URLSearchParams();
  params.set('ss', city + ', ' + country);
  if (start) { params.set('checkin', start); }
  if (end) { params.set('checkout', end); }
  params.set('group_adults', String(travelers));
  params.set('no_rooms', '1');
  params.set('group_children', '0');
  return 'https://www.booking.com/searchresults.html?' + params.toString();
}

function getEstimate(
  selectedDest: Destination | null,
  origin: string,
  startDate: string,
  endDate: string,
  travelers: number
) {
  if (!selectedDest) { return null; }
  const flight = demoFlight(origin || 'CPH', selectedDest, startDate);
  const trip = calculateTrip(selectedDest, flight, startDate, endDate, travelers);
  return { flight: flight, trip: trip };
}

function getSortedDestinations(
  selectedTheme: Theme | null,
  sortBy: SortBy,
  origin: string,
  startDate: string,
  endDate: string,
  travelers: number
) {
  if (!selectedTheme) { return []; }
  const list = selectedTheme.destinations.slice();
  list.sort(function (a, b) {
    if (sortBy === 'name') { return a.city.localeCompare(b.city); }
    const f1 = demoFlight(origin || 'CPH', a, startDate);
    const f2 = demoFlight(origin || 'CPH', b, startDate);
    const ta = calculateTrip(a, f1, startDate, endDate, travelers).total;
    const tb = calculateTrip(b, f2, startDate, endDate, travelers).total;
    if (sortBy === 'price-asc') { return ta - tb; }
    return tb - ta;
  });
  return list;
}

function Flag(props: { code: string; size?: number }) {
  const size = props.size || 32;
  const w = size;
  const h = Math.round(size * 0.75);
  const url = 'https://flagcdn.com/' + w + 'x' + h + '/' + props.code + '.png';
  return (
    <img
      src={url}
      alt=""
      style={{ width: w, height: h, borderRadius: 3, objectFit: 'cover', display: 'block' }}
    />
  );
}

export default function Home() {
  const [step, setStep] = useState<Step>(1);
  const [origin, setOrigin] = useState('CPH');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [travelers, setTravelers] = useState(2);
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [selectedDest, setSelectedDest] = useState<Destination | null>(null);
  const [dateError, setDateError] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('price-asc');
  const [flightSort, setFlightSort] = useState<FlightSort>('best');
  const [stopsFilter, setStopsFilter] = useState<StopsFilter>('any');

  const today = new Date().toISOString().split('T')[0];
  const estimate = getEstimate(selectedDest, origin, startDate, endDate, travelers);
  const sorted = getSortedDestinations(selectedTheme, sortBy, origin, startDate, endDate, travelers);

  function goStep2() {
    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      setDateError('Return date must be after departure date.');
      return;
    }
    setDateError('');
    setStep(2);
  }

  function goStep3() {
    setSelectedDest(null);
    setStep(3);
  }

  function goStep4() {
    setStep(4);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <main style={{ minHeight: '100vh', background: '#F8F7F4' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #E8E6DF', padding: '0 24px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', height: 60 }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: '#1a1a1a', letterSpacing: '-0.3px' }}>
            ✈ ThemeTrip
          </span>
          <span style={{ marginLeft: 12, fontSize: 13, color: '#888', background: '#F0EFEA', padding: '3px 10px', borderRadius: 20 }}>
            Beta
          </span>
        </div>
      </header>

      {step > 1 && (
        <div style={{ background: '#fff', borderBottom: '1px solid #E8E6DF' }}>
          <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px', display: 'flex' }}>
            {['Trip details', 'Choose theme', 'Pick destination', 'Your estimate'].map(function (label, i) {
              const stepNum = (i + 1) as Step;
              const active = step === stepNum;
              const done = step > stepNum;
              return (
                <button
                  key={label}
                  onClick={function () { if (done) { setStep(stepNum); } }}
                  style={{ flex: 1, padding: '14px 8px', background: 'none', border: 'none', borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent', fontSize: 13, fontWeight: active ? 500 : 400, color: active ? 'var(--accent)' : done ? '#555' : '#aaa', cursor: done ? 'pointer' : 'default', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                >
                  {done ? '✓ ' : ''}{label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 1 && (
        <div style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 50%, #2563EB 100%)', padding: '80px 0 0', overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', top: -60, right: -60, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ position: 'absolute', bottom: 40, left: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
          <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px', position: 'relative' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '6px 14px', marginBottom: 24 }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>✨ 120 destinations across 6 themes</span>
            </div>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 52, fontWeight: 400, color: '#fff', lineHeight: 1.15, marginBottom: 16, maxWidth: 620 }}>
              Find your perfect trip - with a real cost estimate
            </h1>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.8)', marginBottom: 48, maxWidth: 500, lineHeight: 1.6 }}>
              Pick a travel theme, choose a destination, and instantly see a full breakdown of flights, hotels, food and activities.
            </p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 32, flexWrap: 'wrap' }}>
              {[
                { city: 'Santorini', flag: 'gr', price: '€2,100' },
                { city: 'Lisbon', flag: 'pt', price: '€890' },
                { city: 'Reykjavik', flag: 'is', price: '€3,200' },
                { city: 'Budapest', flag: 'hu', price: '€760' },
                { city: 'Bangkok', flag: 'th', price: '€1,800' },
              ].map(function (d) {
                return (
                  <div key={d.city} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Flag code={d.flag} size={24} />
                    <span style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{d.city}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{d.price}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 960, margin: '0 auto', padding: step === 1 ? '48px 24px 40px' : '40px 24px' }}>

        {step === 1 && (
          <div>
            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #E8E6DF', padding: '32px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', marginBottom: 48 }}>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 400, marginBottom: 24, color: '#1a1a1a' }}>
                Where are you flying from?
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 6, fontWeight: 500 }}>Departure airport</label>
                  <input type="text" value={origin} onChange={function (e) { setOrigin(e.target.value.toUpperCase()); }} placeholder="e.g. CPH" maxLength={4} style={{ textTransform: 'uppercase' }} />
                  <p style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>3-letter IATA code</p>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 6, fontWeight: 500 }}>Travelers</label>
                  <input type="number" value={travelers} onChange={function (e) { setTravelers(Math.max(1, parseInt(e.target.value) || 1)); }} min={1} max={10} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 8 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 6, fontWeight: 500 }}>Departure date</label>
                  <input type="date" value={startDate} onChange={function (e) { setStartDate(e.target.value); }} min={today} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 6, fontWeight: 500 }}>Return date</label>
                  <input type="date" value={endDate} onChange={function (e) { setEndDate(e.target.value); }} min={startDate || today} />
                </div>
              </div>
              {dateError !== '' && (
                <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{dateError}</p>
              )}
              <button onClick={goStep2} style={{ width: '100%', marginTop: 24, padding: '15px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 500 }}>
                Choose a travel theme
              </button>
            </div>

            <div style={{ marginBottom: 48 }}>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 400, marginBottom: 8, color: '#1a1a1a' }}>How it works</h2>
              <p style={{ color: '#888', fontSize: 15, marginBottom: 28 }}>Plan your trip in 4 simple steps.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                {[
                  { step: '1', icon: '✈️', title: 'Enter your details', desc: 'Tell us your airport, dates and how many travelers.' },
                  { step: '2', icon: '🎨', title: 'Pick a theme', desc: 'Beach, city, nature, culture, food or adventure.' },
                  { step: '3', icon: '🗺️', title: 'Choose destination', desc: 'Browse 20 options per theme with estimated costs.' },
                  { step: '4', icon: '💶', title: 'Get your estimate', desc: 'See a full breakdown and search live flights and hotels.' },
                ].map(function (item) {
                  return (
                    <div key={item.step} style={{ background: '#fff', border: '1px solid #E8E6DF', borderRadius: 16, padding: '20px' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{item.step}</div>
                      <div style={{ fontSize: 22, marginBottom: 8 }}>{item.icon}</div>
                      <div style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a', marginBottom: 6 }}>{item.title}</div>
                      <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>{item.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 400, marginBottom: 8, color: '#1a1a1a' }}>6 travel themes</h2>
              <p style={{ color: '#888', fontSize: 15, marginBottom: 28 }}>Whatever mood you are in, we have destinations for it.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                {themes.map(function (theme) {
                  return (
                    <button key={theme.id} onClick={function () { setSelectedTheme(theme); goStep2(); }} style={{ padding: '18px 14px', background: '#fff', border: '1px solid #E8E6DF', borderRadius: 14, textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}>
                      <div style={{ fontSize: 26, marginBottom: 8 }}>{theme.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{theme.name}</div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>{theme.destinations.length} destinations</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 400, marginBottom: 8 }}>What kind of trip?</h1>
            <p style={{ color: '#666', fontSize: 15, marginBottom: 32 }}>Pick a theme that fits your mood.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14, marginBottom: 32 }}>
              {themes.map(function (theme) {
                const isSel = selectedTheme ? selectedTheme.id === theme.id : false;
                return (
                  <button key={theme.id} onClick={function () { setSelectedTheme(theme); }} style={{ padding: '20px 22px', background: isSel ? 'var(--accent-light)' : '#fff', border: isSel ? '2px solid var(--accent)' : '1px solid #E2E0D8', borderRadius: 14, textAlign: 'left', transition: 'all 0.15s' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{theme.icon}</div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: '#1a1a1a', marginBottom: 4 }}>{theme.name}</div>
                    <div style={{ fontSize: 13, color: '#888' }}>{theme.desc}</div>
                    <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>{theme.destinations.length} destinations</div>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={function () { setStep(1); }} style={{ padding: '12px 20px', background: '#fff', border: '1px solid #E2E0D8', borderRadius: 10, fontSize: 14, color: '#555' }}>Back</button>
              <button onClick={goStep3} disabled={!selectedTheme} style={{ flex: 1, padding: '12px', background: selectedTheme ? 'var(--accent)' : '#E2E0D8', color: selectedTheme ? '#fff' : '#aaa', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 500, cursor: selectedTheme ? 'pointer' : 'not-allowed' }}>
                See destinations
              </button>
            </div>
          </div>
        )}

        {step === 3 && selectedTheme && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent-light)', color: 'var(--accent)', fontSize: 13, fontWeight: 500, padding: '5px 12px', borderRadius: 20 }}>
                {selectedTheme.icon} {selectedTheme.name}
              </span>
            </div>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 400, marginBottom: 8 }}>Pick a destination</h1>
            <p style={{ color: '#666', fontSize: 15, marginBottom: 20 }}>Estimated total cost shown per trip.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
              <label htmlFor="sortBy" style={{ fontSize: 13, color: '#555', fontWeight: 500 }}>Sort by</label>
              <select id="sortBy" value={sortBy} onChange={function (e) { setSortBy(e.target.value as SortBy); }} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #E2E0D8', background: '#fff', fontSize: 14, color: '#1a1a1a', cursor: 'pointer' }}>
                <option value="price-asc">Price: cheapest first</option>
                <option value="price-desc">Price: most expensive first</option>
                <option value="name">Name: A-Z</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 32 }}>
              {sorted.map(function (dest) {
                const fl = demoFlight(origin || 'CPH', dest, startDate);
                const est = calculateTrip(dest, fl, startDate, endDate, travelers);
                const isSelected = selectedDest ? selectedDest.city === dest.city : false;
                const badgeBg = dest.costLevel === 'budget' ? '#D1FAE5' : dest.costLevel === 'mid' ? '#FEF3C7' : '#FCE7F3';
                const badgeColor = dest.costLevel === 'budget' ? '#065F46' : dest.costLevel === 'mid' ? '#92400E' : '#831843';
                const badgeText = dest.costLevel === 'budget' ? '💚 Budget' : dest.costLevel === 'mid' ? '🟡 Mid-range' : '💎 Premium';
                return (
                  <button key={dest.city} onClick={function () { setSelectedDest(dest); }} style={{ padding: '18px 20px', background: isSelected ? 'var(--accent-light)' : '#fff', border: isSelected ? '2px solid var(--accent)' : '1px solid #E2E0D8', borderRadius: 14, textAlign: 'left', transition: 'all 0.15s' }}>
                    <div style={{ marginBottom: 10 }}><Flag code={dest.flag} size={36} /></div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: '#1a1a1a' }}>{dest.city}</div>
                    <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>{dest.country}</div>
                    <div style={{ fontSize: 13, color: '#777', marginBottom: 10, lineHeight: 1.4 }}>{dest.description}</div>
                    <div style={{ display: 'inline-block', fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: badgeBg, color: badgeColor, marginBottom: 8 }}>{badgeText}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginTop: 4 }}>~{fmt(est.total)} total</div>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={function () { setStep(2); }} style={{ padding: '12px 20px', background: '#fff', border: '1px solid #E2E0D8', borderRadius: 10, fontSize: 14, color: '#555' }}>Back</button>
              <button onClick={goStep4} disabled={!selectedDest} style={{ flex: 1, padding: '12px', background: selectedDest ? 'var(--accent)' : '#E2E0D8', color: selectedDest ? '#fff' : '#aaa', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 500, cursor: selectedDest ? 'pointer' : 'not-allowed' }}>
                See full cost breakdown
              </button>
            </div>
          </div>
        )}

        {step === 4 && selectedDest && estimate && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 10 }}><Flag code={selectedDest.flag} size={48} /></div>
              <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 400, marginTop: 8, marginBottom: 4 }}>
                {selectedDest.city}, {selectedDest.country}
              </h1>
              <p style={{ color: '#666', fontSize: 15 }}>{selectedDest.description}</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
              {[
                '✈️ From ' + (origin || 'CPH'),
                startDate ? '📅 ' + startDate + (endDate ? ' to ' + endDate : '') : '📅 Dates not set',
                '👤 ' + estimate.trip.travelers + ' traveler' + (estimate.trip.travelers > 1 ? 's' : ''),
                '🌙 ' + estimate.trip.nights + ' night' + (estimate.trip.nights > 1 ? 's' : ''),
              ].map(function (pill) {
                return (
                  <span key={pill} style={{ fontSize: 13, padding: '5px 12px', background: '#EEECEA', borderRadius: 20, color: '#444' }}>{pill}</span>
                );
              })}
            </div>
            <div style={{ background: 'var(--accent)', borderRadius: 16, padding: '24px 28px', marginBottom: 20, color: '#fff' }}>
              <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 4 }}>Estimated total cost</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 48, lineHeight: 1 }}>{fmt(estimate.trip.total)}</div>
              <div style={{ fontSize: 13, opacity: 0.7, marginTop: 8 }}>{fmt(Math.round(estimate.trip.total / estimate.trip.travelers))} per person, prices are estimates</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E8E6DF', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#1a1a1a' }}>Cost breakdown</h2>
              {[
                { label: '✈️ Flights (' + estimate.trip.travelers + 'x ' + fmt(estimate.flight.price) + ')', value: estimate.trip.flightTotal },
                { label: '🏨 Hotel (' + estimate.trip.nights + ' nights)', value: estimate.trip.hotelTotal },
                { label: '🍽️ Food and drink', value: estimate.trip.foodTotal },
                { label: '🚌 Local transport', value: estimate.trip.transportTotal },
                { label: '🎟️ Activities', value: estimate.trip.activitiesTotal },
                { label: '🛡️ Safety buffer (8%)', value: estimate.trip.safetyBuffer },
              ].map(function (row) {
                return (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F0EEE8', fontSize: 14 }}>
                    <span style={{ color: '#555' }}>{row.label}</span>
                    <span style={{ fontWeight: 500, color: '#1a1a1a' }}>{fmt(row.value)}</span>
                  </div>
                );
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0 0', fontSize: 16, fontWeight: 600 }}>
                <span>Total</span>
                <span style={{ color: 'var(--accent)' }}>{fmt(estimate.trip.total)}</span>
              </div>
            </div>
            <div style={{ background: '#FEF9EC', border: '1px solid #FDE68A', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
                <strong>How we calculate this:</strong> Flight prices are sample estimates based on typical routes, not real quotes. Hotel, food and transport costs are researched averages for each destination. Use this as a rough planning guide, then search live prices below.
              </p>
            </div>

            <div style={{ background: '#fff', border: '1px solid #E8E6DF', borderRadius: 12, padding: '16px 18px', marginBottom: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 12 }}>Flight preferences for Skyscanner</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>Sort results by</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {([['best', 'Best'], ['cheapest', 'Cheapest'], ['fastest', 'Fastest']] as [FlightSort, string][]).map(function (opt) {
                      const active = flightSort === opt[0];
                      return (
                        <button key={opt[0]} onClick={function () { setFlightSort(opt[0]); }} style={{ flex: 1, padding: '8px', borderRadius: 8, border: active ? '2px solid var(--accent)' : '1px solid #E2E0D8', background: active ? 'var(--accent-light)' : '#fff', color: active ? 'var(--accent)' : '#555', fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer' }}>
                          {opt[1]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>Stops</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {([['any', 'Any stops'], ['direct', 'Direct only'], ['1stop', '1 stop max']] as [StopsFilter, string][]).map(function (opt) {
                      const active = stopsFilter === opt[0];
                      return (
                        <button key={opt[0]} onClick={function () { setStopsFilter(opt[0]); }} style={{ flex: 1, padding: '8px', borderRadius: 8, border: active ? '2px solid var(--accent)' : '1px solid #E2E0D8', background: active ? 'var(--accent-light)' : '#fff', color: active ? 'var(--accent)' : '#555', fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer' }}>
                          {opt[1]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              <a href={buildSkyscannerUrl(origin || 'CPH', selectedDest.airportCode, startDate, endDate, travelers, flightSort, stopsFilter)} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textAlign: 'center', padding: '14px', background: '#0770E3', color: '#fff', borderRadius: 12, fontSize: 15, fontWeight: 500, textDecoration: 'none' }}>
                ✈️ Search flights on Skyscanner
              </a>
              <a href={buildBookingUrl(selectedDest.city, selectedDest.country, startDate, endDate, travelers)} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textAlign: 'center', padding: '14px', background: '#003580', color: '#fff', borderRadius: 12, fontSize: 15, fontWeight: 500, textDecoration: 'none' }}>
                🏨 Find hotels on Booking.com
              </a>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={function () { setStep(3); }} style={{ flex: 1, padding: '12px', background: '#fff', border: '1px solid #E2E0D8', borderRadius: 10, fontSize: 14, color: '#555' }}>
                Change destination
              </button>
              <button onClick={function () { setStep(1); setSelectedTheme(null); setSelectedDest(null); }} style={{ flex: 1, padding: '12px', background: '#fff', border: '1px solid #E2E0D8', borderRadius: 10, fontSize: 14, color: '#555' }}>
                Start over
              </button>
            </div>
          </div>
        )}
      </div>

      <footer style={{ borderTop: '1px solid #E8E6DF', padding: '24px', textAlign: 'center', fontSize: 13, color: '#aaa', marginTop: 40 }}>
        ThemeTrip - Prices are estimates only. Always verify before booking.
      </footer>
    </main>
  );
}
