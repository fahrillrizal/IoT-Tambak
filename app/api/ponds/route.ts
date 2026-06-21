import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const ponds = await prisma.pond.findMany({
      where: { userId: user.id, isActive: true },
      select: {
        id: true,
        name: true,
        pondSize: true,
        waterVolume: true,
        shrimpAgeDays: true,
        population: true,
        biomass: true,
        stockingDate: true,
        thingsboardDeviceId: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { devices: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: ponds,
    });
  } catch (error) {
    console.error("Ponds fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch ponds" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      name,
      pondSize,
      waterVolume,
      shrimpAgeDays,
      biomass,
      stockingDate,
    } = body;

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "Pond name is required" },
        { status: 400 }
      );
    }

    const pond = await prisma.pond.create({
      data: {
        userId: user.id,
        name: name.trim(),
        pondSize: pondSize ? parseFloat(pondSize) : null,
        waterVolume: waterVolume ? parseFloat(waterVolume) : null,
        shrimpAgeDays: shrimpAgeDays ? parseInt(shrimpAgeDays) : 0,
        biomass: biomass ? parseFloat(biomass) : null,
        stockingDate: stockingDate ? new Date(stockingDate) : null,
      },
    });

    return NextResponse.json({
      success: true,
      data: pond,
    });
  } catch (error) {
    console.error("Pond creation error:", error);
    return NextResponse.json(
      { error: "Failed to create pond" },
      { status: 500 }
    );
  }
}
