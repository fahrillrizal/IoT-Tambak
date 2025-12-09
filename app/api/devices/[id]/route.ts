import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const device = await prisma.device.findFirst({
      where: {
        id: parseInt(id),
        pond: {
          userId: user.id,
        },
      },
      include: {
        pond: {
          select: { id: true, name: true },
        },
      },
    });

    if (!device) {
      return NextResponse.json(
        { error: "Device not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: device.id,
        name: device.name,
        thingsboardDeviceId: device.thingsboardDeviceId,
        deviceToken: device.deviceToken,
        deviceType: device.deviceType,
        pondId: device.pond.id,
        pondName: device.pond.name,
        createdAt: device.createdAt,
        updatedAt: device.updatedAt,
      },
    });
  } catch (error) {
    console.error("Device fetch error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch device",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const device = await prisma.device.findFirst({
      where: {
        id: parseInt(id),
        pond: {
          userId: user.id,
        },
      },
    });

    if (!device) {
      return NextResponse.json(
        { error: "Device not found or access denied" },
        { status: 404 }
      );
    }

    const deletedDevice = await prisma.device.update({
      where: { id: parseInt(id) },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Device "${device.name}" has been deleted`,
      data: {
        id: deletedDevice.id,
        name: deletedDevice.name,
      },
    });
  } catch (error) {
    console.error("Device delete error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete device",
      },
      { status: 500 }
    );
  }
}
