import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Static dummy data for feeding schedules
  const schedules = [
    { id: 1, time: '06:00', amount: 2, status: 'completed' },
    { id: 2, time: '12:00', amount: 2.5, status: 'completed' },
    { id: 3, time: '18:00', amount: 2, status: 'pending' },
  ];
  return NextResponse.json({ success: true, data: schedules });
}
