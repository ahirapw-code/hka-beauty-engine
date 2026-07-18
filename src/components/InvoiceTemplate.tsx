import React from 'react';
import { Transaction, BranchProfile } from '../types';
import { formatIDR } from '../utils';
import { Calendar, User, CreditCard } from 'lucide-react';

interface InvoiceTemplateProps {
  transaction: Transaction;
  branchProfile?: BranchProfile;
}

export default function InvoiceTemplate({ transaction, branchProfile }: InvoiceTemplateProps) {
  // Safe Fallback values
  const displayName = branchProfile?.displayName || (transaction.branch === 'NAO_STUDIO' ? 'NAO Studio' : 'DIAEL Beauty');
  const address = branchProfile?.address || 'Alamat Belum Dikonfigurasi';
  const phone = branchProfile?.phone || 'No. Telpon Belum Dikonfigurasi';
  const logoUrl = branchProfile?.logoUrl;
  const footerNote = branchProfile?.invoiceFooterNote || 'Terima kasih atas kunjungan Anda!';
  const bankInfo = branchProfile?.bankInfo || 'Informasi rekening belum disetel.';

  // Format Date beautifully
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }) + ' ' + date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // Convert Payment Method to readable Indonesian label
  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'cash':
        return 'Tunai';
      case 'card':
        return 'Debit/Kredit';
      case 'bank_transfer':
        return 'Transfer Bank';
      case 'e_wallet':
        return 'E-Wallet';
      default:
        return method;
    }
  };

  // Compute values for item-level discounts
  let calculatedSubtotal = 0;
  let totalItemDiscounts = 0;

  const itemsWithDiscountInfo = transaction.items.map(item => {
    const itemGrossTotal = item.price * item.quantity;
    calculatedSubtotal += itemGrossTotal;

    let discountAmount = 0;
    if (item.discountValue) {
      if (item.discountType === 'percent') {
        discountAmount = (itemGrossTotal * item.discountValue) / 100;
      } else {
        discountAmount = item.discountValue * item.quantity;
      }
    }
    totalItemDiscounts += discountAmount;

    return {
      ...item,
      grossTotal: itemGrossTotal,
      discountAmount
    };
  });

  // Invoice-level discount (the remainder of total discount minus item
  // discounts and the automatic membership discount, which each get their
  // own line below for transparency).
  const totalDiscount = transaction.discount;
  const membershipDiscount = transaction.membershipDiscount || 0;
  const invoiceLevelDiscount = Math.max(0, totalDiscount - totalItemDiscounts - membershipDiscount);

  return (
    <div id={`invoice-container-${transaction.id}`} className="flex flex-col items-center space-y-4">
      {/* Main Receipt Shell */}
      <div
        id={`printable-invoice-${transaction.id}`}
        className="invoice-box w-full max-w-[380px] bg-white border border-[#e5dfd5] rounded-3xl shadow-lg p-6 font-mono text-[11px] text-slate-800 leading-relaxed"
      >
        {/* Header (Logo + Branch details) */}
        <div className="flex flex-col items-center text-center space-y-2 pb-4">
          {logoUrl ? (
            <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center p-1 border border-slate-100 mb-1 overflow-hidden">
              <img
                src={logoUrl}
                alt={displayName}
                className="max-h-full max-w-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#D4AF37] to-[#F3E5AB] flex items-center justify-center shadow-md mb-1 font-serif font-extrabold text-[#1a1c1e] text-base">
              H
            </div>
          )}
          
          <h2 className="text-sm font-extrabold tracking-tight text-slate-900 uppercase">
            {displayName}
          </h2>
          
          <p className="text-[10px] text-slate-500 max-w-[240px] leading-tight font-medium">
            {address}
          </p>
          <p className="text-[10px] text-slate-500 font-medium">
            Telp: {phone}
          </p>
        </div>

        {/* Separator Line */}
        <div className="border-t border-dashed border-slate-300 my-3"></div>

        {/* Invoice Metadata */}
        <div className="space-y-1.5 text-[10px] text-slate-600 font-medium pb-2">
          <div className="flex justify-between">
            <span>No. Transaksi:</span>
            <span className="font-bold text-slate-800">{transaction.id}</span>
          </div>
          <div className="flex justify-between">
            <span>Tanggal:</span>
            <span>{formatDate(transaction.date)}</span>
          </div>
          <div className="flex justify-between">
            <span>Kasir:</span>
            <span>{transaction.cashierName}</span>
          </div>
          <div className="flex justify-between">
            <span>Pelanggan:</span>
            <span className="font-semibold text-slate-800 truncate max-w-[150px]">{transaction.customerName}</span>
          </div>
        </div>

        {/* Separator Line */}
        <div className="border-t border-dashed border-slate-300 my-3"></div>

        {/* Items Listing Header */}
        <div className="font-extrabold text-slate-900 grid grid-cols-12 pb-1.5 text-[10px]">
          <span className="col-span-6">ITEM / JASA</span>
          <span className="col-span-2 text-center">QTY</span>
          <span className="col-span-4 text-right">JUMLAH</span>
        </div>

        {/* Items Listing Rows */}
        <div className="space-y-2 pb-3">
          {itemsWithDiscountInfo.map((item, idx) => (
            <div key={`${item.id}-${idx}`} className="space-y-0.5">
              <div className="grid grid-cols-12 text-slate-800 font-medium">
                <span className="col-span-6 truncate font-sans text-xs leading-normal font-semibold text-slate-900">{item.name}</span>
                <span className="col-span-2 text-center text-slate-600">{item.quantity}</span>
                <span className="col-span-4 text-right text-slate-900 font-semibold">{formatIDR(item.grossTotal)}</span>
              </div>
              
              {/* Unit Price Info */}
              <div className="text-[9px] text-slate-500 font-medium pl-1">
                @ {formatIDR(item.price)}
              </div>

              {/* Item Level Discount (If any) */}
              {item.discountAmount > 0 && (
                <div className="text-[9px] text-rose-500 font-semibold pl-2 flex justify-between">
                  <span>
                    └ Diskon ({item.discountValue}{item.discountType === 'percent' ? '%' : ''})
                  </span>
                  <span>-{formatIDR(item.discountAmount)}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Separator Line */}
        <div className="border-t border-dashed border-slate-300 my-3"></div>

        {/* Totals Section */}
        <div className="space-y-1.5 font-medium text-slate-800">
          <div className="flex justify-between">
            <span>Subtotal Gross:</span>
            <span>{formatIDR(calculatedSubtotal)}</span>
          </div>

          {totalItemDiscounts > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>Total Diskon Item:</span>
              <span>-{formatIDR(totalItemDiscounts)}</span>
            </div>
          )}

          {membershipDiscount > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>Diskon Membership:</span>
              <span>-{formatIDR(membershipDiscount)}</span>
            </div>
          )}

          {invoiceLevelDiscount > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>Diskon Invoice:</span>
              <span>-{formatIDR(invoiceLevelDiscount)}</span>
            </div>
          )}

          <div className="border-t border-slate-200 my-1"></div>

          <div className="flex justify-between text-xs font-black text-slate-950">
            <span>TOTAL AKHIR:</span>
            <span className="text-sm font-mono text-[#D4AF37]">{formatIDR(transaction.total)}</span>
          </div>

          <div className="border-t border-slate-200 my-1"></div>

          <div className="flex justify-between text-[10px] text-slate-600 font-semibold">
            <span>Metode Pembayaran:</span>
            <span className="uppercase text-slate-900">{getPaymentMethodLabel(transaction.paymentMethod)}</span>
          </div>
        </div>

        {/* Separator Line */}
        <div className="border-t border-dashed border-slate-300 my-3.5"></div>

        {/* Footer Notes & Bank Info */}
        <div className="text-center space-y-3.5">
          {/* Bank Transfer Info (Optional but useful for bank transfers) */}
          {transaction.paymentMethod === 'bank_transfer' && (
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-[9px] text-slate-600 leading-normal text-left font-sans">
              <span className="font-bold text-slate-800 uppercase block mb-1">Panduan Transfer</span>
              <p className="font-medium">{bankInfo}</p>
            </div>
          )}

          {/* Footer custom note */}
          <div className="text-[10px] text-slate-500 font-sans leading-normal font-medium max-w-[280px] mx-auto whitespace-pre-line">
            {footerNote}
          </div>

          <div className="text-[10px] text-slate-400 font-bold tracking-widest font-sans uppercase">
            *** HKA ENGINE ***
          </div>
        </div>
      </div>
    </div>
  );
}
