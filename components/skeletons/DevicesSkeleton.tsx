import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function DevicesSkeleton() {
  return (
    <div className="mb-20 lg:mb-0">
      {/* Header */}
      <div className="mb-6 space-y-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-5 w-72" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Devices List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-28" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg border-2 border-gray-200"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-2 w-2 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* QR Code Display & Device Details */}
        <div className="lg:col-span-2 space-y-4">
          {/* QR Code Card */}
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="flex flex-col items-center py-8">
              <Skeleton className="h-48 w-48 rounded-lg" />
              <Skeleton className="h-4 w-32 mt-4" />
            </CardContent>
          </Card>

          {/* Device Details Card */}
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Device Name */}
              <div className="space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-40" />
              </div>

              {/* Device Type */}
              <div className="space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-32" />
              </div>

              {/* Pond */}
              <div className="space-y-1">
                <Skeleton className="h-4 w-16" />
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <Skeleton className="h-4 w-16" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-2 w-2 rounded-full" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>

              {/* Device ID */}
              <div className="space-y-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-10 w-full rounded" />
              </div>

              {/* Created */}
              <div className="space-y-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-28" />
              </div>

              {/* Delete Button */}
              <div className="pt-4 border-t">
                <Skeleton className="h-10 w-full rounded" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
