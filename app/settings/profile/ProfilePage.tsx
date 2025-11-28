"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ProfileSkeleton } from "@/components/skeletons/ProfileSkeleton";
import ImageCropModal from "@/components/ImageCropModal";
import { ArrowLeft, Pencil, X } from "lucide-react";

interface Province {
  id: string;
  name: string;
}

interface City {
  id: string;
  id_provinsi: string;
  name: string;
}

interface ProfileFormState {
  username: string;
  name: string;
  phone: string;
  provinceId: string;
  cityId: string;
  address: string;
  image: string;
}

interface ProfilePageProps {
  defaultCollapsed?: boolean;
}

export default function ProfilePage({ defaultCollapsed = false }: ProfilePageProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [initial, setInitial] = useState<ProfileFormState | null>(null);
  const [form, setForm] = useState<ProfileFormState>({
    username: "",
    name: "",
    phone: "",
    provinceId: "",
    cityId: "",
    address: "",
    image: "",
  });
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // Fetch profile data from API (not session) to get all fields
  useEffect(() => {
    const fetchProfile = async () => {
      if (status !== "authenticated") return;
      setLoadingProfile(true);
      try {
        const res = await fetch("/api/settings/profile");
        if (res.ok) {
          const user = await res.json();
          const snap: ProfileFormState = {
            username: user.username || "",
            name: user.name || "",
            phone: user.phone || "",
            provinceId: user.provinceId?.toString() || "",
            cityId: user.cityId?.toString() || "",
            address: user.address || "",
            image: user.image || "",
          };
          setInitial(snap);
          setForm(snap);
          // Load cities if provinceId exists
          if (user.provinceId) {
            loadCities(user.provinceId.toString());
          }
        }
      } catch (e) {
        console.error("Failed to fetch profile");
      } finally {
        setLoadingProfile(false);
      }
    };
    fetchProfile();
  }, [status]);

  useEffect(() => {
    loadProvinces();
  }, []);

  useEffect(() => {
    if (form.provinceId && initial?.provinceId !== form.provinceId) {
      loadCities(form.provinceId);
    } else if (!form.provinceId) {
      setCities([]);
    }
  }, [form.provinceId]);

  const loadProvinces = async () => {
    setLoadingProvinces(true);
    try {
      const res = await fetch(
        "https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json"
      );
      const data = await res.json();
      setProvinces(data);
    } catch (e) {
      console.error("Failed to load provinces");
    } finally {
      setLoadingProvinces(false);
    }
  };

  const loadCities = async (provinceId: string) => {
    setLoadingCities(true);
    try {
      const res = await fetch(
        `https://www.emsifa.com/api-wilayah-indonesia/api/regencies/${provinceId}.json`
      );
      const data = await res.json();
      setCities(data);
    } catch (e) {
      console.error("Failed to load cities");
      setCities([]);
    } finally {
      setLoadingCities(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setForm((prev) => {
      const updated = { ...prev, [name]: value };
      // Reset cityId if province changes
      if (name === "provinceId" && value !== prev.provinceId) {
        updated.cityId = "";
      }
      return updated;
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create object URL for preview
    const imageUrl = URL.createObjectURL(file);
    setSelectedImageUrl(imageUrl);
    setShowCropModal(true);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCropComplete = async (croppedImageBlob: Blob) => {
    setShowCropModal(false);
    setUploading(true);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", croppedImageBlob, "profile.jpg");
      formData.append(
        "upload_preset",
        process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || ""
      );

      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      if (!cloudName) {
        setError("Cloudinary belum dikonfigurasi");
        setUploading(false);
        return;
      }

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await res.json();

      if (data.secure_url) {
        setForm((prev) => ({ ...prev, image: data.secure_url }));
        setMessage("Foto profil berhasil diperbarui");

        // Update session to reflect new image immediately
        await fetch("/api/auth/session?update", { method: "GET" });
        // Trigger session reload
        const event = new Event("visibilitychange");
        document.dispatchEvent(event);
      } else {
        setError("Upload gagal: " + (data.error?.message || "Unknown error"));
      }
    } catch (err: any) {
      setError("Upload gagal: " + err.message);
    } finally {
      setUploading(false);
      if (selectedImageUrl) {
        URL.revokeObjectURL(selectedImageUrl);
        setSelectedImageUrl(null);
      }
    }
  };

  const handleCropCancel = () => {
    setShowCropModal(false);
    if (selectedImageUrl) {
      URL.revokeObjectURL(selectedImageUrl);
      setSelectedImageUrl(null);
    }
  };

  const hasChanges =
    initial &&
    Object.keys(form).some(
      (key) => (form as any)[key] !== (initial as any)[key]
    );

  const handleReset = () => {
    if (initial) setForm(initial);
    setMessage(null);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload: any = {};
      if (!initial) return;
      (Object.keys(form) as (keyof ProfileFormState)[]).forEach((key) => {
        if (form[key] !== (initial as any)[key]) {
          if (key === "provinceId" || key === "cityId") {
            payload[key] = form[key] ? Number(form[key]) : undefined;
          } else {
            payload[key] = form[key];
          }
        }
      });

      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Gagal menyimpan"
        );
      } else {
        setMessage(data.message || "Profil tersimpan");
        const newSnap: ProfileFormState = {
          username:
            payload.username !== undefined ? payload.username : form.username,
          name: payload.name !== undefined ? payload.name : form.name,
          phone: payload.phone !== undefined ? payload.phone : form.phone,
          provinceId:
            payload.provinceId !== undefined
              ? String(payload.provinceId)
              : form.provinceId,
          cityId:
            payload.cityId !== undefined ? String(payload.cityId) : form.cityId,
          address:
            payload.address !== undefined ? payload.address : form.address,
          image: payload.image !== undefined ? payload.image : form.image,
        };
        setInitial(newSnap);

        // Update session to reflect new data immediately
        await fetch("/api/auth/session?update", { method: "GET" });
        // Trigger session reload
        const event = new Event("visibilitychange");
        document.dispatchEvent(event);
      }
    } catch (e: any) {
      setError("Terjadi kesalahan");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || loadingProfile) {
    return (
      <DashboardLayout activeMenu="settings" defaultCollapsed={defaultCollapsed}>
        <ProfileSkeleton />
      </DashboardLayout>
    );
  }
  if (!session) return null;

  return (
    <DashboardLayout activeMenu="settings" defaultCollapsed={defaultCollapsed}>
      <div className="max-w-3xl mx-auto px-4 py-6 mb-20 lg:mb-0">
        <button
          onClick={() => router.push("/settings")}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm font-medium">Kembali ke Pengaturan</span>
        </button>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold mb-2 text-gray-900">Edit Profil</h1>
          <p className="text-sm text-gray-500 mb-8">
            Perbarui informasi akun Anda.
          </p>

          <div className="space-y-6">
            {/* Avatar Section */}
            <div className="flex justify-center mb-8">
              <div className="relative">
                <div
                  className="w-32 h-32 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center text-gray-600 cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => form.image && setShowImageModal(true)}
                  title={form.image ? "Klik untuk melihat" : ""}
                >
                  {form.image ? (
                    <img
                      src={form.image}
                      alt="avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl font-semibold">
                      {session.user.email?.[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute bottom-0 right-0 w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white hover:bg-blue-700 transition-colors shadow-lg disabled:opacity-50"
                  title="Edit foto"
                >
                  <Pencil className="w-5 h-5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  disabled={uploading}
                  className="hidden"
                />
              </div>
            </div>
            {uploading && (
              <p className="text-sm text-gray-500 text-center">
                Uploading gambar...
              </p>
            )}

            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={session.user.email || ""}
                  disabled
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
                  placeholder="Email tidak dapat diubah"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <input
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Masukkan username"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nama Lengkap
                </label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Masukkan nama lengkap"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nomor Telepon
                </label>
                <input
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="08xxxxxxxxxx"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Provinsi
                </label>
                <select
                  name="provinceId"
                  value={form.provinceId}
                  onChange={handleChange}
                  disabled={loadingProvinces}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                >
                  <option value="">Pilih Provinsi</option>
                  {provinces.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kota/Kabupaten
                </label>
                <select
                  name="cityId"
                  value={form.cityId}
                  onChange={handleChange}
                  disabled={!form.provinceId || loadingCities}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                >
                  <option value="">Pilih Kota/Kabupaten</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Alamat Lengkap
                </label>
                <textarea
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="Masukkan alamat lengkap"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4">
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Menyimpan..." : "Save"}
              </button>
              <button
                onClick={handleReset}
                disabled={!hasChanges || saving}
                className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 disabled:opacity-50 transition-colors"
              >
                Reset
              </button>
            </div>

            {/* Messages */}
            {message && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-600">{message}</p>
              </div>
            )}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image View Modal */}
      {showImageModal && form.image && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setShowImageModal(false)}
        >
          <div className="relative max-w-5xl w-full">
            <button
              onClick={() => setShowImageModal(false)}
              className="absolute -top-14 right-0 flex items-center gap-2 text-white hover:text-gray-300 transition-colors px-4 py-2 rounded-lg hover:bg-white/10"
            >
              <X className="h-5 w-5" />
              <span className="text-sm font-medium">Tutup</span>
            </button>
            <div className="bg-white rounded-lg p-2">
              <img
                src={form.image}
                alt="Profile preview"
                className="w-full h-auto max-h-[80vh] object-contain rounded"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        </div>
      )}

      {/* Image Crop Modal */}
      {showCropModal && selectedImageUrl && (
        <ImageCropModal
          imageUrl={selectedImageUrl}
          onCancel={handleCropCancel}
          onComplete={handleCropComplete}
        />
      )}
    </DashboardLayout>
  );
}
