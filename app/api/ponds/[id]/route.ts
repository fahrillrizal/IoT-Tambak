import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const pondId = parseInt(id);

    if (isNaN(pondId)) {
      return NextResponse.json({ error: "Invalid pond ID" }, { status: 400 });
    }

    const pond = await prisma.pond.findFirst({
      where: { id: pondId, userId: user.id },
    });

    if (!pond) {
      return NextResponse.json({ error: "Pond not found" }, { status: 404 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if ("name" in body && body.name) {
      updateData.name = String(body.name).trim();
    }

    if ("stockingDate" in body) {
      updateData.stockingDate = body.stockingDate ? new Date(body.stockingDate) : null;
      // Auto-calculate shrimpAgeDays from stockingDate
      if (body.stockingDate) {
        const stDate = new Date(body.stockingDate);
        const today = new Date();
        const diffDays = Math.floor(
          (today.getTime() - stDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        updateData.shrimpAgeDays = Math.max(0, diffDays);
      } else {
        updateData.shrimpAgeDays = 0;
      }
    }

    if ("pondSize" in body) {
      updateData.pondSize = body.pondSize ? parseFloat(body.pondSize) : null;
    }

    if ("waterVolume" in body) {
      updateData.waterVolume = body.waterVolume ? parseFloat(body.waterVolume) : null;
    }

    if ("biomass" in body) {
      updateData.biomass = body.biomass ? parseFloat(body.biomass) : null;
    }

    if ("shrimpAgeDays" in body) {
      updateData.shrimpAgeDays = body.shrimpAgeDays ? parseInt(body.shrimpAgeDays) : 0;
    }

    const updated = await prisma.pond.update({
      where: { id: pondId },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Pond update error:", error);
    return NextResponse.json(
      { error: "Failed to update pond" },
      { status: 500 }
    );
  }
}
