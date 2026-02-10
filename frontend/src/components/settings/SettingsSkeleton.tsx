export const SettingsSkeleton = () => {
    return (
        <div className="space-y-10 animate-pulse">
            {/* Header Skeleton */}
            <div className="border-b border-gray-200 dark:border-gray-800 pb-5">
                <div className="h-3 w-32 bg-gray-200 dark:bg-gray-800 rounded mb-3"></div>
                <div className="h-6 w-48 bg-gray-300 dark:bg-gray-700 rounded mb-2"></div>
                <div className="h-4 w-96 bg-gray-200 dark:bg-gray-800 rounded"></div>
            </div>

            {/* Content Grid Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column */}
                <div className="space-y-8">
                    {/* Card 1 */}
                    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-8">
                        <div className="space-y-6">
                            <div className="h-5 w-40 bg-gray-300 dark:bg-gray-700 rounded"></div>
                            <div className="space-y-4">
                                <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
                                <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
                                <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
                            </div>
                        </div>
                    </div>

                    {/* Card 2 */}
                    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-8">
                        <div className="space-y-6">
                            <div className="h-5 w-32 bg-gray-300 dark:bg-gray-700 rounded"></div>
                            <div className="space-y-4">
                                <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
                                <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div>
                    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-8">
                        <div className="space-y-6">
                            <div className="h-5 w-36 bg-gray-300 dark:bg-gray-700 rounded"></div>
                            <div className="space-y-4">
                                <div className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
                                <div className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
                                <div className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
                                <div className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
                            </div>
                            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-xl mt-6"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const SettingsCardSkeleton = () => {
    return (
        <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 sm:p-8 animate-pulse">
            <div className="space-y-6">
                <div className="h-5 w-40 bg-gray-300 dark:bg-gray-700 rounded"></div>
                <div className="space-y-4">
                    <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
                    <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
                    <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
                </div>
            </div>
        </div>
    );
};

export const SettingsFormSkeleton = () => {
    return (
        <div className="space-y-6 animate-pulse">
            {/* Form Field 1 */}
            <div className="space-y-2">
                <div className="h-3 w-24 bg-gray-200 dark:bg-gray-800 rounded"></div>
                <div className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
            </div>

            {/* Form Field 2 */}
            <div className="space-y-2">
                <div className="h-3 w-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
                <div className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
            </div>

            {/* Form Field 3 */}
            <div className="space-y-2">
                <div className="h-3 w-28 bg-gray-200 dark:bg-gray-800 rounded"></div>
                <div className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
            </div>

            {/* Toggle Fields */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-black/10 rounded-xl">
                <div className="h-4 w-40 bg-gray-200 dark:bg-gray-800 rounded"></div>
                <div className="h-6 w-12 bg-gray-300 dark:bg-gray-700 rounded-full"></div>
            </div>

            {/* Save Button */}
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-xl mt-6"></div>
        </div>
    );
};
