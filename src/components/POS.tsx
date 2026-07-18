import React, { useState, useMemo, useEffect } from 'react';
import { User, Branch, Customer, Service, Product, Therapist, Transaction, BranchProfile } from '../types';
import { formatIDR, getMembershipTier, visitsUntilNextTier, MEMBERSHIP_TIERS, MEMBERSHIP_DISCOUNT_PERCENT } from '../utils';
import { doc, getDoc } from '../lib/firestoreClient';
import { db } from '../lib/firebase';
import InvoiceTemplate from './InvoiceTemplate';
import { toPng, toJpeg } from 'html-to-image';
import {   Plus, 
  Minus, 
  Trash2, 
  Search, 
  ShoppingBag, 
  UserPlus, 
  Printer, 
  CheckCircle,
  Building2,
  Receipt,
  X,
  Share2,
  Download,
  ExternalLink,
  MessageSquare,
  Loader2,
  Sparkles
} from 'lucide-react';


interface POSProps {
  user: User;
  selectedBranch: Branch;
  customers: Customer[];
  services: Service[];
  products: Product[];
  therapists: Therapist[];
  // Full staff/user directory. Used only to auto-surface SALON_MANAGER
  // accounts as assignable "therapists" in the POS (see activeTherapists
  // below) - not for anything auth-related here.
  users: User[];
  onAddTransaction: (
    tx: Omit<Transaction, 'id' | 'date'>,
    invoiceDiscountValue?: number,
    invoiceDiscountType?: 'percent' | 'flat',
    idempotencyKey?: string
  ) => Promise<string>;
  onAddCustomer: (customer: Omit<Customer, 'id' | 'totalSpend' | 'visitsCount'>) => void;
  onActivateMembership: (customerId: string) => void;
}

export default function POS({
  user,
  selectedBranch,
  customers,
  services,
  products,
  therapists,
  users,
  onAddTransaction,
  onAddCustomer,
  onActivateMembership
}: POSProps) {
  // POS branch is locked if Salon Manager, otherwise relies on HKA selector or POS-specific override
  const [posBranch, setPosBranch] = useState<'NAO_STUDIO' | 'DIAEL_BEAUTY'>(
    user.branch === 'ALL' 
      ? (selectedBranch === 'ALL' ? 'NAO_STUDIO' : selectedBranch as 'NAO_STUDIO' | 'DIAEL_BEAUTY')
      : user.branch as 'NAO_STUDIO' | 'DIAEL_BEAUTY'
  );

  // Cart State with per-item discounts
  const [cart, setCart] = useState<Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    type: 'service' | 'product';
    therapistId?: string;
    discountValue?: number;
    discountType?: 'percent' | 'flat';
  }>>([]);

  // Tab state for mobile responsiveness
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id || '');
  // Guards against double-submit (double-tap / accidental double-click),
  // which previously could send the same sale to processCheckout twice.
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  // Human-readable checkout failure shown as an inline banner (replaces
  // the old raw alert() of Mongoose's internal error text). Cleared
  // whenever a new checkout attempt starts or succeeds.
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  // Generated once per *distinct* checkout attempt (i.e. once for the
  // current cart) and reused across "Coba Lagi" retries of that same
  // attempt, so a retry is recognized by the server's idempotency check
  // as the same sale rather than risking a duplicate transaction if the
  // original request actually went through but the response was lost.
  const checkoutIdempotencyKeyRef = React.useRef<string | null>(null);
  
  // Invoice-level discount
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState<number>(0);
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<'percent' | 'flat'>('flat');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'e_wallet'>('card');
  const [showInvoice, setShowInvoice] = useState(false);
  const [lastCreatedInvoice, setLastCreatedInvoice] = useState<Transaction | null>(null);
  const [currentBranchProfile, setCurrentBranchProfile] = useState<BranchProfile | null>(null);

  useEffect(() => {
    if (showInvoice && lastCreatedInvoice) {
      const fetchBranchProfile = async () => {
        try {
          const docRef = doc(db, 'settings', `branchProfile_${lastCreatedInvoice.branch}`);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setCurrentBranchProfile(docSnap.data() as BranchProfile);
          } else {
            setCurrentBranchProfile(null);
          }
        } catch (err) {
          console.error('Error fetching branch profile for invoice:', err);
          setCurrentBranchProfile(null);
        }
      };
      fetchBranchProfile();
    } else {
      setCurrentBranchProfile(null);
    }
  }, [showInvoice, lastCreatedInvoice]);

  // Image sharing and download states
  const [pngDataUrl, setPngDataUrl] = useState<string | null>(null);
  const [jpegDataUrl, setJpegDataUrl] = useState<string | null>(null);
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);

  useEffect(() => {
    if (!showInvoice || !lastCreatedInvoice) {
      setPngDataUrl(null);
      setJpegDataUrl(null);
      setPngBlob(null);
      setCanShareFiles(false);
      return;
    }

    const generateImage = async () => {
      setIsGeneratingImage(true);
      // Wait to allow the DOM and any loaded branch logo image to fully render
      await new Promise((resolve) => setTimeout(resolve, 800));

      const element = document.getElementById('invoice-capture-container');
      if (!element) {
        setIsGeneratingImage(false);
        return;
      }

      try {
        const pngUrl = await toPng(element, {
          backgroundColor: '#ffffff',
          cacheBust: true,
          style: {
            margin: '0',
            transform: 'scale(1)',
          }
        });
        setPngDataUrl(pngUrl);

        const response = await fetch(pngUrl);
        const blob = await response.blob();
        setPngBlob(blob);

        const jpegUrl = await toJpeg(element, {
          backgroundColor: '#ffffff',
          cacheBust: true,
          quality: 0.95,
          style: {
            margin: '0',
            transform: 'scale(1)',
          }
        });
        setJpegDataUrl(jpegUrl);

        // Check if Web Share API is capable of sharing files
        if (navigator.share && navigator.canShare) {
          const file = new File([blob], `invoice-${lastCreatedInvoice.id}.png`, { type: 'image/png' });
          try {
            const isShareable = navigator.canShare({ files: [file] });
            setCanShareFiles(isShareable);
          } catch (e) {
            setCanShareFiles(false);
          }
        } else {
          setCanShareFiles(false);
        }
      } catch (err) {
        console.error('Error generating invoice image:', err);
      } finally {
        setIsGeneratingImage(false);
      }
    };

    generateImage();
  }, [showInvoice, lastCreatedInvoice, currentBranchProfile]);

  const handleShareWhatsApp = async () => {
    if (!pngBlob || !lastCreatedInvoice) return;
    try {
      const file = new File([pngBlob], `invoice-${lastCreatedInvoice.id}.png`, { type: 'image/png' });
      await navigator.share({
        files: [file],
        title: 'Invoice HKA Engine',
        text: `Invoice untuk ${lastCreatedInvoice.customerName} - No. Transaksi: ${lastCreatedInvoice.id}`,
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        alert('Gagal membagikan invoice: ' + err.message);
      }
    }
  };

  const handleDownloadImage = (format: 'png' | 'jpeg') => {
    const dataUrl = format === 'png' ? pngDataUrl : jpegDataUrl;
    if (!dataUrl || !lastCreatedInvoice) return;

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `invoice-${lastCreatedInvoice.id}.${format === 'png' ? 'png' : 'jpg'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getWhatsAppShareLink = () => {
    if (!lastCreatedInvoice) return 'https://wa.me/';
    const text = `Halo, berikut adalah invoice transaksi Anda di ${
      lastCreatedInvoice.branch === 'NAO_STUDIO' ? 'NAO Studio' : 'DIAEL Beauty'
    }.\n\nNo. Transaksi: ${lastCreatedInvoice.id}\nPelanggan: ${lastCreatedInvoice.customerName}\nTotal: ${formatIDR(lastCreatedInvoice.total)}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };


  // Quick Customer Creation
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');

  // Filter products and services for the ACTIVE POS branch
  const activeServices = useMemo(() => {
    return services.filter(s => s.branches.includes(posBranch));
  }, [services, posBranch]);

  const activeProducts = useMemo(() => {
    return products.filter(p => p.branch === posBranch);
  }, [products, posBranch]);

  // Structural fix: previously this only read the `therapists` collection,
  // so a SALON_MANAGER never showed up as an assignable therapist in the
  // POS unless someone manually created a duplicate Therapist record for
  // them (via linkedUserId). Now every manager in the same branch is
  // surfaced automatically, no duplicate entry required. A manager who
  // *does* already have a linked Therapist record (dual-role staff who
  // also perform services) keeps using that real record - we skip the
  // synthetic one for them to avoid listing the same person twice.
  const activeTherapists = useMemo(() => {
    const realTherapists = therapists.filter(t => t.branch === posBranch);

    const alreadyLinkedManagerIds = new Set(
      therapists.filter(t => t.linkedUserId).map(t => t.linkedUserId as string)
    );

    const managerTherapists: Therapist[] = users
      .filter(u =>
        u.role === 'SALON_MANAGER' &&
        (u.branch === posBranch || u.branch === 'ALL') &&
        !alreadyLinkedManagerIds.has(u.id)
      )
      .map(u => ({
        id: u.id,
        name: `${u.name} (Manager)`,
        branch: posBranch,
        specialties: [],
        rating: 0,
        commissionRate: u.commissionRate || 0,
        totalCommissionEarned: 0,
        status: 'active',
        monthlyTarget: u.monthlyTarget || 0,
        currentSales: 0,
        baseSalary: u.baseSalary || 0,
      }));

    return [...realTherapists, ...managerTherapists];
  }, [therapists, users, posBranch]);

  // Customers are branch-specific too (separate NAO Studio / DIAEL Beauty
  // client bases) - only show the ones whose preferredBranch matches the
  // active POS branch, same filtering pattern as services/products/therapists.
  const activeCustomers = useMemo(() => {
    return customers.filter(c => c.preferredBranch === posBranch);
  }, [customers, posBranch]);

  // Keep the selected customer in sync with the active branch - if the
  // branch tab changes (or the current selection no longer belongs to this
  // branch), fall back to the first customer of the new branch's list.
  useEffect(() => {
    if (!activeCustomers.some(c => c.id === selectedCustomerId)) {
      setSelectedCustomerId(activeCustomers[0]?.id || '');
    }
  }, [activeCustomers, selectedCustomerId]);

  // Combine services and products for item catalog
  const catalog = useMemo(() => {
    const sItems = activeServices.map(s => ({ ...s, type: 'service' as const }));
    const pItems = activeProducts.map(p => ({ ...p, type: 'product' as const }));
    return [...sItems, ...pItems].filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [activeServices, activeProducts, searchQuery]);

  // The currently selected customer record - drives the membership badge
  // and the automatic 5% discount below.
  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId) || activeCustomers[0];
  }, [customers, selectedCustomerId, activeCustomers]);

  // Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [cart]);

  const itemDiscountsTotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const discVal = item.discountValue || 0;
      const discType = item.discountType || 'flat';
      if (discType === 'percent') {
        return sum + ((item.price * item.quantity * discVal) / 100);
      } else {
        return sum + (discVal * item.quantity);
      }
    }, 0);
  }, [cart]);

  const intermediateSubtotal = useMemo(() => {
    return Math.max(0, subtotal - itemDiscountsTotal);
  }, [subtotal, itemDiscountsTotal]);

  const invoiceDiscountAmount = useMemo(() => {
    if (invoiceDiscountType === 'percent') {
      return (intermediateSubtotal * invoiceDiscountValue) / 100;
    } else {
      return invoiceDiscountValue;
    }
  }, [intermediateSubtotal, invoiceDiscountValue, invoiceDiscountType]);

  // Automatic membership discount - mirrors checkoutController.ts exactly
  // (same base, same %) purely so the on-screen preview/receipt matches
  // what the server will actually charge. The server recalculates this
  // itself from the customer record and is the source of truth; this is
  // only a client-side preview.
  const membershipDiscountAmount = useMemo(() => {
    if (!selectedCustomer?.isMember) return 0;
    return (intermediateSubtotal * MEMBERSHIP_DISCOUNT_PERCENT) / 100;
  }, [selectedCustomer, intermediateSubtotal]);

  const totalDiscount = useMemo(() => {
    return itemDiscountsTotal + invoiceDiscountAmount + membershipDiscountAmount;
  }, [itemDiscountsTotal, invoiceDiscountAmount, membershipDiscountAmount]);

  const total = useMemo(() => {
    const val = subtotal - totalDiscount;
    return val < 0 ? 0 : val;
  }, [subtotal, totalDiscount]);

  // Cart operations
  const addToCart = (item: any) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id && i.type === item.type);
      if (existing) {
        return prev.map(i => i.id === item.id && i.type === item.type 
          ? { ...i, quantity: i.quantity + 1 } 
          : i
        );
      }
      return [...prev, {
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        type: item.type,
        discountValue: 0,
        discountType: 'flat',
        // Assign default therapist if it's a service
        therapistId: item.type === 'service' ? activeTherapists[0]?.id : undefined
      }];
    });
  };

  const updateQuantity = (id: string, type: 'service' | 'product', amount: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === id && i.type === type) {
        const nQ = i.quantity + amount;
        return nQ > 0 ? { ...i, quantity: nQ } : i;
      }
      return i;
    }));
  };

  const updateItemDiscount = (id: string, type: 'service' | 'product', value: number, discountType: 'percent' | 'flat') => {
    setCart(prev => prev.map(i => i.id === id && i.type === type 
      ? { ...i, discountValue: value, discountType } 
      : i
    ));
  };

  const removeFromCart = (id: string, type: 'service' | 'product') => {
    setCart(prev => prev.filter(i => !(i.id === id && i.type === type)));
  };

  const updateServiceTherapist = (id: string, therapistId: string) => {
    setCart(prev => prev.map(i => i.id === id && i.type === 'service' ? { ...i, therapistId } : i));
  };

  const handleCheckout = async (isRetry: boolean = false) => {
    if (cart.length === 0) return;
    if (isCheckingOut) return; // prevent double-submit from a double-tap/click
    setIsCheckingOut(true);
    if (!isRetry) {
      setCheckoutError(null);
    }

    // Keep the same idempotency key across retries of this attempt so the
    // server recognizes a "Coba Lagi" tap as the same sale, not a new one.
    if (!isRetry || !checkoutIdempotencyKeyRef.current) {
      checkoutIdempotencyKeyRef.current = crypto.randomUUID();
    }

    const customer = selectedCustomer;
    if (!customer) {
      setIsCheckingOut(false);
      return;
    }

    const txData = {
      customerName: customer.name,
      customerId: customer.id,
      branch: posBranch,
      items: cart.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        type: item.type,
        therapistId: item.therapistId,
        discountValue: item.discountValue,
        discountType: item.discountType
      })),
      subtotal,
      discount: totalDiscount,
      membershipDiscount: membershipDiscountAmount,
      total,
      paymentMethod,
      cashierName: user.name
    };

    try {
      const createdId = await onAddTransaction(
        txData,
        invoiceDiscountValue,
        invoiceDiscountType,
        checkoutIdempotencyKeyRef.current
      );

      // Save temporary details for the receipt invoice layout, using the
      // real, persisted transaction id returned by the server.
      setLastCreatedInvoice({
        id: createdId,
        date: new Date().toISOString().replace('T', ' ').substring(0, 19),
        ...txData
      });

      // Reset states
      setCart([]);
      setInvoiceDiscountValue(0);
      setInvoiceDiscountType('flat');
      setShowInvoice(true);
      setCheckoutError(null);
      checkoutIdempotencyKeyRef.current = null;
    } catch (err) {
      console.error('Checkout failed:', err);
      // A friendlier, non-blocking message instead of a raw Mongoose/network
      // error in a browser alert(). The idempotency key above means it's
      // safe for the cashier to tap "Coba Lagi" - even if the original
      // request actually reached the server, the retry will be recognized
      // as the same sale and simply return the existing transaction rather
      // than creating a duplicate.
      setCheckoutError(
        'Checkout tidak berhasil diproses. Ini biasanya karena koneksi jaringan sempat terputus - data penjualan kemungkinan besar belum tersimpan. Silakan coba lagi.'
      );
    } finally {
      setIsCheckingOut(false);
    }
  };

  // If the cashier edits the cart after a failed checkout (rather than
  // just retrying as-is), this is a genuinely different sale - drop the
  // old idempotency key so it isn't reused for different cart contents.
  useEffect(() => {
    checkoutIdempotencyKeyRef.current = null;
    setCheckoutError(null);
  }, [cart]);

  const handleCreateCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName || !newCustPhone) return;

    onAddCustomer({
      name: newCustName,
      email: newCustEmail || `${newCustName.toLowerCase().replace(/\s+/g, '')}@hka.com`,
      phone: newCustPhone,
      preferredBranch: posBranch,
      notes: 'POS Register'
    });

    setNewCustName('');
    setNewCustEmail('');
    setNewCustPhone('');
    setShowAddCustomer(false);
  };

  return (
    <div id="pos-module" className="flex flex-col h-[calc(100dvh-120px)] xl:h-[calc(100dvh-100px)] overflow-hidden">
      
      {/* Mobile-only sliding tabs - completely smooth */}
      <div className="xl:hidden flex items-center bg-slate-100 p-1 rounded-2xl mb-4 shrink-0 relative">
        <button
          onClick={() => setMobileTab('catalog')}
          className={`flex-1 text-center py-3 rounded-xl text-xs font-bold transition-all duration-300 flex items-center justify-center gap-2 relative z-10 touch-manipulation active:scale-[0.98] ${
            mobileTab === 'catalog' ? 'text-slate-900 font-extrabold' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>Browse Catalog</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 font-mono">
            {catalog.length}
          </span>
        </button>
        <button
          onClick={() => setMobileTab('cart')}
          className={`flex-1 text-center py-3 rounded-xl text-xs font-bold transition-all duration-300 flex items-center justify-center gap-2 relative z-10 touch-manipulation active:scale-[0.98] ${
            mobileTab === 'cart' ? 'text-white font-extrabold' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>Active Cart</span>
          {cart.length > 0 ? (
            <span className="px-2 py-0.5 rounded-full bg-[#D4AF37] text-slate-950 text-[10px] font-extrabold font-mono animate-pulse">
              {cart.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 font-mono">0</span>
          )}
        </button>
        {/* Sliding background highlight pill */}
        <div 
          className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl transition-all duration-300 ease-out shadow-sm ${
            mobileTab === 'catalog' ? 'left-1 bg-white' : 'left-[calc(50%+2px)] bg-slate-900'
          }`}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 flex-1 overflow-hidden">
        
        {/* Left panel: Catalog / Services & Products Grid */}
        <div className={`xl:col-span-7 flex flex-col h-full bg-white rounded-3xl border border-slate-100 p-5 overflow-hidden transition-all duration-300 ${
          mobileTab === 'catalog' ? 'flex animate-fade-in' : 'hidden xl:flex'
        }`}>
          
          {/* Branch / Search header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 shrink-0">
            <div>
              <h2 className="text-lg font-bold text-slate-800 font-serif">Point of Sale</h2>
              <p className="text-xs text-slate-400">Quick-checkout and payment logger.</p>
            </div>

            <div className="flex items-center gap-3">
              {/* Branch toggle: Only available if user has ALL access */}
              {user.role === 'HKA_MANAGEMENT' && (
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => { setPosBranch('NAO_STUDIO'); setCart([]); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                      posBranch === 'NAO_STUDIO' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>NAO Studio</span>
                  </button>
                  <button
                    onClick={() => { setPosBranch('DIAEL_BEAUTY'); setCart([]); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                      posBranch === 'DIAEL_BEAUTY' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5 text-slate-600" />
                    <span>DIAEL Beauty</span>
                  </button>
                </div>
              )}
              
              {user.role === 'SALON_MANAGER' && (
                <span className="text-xs bg-amber-50 text-[#D4AF37] font-semibold border border-amber-100 px-3 py-1.5 rounded-xl flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  {posBranch === 'NAO_STUDIO' ? 'NAO Studio Registry' : 'DIAEL Beauty Registry'}
                </span>
              )}
            </div>
          </div>

          {/* Search tool */}
          <div className="relative my-4 shrink-0">
            <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search catalog by service or product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 focus:border-[#D4AF37] text-slate-800"
            />
          </div>

          {/* Catalog grid */}
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {catalog.map((item) => {
                const isService = item.type === 'service';
                const lowStock = !isService && (item as Product).stock <= (item as Product).minStock;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      addToCart(item);
                      // Auto switch tab to cart on mobile for immediate visual confirmation
                      if (window.innerWidth < 1280) {
                        setMobileTab('cart');
                      }
                    }}
                    className="p-4 bg-slate-50 hover:bg-[#FDFBF7] active:bg-[#FDFBF7] border border-slate-100 hover:border-[#D4AF37]/50 active:border-[#D4AF37]/50 rounded-2xl text-left transition-all relative flex flex-col justify-between h-40 sm:h-36 cursor-pointer group shadow-xs hover:shadow-md touch-manipulation active:scale-[0.98]"
                  >
                    <div>
                      <span className={`text-[8px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded-full ${
                        isService ? 'bg-[#D4AF37]/10 text-[#D4AF37]' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {isService ? 'Service' : 'Product'}
                      </span>
                      <h4 className="text-xs font-bold text-slate-800 mt-2 line-clamp-2 leading-snug">
                        {item.name}
                      </h4>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 w-full">
                      <span className="text-xs font-bold font-mono text-[#D4AF37]">{formatIDR(item.price)}</span>
                      {isService ? (
                        <span className="text-[9px] text-slate-400 font-mono">{(item as Service).duration} mins</span>
                      ) : (
                        <span className={`text-[9px] font-mono font-bold ${lowStock ? 'text-rose-500 bg-rose-50 px-1.5 rounded' : 'text-slate-400'}`}>
                          {lowStock ? 'Low Stock' : `${(item as Product).stock} in stock`}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right panel: Active Receipt Cart */}
        <div className={`xl:col-span-5 flex flex-col h-full bg-slate-900 text-white rounded-3xl p-5 overflow-hidden shadow-2xl relative transition-all duration-300 ${
          mobileTab === 'cart' ? 'flex animate-fade-in' : 'hidden xl:flex'
        }`}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#D4AF37]" />
              <h3 className="text-sm font-bold text-white font-serif">Active Cart Register</h3>
            </div>
            <span className="text-xs font-mono text-slate-400 font-bold">{cart.length} items</span>
          </div>

          {/* Customer Select / Add Section */}
          <div className="py-4 border-b border-slate-800 shrink-0">
            {!showAddCustomer ? (
              <>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">CUSTOMER FOR SALE</label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl text-xs px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  >
                    {activeCustomers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => setShowAddCustomer(true)}
                  className="mt-5 p-2 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 hover:border-[#D4AF37] transition-all cursor-pointer text-[#D4AF37]"
                  title="Register New Client"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>

              {/* Membership status for the selected customer */}
              {selectedCustomer && (
                selectedCustomer.isMember ? (
                  <div className="mt-2 flex items-center gap-1.5 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-lg px-2.5 py-1.5">
                    <Sparkles className="w-3 h-3 text-[#D4AF37] shrink-0" />
                    <span className="text-[10px] text-[#D4AF37] font-bold font-mono uppercase">
                      {MEMBERSHIP_TIERS[getMembershipTier(selectedCustomer.visitsCount)].label} Member
                    </span>
                    <span className="text-[10px] text-slate-400">· Diskon {MEMBERSHIP_DISCOUNT_PERCENT}% otomatis diterapkan</span>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-between gap-2 bg-slate-800/50 border border-slate-700/50 rounded-lg px-2.5 py-1.5">
                    <span className="text-[10px] text-slate-400">Bukan member</span>
                    <button
                      onClick={() => onActivateMembership(selectedCustomer.id)}
                      className="text-[10px] font-bold text-[#D4AF37] hover:text-amber-400 cursor-pointer flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      Jadikan Member
                    </button>
                  </div>
                )
              )}
              </>
            ) : (
              <form onSubmit={handleCreateCustomerSubmit} className="space-y-2 bg-slate-800/50 p-3 rounded-2xl border border-slate-700/60">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-mono font-bold">ADD NEW CUSTOMER</span>
                  <button 
                    type="button" 
                    onClick={() => setShowAddCustomer(false)}
                    className="text-[10px] text-rose-400 font-mono font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="Full Name"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg text-xs px-2.5 py-1.5 text-white"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Phone"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg text-xs px-2.5 py-1.5 text-white"
                  />
                  <input
                    type="email"
                    placeholder="Email (Optional)"
                    value={newCustEmail}
                    onChange={(e) => setNewCustEmail(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg text-xs px-2.5 py-1.5 text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-[#D4AF37] text-[#1a1c1e] text-[11px] font-bold py-1.5 rounded-lg hover:bg-amber-400 cursor-pointer"
                >
                  Save & Select Customer
                </button>
              </form>
            )}
          </div>

          {/* Cart items list */}
          <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 py-12">
                <ShoppingBag className="w-10 h-10 text-slate-700 mb-3" />
                <p className="text-xs text-center font-mono">Receipt register is empty.<br/>Click services or products to sell.</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.id + item.type} className="bg-slate-800/40 p-3 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h5 className="text-xs font-bold text-white truncate">{item.name}</h5>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-400 font-mono">{formatIDR(item.price)} each</span>
                        {(item.discountValue || 0) > 0 && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 font-mono font-semibold">
                            -{item.discountType === 'percent' ? `${item.discountValue}%` : formatIDR(item.discountValue)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={() => removeFromCart(item.id, item.type)}
                      className="p-2 -m-2 text-slate-500 hover:text-rose-400 active:text-rose-400 cursor-pointer transition-all touch-manipulation shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Therapist Assignment for services */}
                  {item.type === 'service' && (
                    <div className="flex items-center gap-1.5 bg-slate-800/60 p-1.5 rounded-lg border border-slate-700/50">
                      <label className="text-[9px] text-slate-400 font-mono truncate">Therapist:</label>
                      <select
                        value={item.therapistId || ''}
                        onChange={(e) => updateServiceTherapist(item.id, e.target.value)}
                        className="flex-1 bg-transparent border-0 text-[10px] text-slate-300 focus:outline-none focus:ring-0 p-0"
                      >
                        {activeTherapists.map(t => (
                          <option key={t.id} value={t.id} className="bg-slate-800 text-white">{t.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Per-Item Discount Controls */}
                  <div className="flex items-center justify-between gap-2 bg-slate-900/60 px-2.5 py-1.5 rounded-xl border border-slate-850">
                    <span className="text-[10px] text-slate-400 font-mono font-medium">Item Discount</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        value={item.discountValue || ''}
                        onChange={(e) => updateItemDiscount(item.id, item.type, Math.max(0, Number(e.target.value)), item.discountType || 'flat')}
                        placeholder="0"
                        className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-1.5 text-center text-[11px] text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      />
                      <select
                        value={item.discountType || 'flat'}
                        onChange={(e) => updateItemDiscount(item.id, item.type, item.discountValue || 0, e.target.value as 'percent' | 'flat')}
                        className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1.5 text-[9px] text-slate-300 focus:outline-none cursor-pointer"
                      >
                        <option value="flat">IDR (Rp)</option>
                        <option value="percent">Percent (%)</option>
                      </select>
                    </div>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-400 font-mono">Quantity</span>
                    <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                      <button 
                        onClick={() => updateQuantity(item.id, item.type, -1)}
                        className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-white active:bg-slate-700 rounded-md cursor-pointer touch-manipulation"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-bold font-mono px-2 text-white min-w-[1.5rem] text-center">{item.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.id, item.type, 1)}
                        className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-white active:bg-slate-700 rounded-md cursor-pointer touch-manipulation"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Receipt Totals / Checkout footer */}
          <div className="pt-4 border-t border-slate-800 space-y-3 shrink-0">
            {/* Invoice discount and Payment controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-800/30 p-2.5 rounded-xl border border-slate-800/80">
              <div className="sm:col-span-2">
                <label className="text-[9px] text-slate-400 font-mono block mb-1">INVOICE DISCOUNT</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={invoiceDiscountValue || ''}
                    onChange={(e) => setInvoiceDiscountValue(Math.max(0, Number(e.target.value)))}
                    placeholder="0"
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg text-xs px-2 py-2.5 text-white text-center font-mono focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  />
                  <select
                    value={invoiceDiscountType}
                    onChange={(e) => setInvoiceDiscountType(e.target.value as 'percent' | 'flat')}
                    className="bg-slate-800 border border-slate-700 rounded-lg text-xs px-2 py-1.5 text-slate-300 focus:outline-none cursor-pointer"
                  >
                    <option value="flat">IDR (Rp)</option>
                    <option value="percent">Percent (%)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[9px] text-slate-400 font-mono block mb-1">PAYMENT TYPE</label>
                <select
                  value={paymentMethod}
                  onChange={(e: any) => setPaymentMethod(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg text-xs px-2 py-2.5 text-white focus:outline-none cursor-pointer"
                >
                  <option value="card">Card</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="e_wallet">E-Wallet</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-slate-400 font-mono">
              <div className="flex justify-between">
                <span>Gross Subtotal:</span>
                <span className="text-white">{formatIDR(subtotal)}</span>
              </div>
              {itemDiscountsTotal > 0 && (
                <div className="flex justify-between">
                  <span>Item Discounts:</span>
                  <span className="text-rose-400">-{formatIDR(itemDiscountsTotal)}</span>
                </div>
              )}
              {invoiceDiscountAmount > 0 && (
                <div className="flex justify-between">
                  <span>Invoice Discount:</span>
                  <span className="text-rose-400">-{formatIDR(invoiceDiscountAmount)}</span>
                </div>
              )}
              {membershipDiscountAmount > 0 && (
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-[#D4AF37]" />Membership Discount ({MEMBERSHIP_DISCOUNT_PERCENT}%):</span>
                  <span className="text-rose-400">-{formatIDR(membershipDiscountAmount)}</span>
                </div>
              )}
              {totalDiscount > 0 && (
                <div className="flex justify-between">
                  <span>Total Discount Applied:</span>
                  <span className="text-rose-400 font-bold">-{formatIDR(totalDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-slate-800 text-white">
                <span className="text-[#D4AF37]">Total Charge:</span>
                <span className="text-[#D4AF37]">{formatIDR(total)}</span>
              </div>
            </div>

            {checkoutError && (
              <div className="mb-3 p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs space-y-2">
                <p>{checkoutError}</p>
                <button
                  onClick={() => handleCheckout(true)}
                  disabled={isCheckingOut}
                  className="w-full font-bold text-xs py-2 rounded-lg bg-rose-800/60 hover:bg-rose-700/60 text-white transition-colors cursor-pointer touch-manipulation disabled:opacity-50"
                >
                  {isCheckingOut ? 'Mencoba lagi...' : 'Coba Lagi'}
                </button>
              </div>
            )}

            <button
              onClick={() => handleCheckout(false)}
              disabled={cart.length === 0 || isCheckingOut}
              className={`w-full font-bold text-xs py-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer touch-manipulation ${
                cart.length > 0 && !isCheckingOut
                  ? 'bg-[#D4AF37] hover:bg-amber-400 active:bg-amber-400 active:scale-[0.98] text-[#1a1c1e]' 
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              }`}
            >
              <CheckCircle className="w-4 h-4" />
              <span>{isCheckingOut ? 'Processing...' : 'Process Payment & Register'}</span>
            </button>
          </div>
        </div>

      </div>

      {/* Invoice Modal Overlay */}
      {showInvoice && lastCreatedInvoice && (
        <div className="fixed inset-0 bg-[#1a1c1e]/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in">
          <div className="bg-slate-100 rounded-3xl p-6 max-w-md w-full border border-slate-200/50 shadow-2xl relative flex flex-col space-y-4 max-h-[95vh]">
            <div className="flex items-center justify-between no-print border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-[#D4AF37]" />
                Transaksi Berhasil
              </h3>
              <button
                onClick={() => setShowInvoice(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 pr-1 py-2 space-y-4">
              <InvoiceTemplate
                transaction={lastCreatedInvoice}
                branchProfile={currentBranchProfile || undefined}
              />

              {/* Share & Download Actions Widget */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4 shadow-xs no-print">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Bagikan / Unduh Gambar</span>
                  {isGeneratingImage && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D4AF37]" />}
                </div>

                {isGeneratingImage ? (
                  <div className="flex flex-col items-center justify-center py-4 space-y-2 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" />
                    <span className="text-[10px] text-slate-500 font-bold leading-normal">
                      Membuat gambar invoice untuk dibagikan...
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {/* Primary Action Button */}
                    {canShareFiles ? (
                      <button
                        onClick={handleShareWhatsApp}
                        disabled={!pngBlob}
                        className="w-full bg-[#25D366] hover:bg-[#20ba5a] text-white font-sans text-xs font-bold py-3 rounded-xl cursor-pointer transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-60"
                      >
                        <Share2 className="w-4 h-4" />
                        <span>Bagikan ke WhatsApp</span>
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleDownloadImage('png')}
                            disabled={!pngDataUrl}
                            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-sans text-xs font-bold py-3 rounded-xl cursor-pointer transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-60"
                          >
                            <Download className="w-4 h-4" />
                            <span>Download PNG</span>
                          </button>
                          <a
                            href={getWhatsAppShareLink()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full bg-[#25D366] hover:bg-[#20ba5a] text-white font-sans text-xs font-bold py-3 rounded-xl cursor-pointer transition-all shadow-md flex items-center justify-center gap-1.5 text-center"
                          >
                            <MessageSquare className="w-4 h-4" />
                            <span>Buka WhatsApp</span>
                          </a>
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed bg-slate-50 border border-slate-200/40 p-2.5 rounded-xl">
                          <strong>Petunjuk:</strong> Unduh file invoice (PNG) terlebih dahulu dengan tombol <strong>Download PNG</strong>, lalu ketuk <strong>Buka WhatsApp</strong> untuk mengirim chat ke pelanggan dan lampirkan gambarnya secara manual.
                        </p>
                      </div>
                    )}

                    {/* Secondary Always-Available Download Options */}
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Format Gambar Lainnya</span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleDownloadImage('png')}
                          disabled={!pngDataUrl}
                          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-[10px] font-bold cursor-pointer transition-all disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Unduh PNG</span>
                        </button>
                        <button
                          onClick={() => handleDownloadImage('jpeg')}
                          disabled={!jpegDataUrl}
                          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-[10px] font-bold cursor-pointer transition-all disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Unduh JPG</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setShowInvoice(false)}
              className="w-full bg-[#1a1c1e] hover:bg-slate-800 text-white font-sans text-xs font-bold py-3 rounded-xl cursor-pointer transition-all shadow-md no-print"
            >
              Tutup Invoice
            </button>
          </div>
        </div>
      )}

      {/* Offscreen Container for Image Generation */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', pointerEvents: 'none' }} className="no-print">
        <div id="invoice-capture-container" className="bg-white p-6" style={{ width: '380px' }}>
          {lastCreatedInvoice && (
            <InvoiceTemplate
              transaction={lastCreatedInvoice}
              branchProfile={currentBranchProfile || undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}
