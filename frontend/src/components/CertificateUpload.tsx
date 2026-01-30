'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import Swal from 'sweetalert2';

interface CertificateUploadProps {
    qualificationIndex: number;
    certificateUrl?: string; // Existing URL from server
    onFileChange: (file: File | null) => void; // Callback for parent
    onDelete: () => void; // Callback to clear URL/File in parent
    isViewMode?: boolean;
}

export const CertificateUpload: React.FC<CertificateUploadProps> = ({
    qualificationIndex,
    certificateUrl,
    onFileChange,
    onDelete,
    isViewMode = false,
}) => {
    // If certificateUrl is present, use it. Otherwise, rely on local preview.
    const [previewUrl, setPreviewUrl] = useState<string | null>(certificateUrl || null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isHovered, setIsHovered] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync preview with external URL if it changes (e.g. edit mode load) and no local file is selected
    useEffect(() => {
        if (certificateUrl && !selectedFile) {
            setPreviewUrl(certificateUrl);
        }
    }, [certificateUrl, selectedFile]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            toast.error('Invalid file type. Only JPG, PNG, and PDF are allowed.');
            return;
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error('File size too large. Maximum size is 5MB.');
            return;
        }

        const objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);
        setSelectedFile(file);
        onFileChange(file);
    };

    const handleDelete = async () => {
        const result = await Swal.fire({
            title: 'Delete Certificate',
            text: 'Are you sure you want to remove this certificate?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, remove it!'
        });

        if (!result.isConfirmed) {
            return;
        }

        // Clean up previous object URL if needed
        if (previewUrl && !previewUrl.startsWith('http')) {
            URL.revokeObjectURL(previewUrl);
        }

        setPreviewUrl(null);
        setSelectedFile(null);
        onFileChange(null);
        onDelete();
    };

    const handleUpdate = () => {
        fileInputRef.current?.click();
    };

    // Cleanup object URL
    useEffect(() => {
        return () => {
            if (previewUrl && !previewUrl.startsWith('http')) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    const isPDF = previewUrl?.toLowerCase().endsWith('.pdf') || selectedFile?.type === 'application/pdf';

    return (
        <div className="mt-2 space-y-2">
            {/* Hidden file input for updates */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg,application/pdf"
                onChange={handleFileUpload}
                className="hidden"
            />

            {!previewUrl ? (
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Certificate (Image/PDF)
                    </label>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isViewMode}
                        className="w-full rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-6 text-center transition-all hover:border-green-400 hover:bg-green-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-green-500 dark:hover:bg-green-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <svg className="mx-auto h-10 w-10 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-400">
                            Choose File
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            JPG, PNG or PDF (Max 5MB)
                        </p>
                    </button>
                </div>
            ) : (
                <div
                    className="relative rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800 overflow-hidden"
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                >
                    <div className="flex items-start gap-3">
                        {isPDF ? (
                            <div className="flex-shrink-0 w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                                <svg className="w-10 h-10 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                            </div>
                        ) : (
                            <div className="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden">
                                <img
                                    src={previewUrl}
                                    alt="Certificate"
                                    className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={() => window.open(previewUrl, '_blank')}
                                />
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                {isPDF ? 'Certificate (PDF)' : 'Certificate (Image)'}
                            </p>
                            <a
                                href={previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-block text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                View Full Size
                            </a>
                        </div>
                    </div>

                    {/* Hover Overlay with Actions */}
                    {!isViewMode && isHovered && (
                        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center gap-3 transition-all">
                            <button
                                type="button"
                                onClick={handleUpdate}
                                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                Update
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
