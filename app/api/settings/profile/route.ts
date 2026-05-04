import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { profileUpdateSchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: Number(session.user.id) },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        image: true,
        phone: true,
        provinceId: true,
        cityId: true,
        address: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (e: any) {
    console.error("Get profile error", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json();
    const parsed = profileUpdateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (data.username !== undefined && data.username !== "") {
      const existingUser = await prisma.user.findFirst({
        where: {
          username: data.username,
          NOT: { id: Number(session.user.id) },
        },
      });
      if (existingUser) {
        return NextResponse.json(
          { error: "Username already taken" },
          { status: 400 }
        );
      }
    }

    const updatePayload: any = {};
    if (data.username !== undefined && data.username !== "")
      updatePayload.username = data.username;
    if (data.name !== undefined && data.name !== "")
      updatePayload.name = data.name;
    if (data.phone !== undefined && data.phone !== "")
      updatePayload.phone = data.phone;
    if (data.provinceId !== undefined)
      updatePayload.provinceId = data.provinceId;
    if (data.cityId !== undefined) updatePayload.cityId = data.cityId;
    if (data.address !== undefined) updatePayload.address = data.address;
    if (data.image !== undefined && data.image !== "")
      updatePayload.image = data.image;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ message: "No changes" });
    }

    const user = await prisma.user.update({
      where: { id: Number(session.user.id) },
      data: updatePayload,
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        image: true,
        phone: true,
        provinceId: true,
        cityId: true,
        address: true,
      },
    });

    return NextResponse.json({ message: "Profile updated successfully", user });
  } catch (e: any) {
    console.error("Profile update error", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
