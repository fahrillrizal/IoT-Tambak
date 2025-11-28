import { Skeleton } from "@/components/ui/skeleton";

export function ProfileSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 mb-20 lg:mb-0">
      {/* Back Button */}
      <Skeleton className="h-5 w-40 mb-6" />

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        {/* Header */}
        <Skeleton className="h-7 w-32 mb-2" />
        <Skeleton className="h-4 w-48 mb-8" />

        <div className="space-y-6">
          {/* Avatar */}
          <div className="flex justify-center mb-8">
            <Skeleton className="w-32 h-32 rounded-full" />
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={i === 5 ? "md:col-span-2" : ""}>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3 pt-4">
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}