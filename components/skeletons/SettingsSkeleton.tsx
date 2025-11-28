import { Skeleton } from "@/components/ui/skeleton";

export function SettingsSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 mb-20 lg:mb-0">
      {/* Header */}
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Card */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex flex-col items-center">
            <Skeleton className="w-24 h-24 rounded-full mb-4" />
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-4 w-48 mb-4" />
            <Skeleton className="h-4 w-56 mb-4" />
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
        </div>

        {/* Security Card */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>

          {/* Password Section */}
          <div className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3 bg-gray-50">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-4 w-12" />
          </div>

          {/* Google Section */}
          <div className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3 bg-gray-50">
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}