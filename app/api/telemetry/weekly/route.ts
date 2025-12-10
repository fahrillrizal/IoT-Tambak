import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const pondIdParam = searchParams.get("pondId");
    const deviceId = searchParams.get("deviceId");

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let pondId: number | null = null;

    if (pondIdParam) {
      const parsedPondId = parseInt(pondIdParam);

      if (!isNaN(parsedPondId)) {
        const pond = await prisma.pond.findFirst({
          where: {
            id: parsedPondId,
            userId: user.id,
          },
        });

        if (pond) {
          pondId = pond.id;
        }
      } else {
        const device = await prisma.device.findFirst({
          where: {
            thingsboardDeviceId: pondIdParam,
            OR: [
              { pond: { userId: user.id } },
              { userDevices: { some: { userId: user.id } } },
            ],
          },
          select: { pondId: true },
        });

        pondId = device?.pondId || null;
      }
    } else if (deviceId) {
      const device = await prisma.device.findFirst({
        where: {
          thingsboardDeviceId: deviceId,
          OR: [
            { pond: { userId: user.id } },
            { userDevices: { some: { userId: user.id } } },
          ],
        },
        select: { pondId: true },
      });

      pondId = device?.pondId || null;
    }

    const labels: string[] = [];
    const dayNames = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

    if (!pondId) {
      for (let i = 0; i < 7; i++) labels.push(dayNames[i]);
      return NextResponse.json({
        success: true,
        data: {
          labels,
          datasets: [
            { label: "Suhu (°C)", data: Array(7).fill(null) },
            { label: "pH", data: Array(7).fill(null) },
            { label: "Oksigen (mg/L)", data: Array(7).fill(null) },
            { label: "Salinitas (ppt)", data: Array(7).fill(null) },
            { label: "Turbidity (NTU)", data: Array(7).fill(null) },
          ],
          message: "Data tidak ditemukan",
        },
      });
    }

    const today = new Date();
    const currentDay = today.getDay();
    const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
    const mondayThisWeek = new Date(today);
    mondayThisWeek.setDate(today.getDate() - daysFromMonday);
    mondayThisWeek.setHours(0, 0, 0, 0);

    const sundayThisWeek = new Date(mondayThisWeek);
    sundayThisWeek.setDate(mondayThisWeek.getDate() + 6);
    sundayThisWeek.setHours(23, 59, 59, 999);

    const summaries = await prisma.dailySummary.findMany({
      where: {
        pondId: pondId,
        date: {
          gte: mondayThisWeek,
          lte: sundayThisWeek,
        },
      },
      orderBy: { date: "asc" },
    });

    const summaryMap = new Map<string, (typeof summaries)[0]>();
    for (const s of summaries) {
      const dateKey = s.date.toISOString().split("T")[0];
      summaryMap.set(dateKey, s);
    }

    const chartData: Record<string, (number | null)[]> = {
      temperature: [],
      ph: [],
      dissolvedOxygen: [],
      salinity: [],
      turbidity: [],
    };

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(mondayThisWeek);
      currentDate.setDate(mondayThisWeek.getDate() + i);
      const dayKey = currentDate.toISOString().split("T")[0];

      labels.push(dayNames[i]);

      const summary = summaryMap.get(dayKey);

      if (summary) {
        chartData.temperature.push(Number(summary.avgTemperature));
        chartData.ph.push(Number(summary.avgPh));
        chartData.dissolvedOxygen.push(Number(summary.avgDissolvedOxygen));
        chartData.salinity.push(Number(summary.avgSalinity));
        chartData.turbidity.push(Number(summary.avgTurbidity));
      } else {
        chartData.temperature.push(null);
        chartData.ph.push(null);
        chartData.dissolvedOxygen.push(null);
        chartData.salinity.push(null);
        chartData.turbidity.push(null);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        labels,
        datasets: [
          {
            label: "Suhu (°C)",
            data: chartData.temperature,
            borderColor: "rgb(59, 130, 246)",
            backgroundColor: "transparent",
            tension: 0.4,
            fill: false,
            spanGaps: true,
          },
          {
            label: "pH",
            data: chartData.ph,
            borderColor: "rgb(234, 179, 8)",
            backgroundColor: "transparent",
            tension: 0.4,
            fill: false,
            spanGaps: true,
          },
          {
            label: "Oksigen (mg/L)",
            data: chartData.dissolvedOxygen,
            borderColor: "rgb(16, 185, 129)",
            backgroundColor: "transparent",
            tension: 0.4,
            fill: false,
            spanGaps: true,
          },
          {
            label: "Salinitas (ppt)",
            data: chartData.salinity,
            borderColor: "rgb(6, 182, 212)",
            backgroundColor: "transparent",
            tension: 0.4,
            fill: false,
            spanGaps: true,
          },
          {
            label: "Turbidity (NTU)",
            data: chartData.turbidity,
            borderColor: "rgb(245, 158, 11)",
            backgroundColor: "transparent",
            tension: 0.4,
            fill: false,
            spanGaps: true,
          },
        ],
      },
    });
  } catch (error) {
    console.error("Weekly telemetry fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch weekly telemetry" },
      { status: 500 }
    );
  }
}
