'use client';

import { useState } from 'react';
import { toast } from 'react-toastify';

interface CertificateUploadProps {
    qualificationIndex: number;
    certificateUrl?: string;
    onUploadSuccess: (url: string) => void;
    onDelete: () => void;
}

export const CertificateUpload: React.FC<CertificateUploadProps> = ({
    qualificationIndex,
    certificateUrl,
    onUploadSuccess,
    onDelete,
}) => {
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

        try {
            setUploading(true);

            const formData = new FormData();
            formData.append('file', file);

            const token = localStorage.getItem('token');
            const response = await fetch('/api/upload/certificate', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: formData,
            });

            const data = await response.json();

            if (data.success && data.url) {
                onUploadSuccess(data.url);
                toast.success('Certificate uploaded successfully!');
            } else {
                toast.error(data.message || 'Failed to upload certificate');
            }
        } catch (error: any) {
            console.error('Certificate upload error:', error);
            toast.error(error.message || 'Failed to upload certificate');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async () => {
        if (!certificateUrl) return;

        if (!confirm('Are you sure you want to delete this certificate?')) {
            return;
        }

        try {
            setDeleting(true);

            const token = localStorage.getItem('token');
            const response = await fetch('/api/upload/certificate', {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: certificateUrl }),
            });

            const data = await response.json();

            if (data.success) {
                onDelete();
                toast.success('Certificate deleted successfully!');
            } else {
                toast.error(data.message || 'Failed to delete certificate');
            }
        } catch (error: any) {
            console.error('Certificate delete error:', error);
            toast.error(error.message || 'Failed to delete certificate');
        } finally {
            setDeleting(false);
        }
    };

    const handleReupload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

        try {
            setUploading(true);

            const formData = new FormData();
            formData.append('file', file);
            if (certificateUrl) {
                formData.append('oldUrl', certificateUrl);
            }

            const token = localStorage.getItem('token');
            const response = await fetch('/api/upload/certificate', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: formData,
            });

            const data = await response.json();

            if (data.success && data.url) {
                onUploadSuccess(data.url);
                toast.success('Certificate replaced successfully!');
            } else {
                toast.error(data.message || 'Failed to replace certificate');
            }
        } catch (error: any) {
            console.error('Certificate replace error:', error);
            toast.error(error.message || 'Failed to replace certificate');
        } finally {
            setUploading(false);
        }
    };

    const isPDF = certificateUrl?.toLowerCase().endsWith('.pdf');

    return (
        <div className="mt-2 space-y-2">
            {!certificateUrl ? (
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Certificate (Image/PDF) - Optional
                    </label>
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/jpg,application/pdf"
                        onChange={handleFileUpload}
                        disabled={uploading}
                        className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        JPG, PNG or PDF (Max 5MB)
                    </p>
                    {uploading && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                            Uploading...
                        </div>
                    )}
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
                                src={certificateUrl}
                                alt="Certificate"
                                className="flex-shrink-0 w-16 h-16 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => window.open(certificateUrl, '_blank')}
                            />
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {isPDF ? 'Certificate (PDF)' : 'Certificate (Image)'}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <a
                                    href={certificateUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    View Full Size
                                </a>
                                <label className="text-xs text-green-600 dark:text-green-400 hover:underline cursor-pointer">
                                    Re-upload
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/jpg,application/pdf"
                                        onChange={handleReupload}
                                        disabled={uploading}
                                        className="hidden"
                                    />
                                </label>
                                <button
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                                >
                                    {deleting ? 'Deleting...' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
