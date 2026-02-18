import React, { memo, useState } from 'react';
import { Search } from 'lucide-react';

interface SearchSectionProps {
    onSearchChange: (term: string) => void;
}

const SearchSection = memo(({
    onSearchChange
}: SearchSectionProps) => {
    const [localTerm, setLocalTerm] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setLocalTerm(val);
        onSearchChange(val);
    };

    return (
        <div className="flex-1 max-w-md">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all focus-within:ring-2 focus-within:ring-blue-500/10 group/search">
                <Search size={15} className="text-slate-400 group-focus-within/search:text-blue-500 transition-colors" />
                <input
                    type="text"
                    placeholder="Search staff members..."
                    value={localTerm}
                    onChange={handleChange}
                    className="bg-transparent text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 focus:outline-none w-full"
                />
            </div>
        </div>
    );
});

SearchSection.displayName = 'SearchSection';

export default SearchSection;
