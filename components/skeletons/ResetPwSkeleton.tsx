import { Skeleton } from "@/components/ui/skeleton";

export function PasswordSettingsSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 mb-20 lg:mb-0">
      {/* Back Button */}
      <Skeleton className="h-5 w-40 mb-6" />

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        {/* Header */}
        <Skeleton className="h-7 w-36 mb-2" />
        <Skeleton className="h-4 w-72 mb-6" />

        <div className="space-y-5">
          {/* Form Fields */}
          {[...Array(3)].map((_, i) => (
            <div key={i}>
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-10 w-full" />
              {i === 1 && <Skeleton className="h-3 w-64 mt-1" />}
            </div>
          ))}

          {/* Button */}
          <div className="pt-4">
            <Skeleton className="h-10 w-36" />
          </div>
        </div>
      </div>
    </div>
  );
}