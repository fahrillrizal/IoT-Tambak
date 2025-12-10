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
    const pondId = searchParams.get("pondId");
    const days = parseInt(searchParams.get("days") || "7");

    if (!pondId) {
      return NextResponse.json(
        { error: "Pond ID is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify user has access to this pond
    const pond = await prisma.pond.findFirst({
      where: {
        id: parseInt(pondId),
        userId: user.id,
      },
    });

    if (!pond) {
      return NextResponse.json(
        { error: "Pond not found or access denied" },
        { status: 404 }
      );
    }

    // Get daily summaries for the last N days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const summaries = await prisma.dailySummary.findMany({
      where: {
        pondId: parseInt(pondId),
        date: {
          gte: startDate,
        },
      },
      orderBy: {
        date: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      data: summaries,
    });
  } catch (error) {
    console.error("Error fetching daily summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch daily summary" },
      { status: 500 }
    );
  }
}
