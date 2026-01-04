'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface QRScannerProps {
    onScanSuccess: (decodedText: string) => void;
    onScanFailure?: (error: string) => void;
    fps?: number;
    qrbox?: number;
    aspectRatio?: number;
    disableFlip?: boolean;
}

const QRScanner = ({
    onScanSuccess,
    onScanFailure,
    fps = 10,
    qrbox = 250,
    aspectRatio = 1.0,
    disableFlip = false,
}: QRScannerProps) => {
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const config = {
            fps,
            qrbox,
            aspectRatio,
            disableFlip,
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        };

        const scanner = new Html5QrcodeScanner('qr-reader', config, false);
        scannerRef.current = scanner;

        scanner.render(
            (decodedText) => {
                // Stop the scanner after a successful scan
                if (scannerRef.current) {
                    // scannerRef.current.clear(); // We might want to keep it running for multiple scans, but usually for verification we want to stop or pause.
                    // For security gate, stopping after success might be better to show confirmation.
                    // But the UI might want to stay open. Let's let the parent decide or just pulse the UI.
                }
                onScanSuccess(decodedText);
            },
            (errorMessage) => {
                if (onScanFailure) {
                    onScanFailure(errorMessage);
                }
            }
        );

        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch((err) => {
                    console.error('Failed to clear scanner', err);
                });
            }
        };
    }, []);

    return (
        <div className="w-full">
            <div id="qr-reader" className="overflow-hidden rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-900 shadow-inner"></div>
            {error && (
                <div className="mt-2 text-center text-sm text-red-500">
                    {error}
                </div>
            )}
            <style jsx global>{`
        #qr-reader {
          border: none !important;
        }
        #qr-reader__dashboard {
          padding: 1rem !important;
          background: #f8fafc !important;
          border-top: 1px solid #e2e8f0 !important;
        }
        .dark #qr-reader__dashboard {
          background: #0f172a !important;
          border-top: 1px solid #1e293b !important;
        }
        #qr-reader__status_span {
            display: none !important;
        }
        #qr-reader__scan_region {
            background: #000 !important;
        }
        /* Style the buttons provided by html5-qrcode */
        #qr-reader button {
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          background-color: #2563eb;
          color: white;
          font-weight: 500;
          font-size: 0.875rem;
          border: none;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        #qr-reader button:hover {
          background-color: #1d4ed8;
        }
        #qr-reader select {
            padding: 0.25rem 0.5rem;
            border-radius: 0.25rem;
            background: white;
            border: 1px solid #cbd5e1;
            margin-left: 0.5rem;
        }
        .dark #qr-reader select {
            background: #1e293b;
            color: white;
            border: 1px solid #334155;
        }
      `}</style>
        </div>
    );
};

export default QRScanner;
