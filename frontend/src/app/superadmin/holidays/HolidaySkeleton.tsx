
export function HolidaySkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            {/* Header Skeleton */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
                <div>
                    <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg mb-2"></div>
                    <div className="h-4 w-64 bg-slate-100 dark:bg-slate-800/50 rounded"></div>
                </div>
            </div>

            {/* Tabs Skeleton */}
            <div className="mb-6 border-b border-slate-200 dark:border-slate-700">
                <div className="flex space-x-8">
                    <div className="h-10 w-24 bg-slate-200 dark:bg-slate-800 rounded-t-lg"></div>
                    <div className="h-10 w-24 bg-white dark:bg-slate-900 rounded-t-lg"></div>
                </div>
            </div>

            {/* Controls Skeleton */}
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-4">
                    {/* Dropdown */}
                    <div className="h-10 w-40 bg-slate-100 dark:bg-slate-800 rounded-xl"></div>

                    <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>

                    {/* Date Nav */}
                    <div className="flex items-center gap-3">
                        <div className="h-6 w-32 bg-slate-200 dark:bg-slate-800 rounded"></div>
                        <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 gap-1">
                            <div className="h-6 w-6 bg-slate-200 dark:bg-slate-700 rounded"></div>
                            <div className="h-6 w-12 bg-slate-200 dark:bg-slate-700 rounded"></div>
                            <div className="h-6 w-6 bg-slate-200 dark:bg-slate-700 rounded"></div>
                        </div>
                    </div>
                </div>

                {/* Add Button */}
                <div className="h-10 w-32 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
            </div>

            {/* Calendar Grid Skeleton */}
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
                {/* Days Header */}
                <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/80">
                    {[...Array(7)].map((_, i) => (
                        <div key={i} className="py-4 flex justify-center">
                            <div className="h-3 w-8 bg-slate-200 dark:bg-slate-800 rounded"></div>
                        </div>
                    ))}
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 border-slate-100 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 gap-px">
                    {[...Array(35)].map((_, i) => (
                        <div key={i} className="min-h-[140px] p-2 bg-white dark:bg-slate-900">
                            <div className="flex items-center justify-between mb-2">
                                <div className="h-8 w-8 bg-slate-100 dark:bg-slate-800 rounded-full"></div>
                            </div>
                            <div className="space-y-2">
                                <div className="h-12 w-full bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800"></div>
                                {i % 3 === 0 && <div className="h-12 w-full bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800"></div>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
