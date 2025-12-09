import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
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

    // Cari pond dari device; jika tidak ada, kembalikan grafik kosong (no data)
    const device = await prisma.device.findUnique({
      where: { thingsboardDeviceId: deviceId },
      select: { pondId: true },
    });

    const labels: string[] = [];
    const dayNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

    if (!device) {
      for (let i = 0; i < 7; i++) labels.push(dayNames[i]);
      return NextResponse.json({
        success: true,
        data: {
          labels,
          datasets: [
            { label: 'Suhu (°C)', data: Array(7).fill(null) },
            { label: 'pH', data: Array(7).fill(null) },
            { label: 'Oksigen (mg/L)', data: Array(7).fill(null) },
            { label: 'Salinitas (ppt)', data: Array(7).fill(null) },
            { label: 'Turbidity (NTU)', data: Array(7).fill(null) },
          ],
          message: 'Device tidak ditemukan',
        },
      });
    }

    // Generate 7 hari terakhir (Senin - Minggu) dari hari ini
    const today = new Date();
    const currentDay = today.getDay();
    
    // Hitung offset ke Senin minggu ini
    const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
    const mondayThisWeek = new Date(today);
    mondayThisWeek.setDate(today.getDate() - daysFromMonday);
    mondayThisWeek.setHours(0, 0, 0, 0);

    const keys = ['temperature', 'ph', 'dissolvedOxygen', 'salinity', 'turbidity'];
    const chartData: Record<string, (number | null)[]> = {
      temperature: [],
      ph: [],
      dissolvedOxygen: [],
      salinity: [],
      turbidity: [],
    };

    // Loop untuk 7 hari
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(mondayThisWeek);
      currentDate.setDate(mondayThisWeek.getDate() + i);
      const dayKey = currentDate.toISOString().split('T')[0];
      const isToday = dayKey === today.toISOString().split('T')[0];

      labels.push(dayNames[i]);

      if (isToday) {
        // Untuk hari ini: ambil dari ThingsBoard (real-time), jika gagal -> null
        try {
          const endOfDay = new Date(today);
          endOfDay.setHours(23, 59, 59, 999);

          const history = await thingsboardService.getTelemetryHistory(
            deviceId,
            keys,
            currentDate.getTime(),
            endOfDay.getTime(),
            1000
          );

          for (const key of keys) {
            const values = history[key];
            if (Array.isArray(values) && values.length > 0) {
              const avg = values.reduce((sum, item) => sum + parseFloat(item.value), 0) / values.length;
              chartData[key].push(parseFloat(avg.toFixed(2)));
            } else {
              chartData[key].push(null);
            }
          }
        } catch (err) {
          console.error('ThingsBoard fetch failed for today:', err);
          keys.forEach((key) => chartData[key].push(null));
        }
      } else {
        // Untuk hari lain: ambil dari DB (daily summary)
        // Prisma expects a Date object for the 'date' field
        const summary = await prisma.dailySummary.findUnique({
          where: {
            pondId_date: {
              pondId: device.pondId,
              date: new Date(dayKey),
            },
          },
        });

        if (summary) {
          chartData.temperature.push(summary.avgTemperature as any);
          chartData.ph.push(summary.avgPh as any);
          chartData.dissolvedOxygen.push(summary.avgDissolvedOxygen as any);
          chartData.salinity.push(summary.avgSalinity as any);
          chartData.turbidity.push(summary.avgTurbidity as any);
        } else {
          // Jika tidak ada data di DB, tampilkan null (tidak fetch ThingsBoard untuk hari lampau)
          chartData.temperature.push(null);
          chartData.ph.push(null);
          chartData.dissolvedOxygen.push(null);
          chartData.salinity.push(null);
          chartData.turbidity.push(null);
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
            spanGaps: false,
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
    });
  } catch (error) {
    console.error('Weekly telemetry fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weekly telemetry' },
      { status: 500 }
    );
  }
}
