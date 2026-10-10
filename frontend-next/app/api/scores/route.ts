import { NextResponse } from 'next/server';

// Vercel Edge Cache: revalidate every 30 seconds to prevent API rate limits
export const revalidate = 30;

export async function GET() {
  try {
    // TODO: Replace this mock with a real API call (e.g., TheSportsDB, API-Football, SportRadar)
    // Example real call:
    // const res = await fetch(`https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${new Date().toISOString().split('T')[0]}&s=Soccer`);
    // const data = await res.json();
    
    // Mock data for testing the UI right now
    const mockScores = [
      { league: "PL", home: "Arsenal", away: "Chelsea", scoreHome: 1, scoreAway: 0, minute: "65" },
      { league: "LALIGA", home: "Real Madrid", away: "Barcelona", scoreHome: 2, scoreAway: 2, minute: "88" },
      { league: "UCL", home: "Bayern Munich", away: "PSG", scoreHome: 0, scoreAway: 1, minute: "34" },
      { league: "SERIEA", home: "Inter Milan", away: "Juventus", scoreHome: 1, scoreAway: 1, minute: "72" },
    ];

    return NextResponse.json({ matches: mockScores });
  } catch (error) {
    return NextResponse.json({ matches: [] }, { status: 500 });
  }
}
