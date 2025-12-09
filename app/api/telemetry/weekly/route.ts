import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { thingsboardService } from '@/lib/thingsboard';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');

    if (!deviceId) {
      return NextResponse.json(
        { error: 'Device ID is required' },
        { status: 400 }
      );
    }

    const keys = ['temperature', 'ph', 'dissolvedOxygen', 'salinity', 'turbidity'];
    const endTs = Date.now();
    const startTs = endTs - 7 * 24 * 60 * 60 * 1000; // 7 hari

    const history = await thingsboardService.getTelemetryHistory(
      deviceId,
      keys,
      startTs,
      endTs,
      2000 // Lebih banyak data untuk 7 hari
    );

    // Group data by day dan hitung rata-rata per hari
    const dailyAverages: Record<string, Record<string, number[]>> = {};
    
    for (const [key, values] of Object.entries(history)) {
      if (!Array.isArray(values)) continue;
      
      for (const item of values) {
        const date = new Date(item.ts);
        // Format date ke local timezone (Asia/Jakarta)
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dayKey = `${year}-${month}-${day}`;
        
        if (!dailyAverages[dayKey]) {
          dailyAverages[dayKey] = {};
        }
        
        if (!dailyAverages[dayKey][key]) {
          dailyAverages[dayKey][key] = [];
        }
        
        dailyAverages[dayKey][key].push(parseFloat(item.value));
      }
    }

    // Generate 7 hari terakhir (Senin - Minggu) dari hari ini
    const today = new Date();
    const currentDay = today.getDay(); // 0=Minggu, 1=Senin, dst
    
    // Hitung offset ke Senin minggu ini
    const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
    const mondayThisWeek = new Date(today);
    mondayThisWeek.setDate(today.getDate() - daysFromMonday);
    mondayThisWeek.setHours(0, 0, 0, 0);
    
    const chartData: Record<string, number[]> = {
      temperature: [],
      ph: [],
      dissolvedOxygen: [],
      salinity: [],
      turbidity: [],
    };
    
    const labels: string[] = [];
    
    // Day labels in Indonesian (Senin - Minggu)
    const dayNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    
    // Generate data untuk 7 hari (Senin - Minggu)
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(mondayThisWeek);
      currentDate.setDate(mondayThisWeek.getDate() + i);
      
      // Format ke local date string
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const dayKey = `${year}-${month}-${day}`;
      
      labels.push(dayNames[i]);
      
      for (const key of keys) {
        const values = dailyAverages[dayKey]?.[key] || [];
        if (values.length > 0) {
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          chartData[key].push(parseFloat(avg.toFixed(2)));
        } else {
          // Push null untuk hari tanpa data (Chart.js akan skip point ini)
          chartData[key].push(null as any);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        labels,
        datasets: [
          {
            label: 'Suhu (°C)',
            data: chartData.temperature,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'transparent',
            tension: 0.4,
            fill: false,
            spanGaps: false, // Jangan connect titik dengan gap
          },
          {
            label: 'pH',
            data: chartData.ph,
            borderColor: 'rgb(234, 179, 8)',
            backgroundColor: 'transparent',
            tension: 0.4,
            fill: false,
            spanGaps: false,
          },
          {
            label: 'Oksigen (mg/L)',
            data: chartData.dissolvedOxygen,
            borderColor: 'rgb(16, 185, 129)',
            backgroundColor: 'transparent',
            tension: 0.4,
            fill: false,
            spanGaps: false,
          },
          {
            label: 'Salinitas (ppt)',
            data: chartData.salinity,
            borderColor: 'rgb(6, 182, 212)',
            backgroundColor: 'transparent',
            tension: 0.4,
            fill: false,
            spanGaps: false,
          },
          {
            label: 'Turbidity (NTU)',
            data: chartData.turbidity,
            borderColor: 'rgb(245, 158, 11)',
            backgroundColor: 'transparent',
            tension: 0.4,
            fill: false,
            spanGaps: false,
          },
        ],
      },
      startTs,
      endTs,
    });
  } catch (error) {
    console.error('Weekly telemetry fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weekly telemetry' },
      { status: 500 }
    );
  }
}
