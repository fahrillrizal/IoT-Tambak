import { NextRequest, NextResponse } from 'next/server';
import { saveHourlySummaryForLastHour } from '@/lib/hourly-summary-scheduler';

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await saveHourlySummaryForLastHour();

    return NextResponse.json({
      success: true,
      message: 'Hourly summary saved successfully',
    });
  } catch (error) {
    console.error('Hourly cron job error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
