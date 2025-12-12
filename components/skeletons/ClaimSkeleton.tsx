import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function ClaimSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-xl shadow-lg border border-gray-200">
        <CardHeader className="flex flex-row items-start justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-6 w-6 rounded" />
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Device Info Card */}
          <div className="bg-blue-50 border border-blue-100 p-3 rounded space-y-2">
            <Skeleton className="h-5 w-40 bg-blue-100" />
            <Skeleton className="h-4 w-32 bg-blue-100" />
            <Skeleton className="h-4 w-full bg-blue-100" />
          </div>

          {/* Pond Option 1 */}
          <div className="flex items-center gap-3 p-3 border border-gray-200 rounded">
            <Skeleton className="h-4 w-4 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>

          {/* Pond Option 2 */}
          <div className="flex items-start gap-3 p-3 border border-gray-200 rounded">
            <Skeleton className="h-4 w-4 rounded-full mt-1" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded" />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Skeleton className="h-10 w-full sm:w-40 rounded" />
            <Skeleton className="h-10 w-full sm:w-36 rounded" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
