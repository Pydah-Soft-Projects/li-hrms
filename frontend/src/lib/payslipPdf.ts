import type { jsPDF } from 'jspdf';
import type { CompanyProfile } from '@/lib/companyProfile';
import { formatAddressBlock } from '@/lib/companyProfile';
import { resolvePayslipAccentRgb } from '@/lib/payslipTheme';

function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (!url || typeof window === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export type PayslipHeaderOptions = {
  periodLabel: string;
  refId?: string;
  confidentialLabel?: string;
};

/**
 * Draws company branding + payslip title block. Returns Y position for next content.
 */
export async function drawPayslipCompanyHeader(
  doc: jsPDF,
  profile: CompanyProfile,
  options: PayslipHeaderOptions
): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const primaryColor: [number, number, number] = [30, 41, 59];
  const accentColor = resolvePayslipAccentRgb(profile);
  const borderColor: [number, number, number] = [226, 232, 240];
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.setLineWidth(0.2);
  doc.rect(5, 5, pageWidth - 10, pageHeight - 10);

  let headerLeft = 16;
  const logo = await loadImage(profile.branding.logoUrl);
  if (logo) {
    try {
      const maxW = 28;
      const maxH = 14;
      const ratio = logo.width / logo.height;
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }
      const format = profile.branding.logoUrl.toLowerCase().includes('.png') ? 'PNG' : 'JPEG';
      doc.addImage(logo, format, 12, 12, w, h);
      headerLeft = 12 + w + 6;
    } catch {
      /* ignore broken logo */
    }
  }

  const companyLine = profile.legalName || profile.displayName;
  if (companyLine) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(companyLine, headerLeft, 16);
  }

  const address = formatAddressBlock(profile.addresses.registered);
  if (address) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    const wrapped = doc.splitTextToSize(address, pageWidth - headerLeft - 20);
    doc.text(wrapped.slice(0, 2), headerLeft, companyLine ? 21 : 16);
  }

  const regParts: string[] = [];
  if (profile.registration.pan) regParts.push(`PAN: ${profile.registration.pan}`);
  if (profile.registration.gstin) regParts.push(`GSTIN: ${profile.registration.gstin}`);
  if (regParts.length) {
    doc.setFontSize(6.5);
    doc.text(regParts.join('  |  '), headerLeft, companyLine ? 28 : 23);
  }

  doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.rect(10, 32, 2, 12, 'F');

  const title = profile.documents.payslipTitle || 'PAYSLIP';
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 16, 40);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(options.periodLabel, 16, 46);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.text(options.confidentialLabel || 'PRIVATE & CONFIDENTIAL', pageWidth - 15, 38, { align: 'right' });
  if (options.refId) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(`Ref: ${options.refId}`, pageWidth - 15, 43, { align: 'right' });
  }

  return 52;
}

/** Simpler centered header for legacy payslip layout */
export async function drawPayslipCompanyHeaderCentered(
  doc: jsPDF,
  profile: CompanyProfile,
  options: { monthLabel: string; startY?: number }
): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = options.startY ?? 12;

  const logo = await loadImage(profile.branding.logoUrl);
  if (logo) {
    try {
      const w = 24;
      const h = (logo.height / logo.width) * w;
      const format = profile.branding.logoUrl.toLowerCase().includes('.png') ? 'PNG' : 'JPEG';
      doc.addImage(logo, format, pageWidth / 2 - w / 2, y, w, Math.min(h, 12));
      y += Math.min(h, 12) + 4;
    } catch {
      /* ignore */
    }
  }

  const companyLine = profile.legalName || profile.displayName;
  if (companyLine) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(companyLine, pageWidth / 2, y, { align: 'center' });
    y += 6;
  }

  const address = formatAddressBlock(profile.addresses.registered);
  if (address) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(address, pageWidth - 40);
    doc.text(wrapped.slice(0, 2), pageWidth / 2, y, { align: 'center' });
    y += wrapped.length > 1 ? 10 : 6;
  }

  const title = profile.documents.payslipTitle || 'PAYSLIP';
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(options.monthLabel, pageWidth / 2, y, { align: 'center' });
  return y + 10;
}

export function drawPayslipFooter(doc: jsPDF, profile: CompanyProfile, y: number): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = pageHeight - 14;

  if (profile.documents.footerText) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(148, 163, 184);
    const lines = doc.splitTextToSize(profile.documents.footerText, pageWidth - 28);
    doc.text(lines, pageWidth / 2, footerY - (lines.length > 1 ? 4 : 0), { align: 'center' });
  }

  const contactBits: string[] = [];
  if (profile.contact.phone) contactBits.push(profile.contact.phone);
  if (profile.contact.hrEmail) contactBits.push(profile.contact.hrEmail);
  if (profile.contact.website) contactBits.push(profile.contact.website);
  if (contactBits.length) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(contactBits.join('  |  '), pageWidth / 2, pageHeight - 8, { align: 'center' });
  }

  if (profile.documents.signatory.name) {
    doc.setFontSize(8);
    doc.text(profile.documents.signatory.name, pageWidth - 20, y, { align: 'right' });
    if (profile.documents.signatory.designation) {
      doc.setFontSize(7);
      doc.text(profile.documents.signatory.designation, pageWidth - 20, y + 4, { align: 'right' });
    }
  }
}
