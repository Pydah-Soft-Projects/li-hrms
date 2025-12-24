'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

interface CertificateUploadProps {
    qualificationIndex: number;
    certificateUrl?: string; // Existing URL from server
    onFileChange: (file: File | null) => void; // Callback for parent
    onDelete: () => void; // Callback to clear URL/File in parent
}

export const CertificateUpload: React.FC<CertificateUploadProps> = ({
    qualificationIndex,
    certificateUrl,
    onFileChange,
    onDelete,
}) => {
    // If certificateUrl is present, use it. Otherwise, rely on local preview.
    const [previewUrl, setPreviewUrl] = useState<string | null>(certificateUrl || null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

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

    const handleDelete = () => {
        if (!confirm('Are you sure you want to remove this certificate?')) {
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
            {!previewUrl ? (
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Certificate (Image/PDF) - Optional
                    </label>
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/jpg,application/pdf"
                        onChange={handleFileUpload}
                        className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        JPG, PNG or PDF (Max 5MB)
                    </p>
                </div>
            ) : (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800">
                    <div className="flex items-start gap-3">
                        {isPDF ? (
                            <div className="flex-shrink-0 w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded flex items-center justify-center">
                                <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                            </div>
                        ) : (
                            <img
                                src={previewUrl}
                                alt="Certificate"
                                className="flex-shrink-0 w-16 h-16 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => window.open(previewUrl, '_blank')}
                            />
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {isPDF ? 'Certificate (PDF)' : 'Certificate (Image)'}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <a
                                    href={previewUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    View Full Size
                                </a>
                                <button
                                    onClick={handleDelete}
                                    type="button"
                                    className="text-xs text-red-600 dark:text-red-400 hover:underline"
                                >
                                    Remove/Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
