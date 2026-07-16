import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from '../lib/firestoreClient';
import { ref, uploadBytes, getDownloadURL } from '../lib/storageClient';
import { db, storage } from '../lib/firebase';
import { BranchProfile, Branch } from '../types';
import { 
  Building2, 
  Upload, 
  Phone, 
  MapPin, 
  CreditCard, 
  FileText, 
  Check, 
  Loader2, 
  AlertCircle,
  Image as ImageIcon
} from 'lucide-react';

export default function BranchSettings() {
  const [selectedBranch, setSelectedBranch] = useState<'NAO_STUDIO' | 'DIAEL_BEAUTY'>('NAO_STUDIO');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states
  const [displayName, setDisplayName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [invoiceFooterNote, setInvoiceFooterNote] = useState('');
  const [bankInfo, setBankInfo] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  // Load branch profile whenever selectedBranch changes
  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setError('');
      setSuccess('');
      try {
        const docId = `branchProfile_${selectedBranch}`;
        const docRef = doc(db, 'settings', docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as BranchProfile;
          setDisplayName(data.displayName || '');
          setAddress(data.address || '');
          setPhone(data.phone || '');
          setInvoiceFooterNote(data.invoiceFooterNote || '');
          setBankInfo(data.bankInfo || '');
          setLogoUrl(data.logoUrl || '');
        } else {
          // Initialize with default template data if not found
          setDisplayName(selectedBranch === 'NAO_STUDIO' ? 'NAO Studio' : 'DIAEL Beauty');
          setAddress('');
          setPhone('');
          setInvoiceFooterNote('Terima kasih atas kunjungan Anda!');
          setBankInfo('');
          setLogoUrl('');
        }
      } catch (err: any) {
        console.error('Error loading branch profile:', err);
        setError('Gagal memuat profil cabang. Silakan coba lagi.');
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [selectedBranch]);

  // Handle Logo Upload
  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setSuccess('');

    // Limit to max 2MB
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('Ukuran file maksimal 2MB.');
      return;
    }

    // Only allow PNG and JPEG
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      setError('Format file harus berupa PNG atau JPEG/JPG.');
      return;
    }

    setUploading(true);
    try {
      // Save logo to path branchLogos/{branch}.png
      const storageRef = ref(storage, `branchLogos/${selectedBranch}.png`);
      
      // Upload metadata for content type
      const metadata = {
        contentType: file.type
      };

      const snapshot = await uploadBytes(storageRef, file, metadata);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      setLogoUrl(downloadUrl);
      setSuccess('Logo berhasil diunggah! Tekan "Simpan Perubahan" untuk menyimpan permanen.');
    } catch (err: any) {
      console.error('Error uploading logo:', err);
      setError(err.message || 'Gagal mengunggah logo ke Storage. Pastikan Anda masuk sebagai HKA_MANAGEMENT.');
    } finally {
      setUploading(false);
    }
  };

  // Handle Save Form
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!displayName.trim() || !address.trim() || !phone.trim() || !bankInfo.trim() || !invoiceFooterNote.trim()) {
      setError('Semua bidang wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      const docId = `branchProfile_${selectedBranch}`;
      const docRef = doc(db, 'settings', docId);

      const profileData: BranchProfile = {
        branch: selectedBranch,
        displayName: displayName.trim(),
        address: address.trim(),
        phone: phone.trim(),
        invoiceFooterNote: invoiceFooterNote.trim(),
        bankInfo: bankInfo.trim(),
        logoUrl: logoUrl || undefined
      };

      await setDoc(docRef, profileData);
      setSuccess(`Profil cabang ${selectedBranch === 'NAO_STUDIO' ? 'NAO Studio' : 'DIAEL Beauty'} berhasil disimpan.`);
    } catch (err: any) {
      console.error('Error saving branch profile:', err);
      // Show the server's actual reason (e.g. a genuine 403, a validation
      // error, a network failure) instead of always blaming HKA_MANAGEMENT
      // access - that hardcoded message previously fired for ANY failure,
      // including ones that had nothing to do with permissions.
      setError(err.message || 'Gagal menyimpan profil cabang. Silakan coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="branch-settings-root" className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-[#D4AF37]" />
            Pengaturan Cabang
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Konfigurasi identitas, detail kontak, informasi rekening, serta logo yang akan dicetak di struk / invoice pelanggan.
          </p>
        </div>

        {/* Branch Toggle */}
        <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex self-start md:self-auto shadow-sm">
          <button
            onClick={() => setSelectedBranch('NAO_STUDIO')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
              selectedBranch === 'NAO_STUDIO'
                ? 'bg-[#1a1c1e] text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            NAO Studio
          </button>
          <button
            onClick={() => setSelectedBranch('DIAEL_BEAUTY')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
              selectedBranch === 'DIAEL_BEAUTY'
                ? 'bg-[#1a1c1e] text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            DIAEL Beauty
          </button>
        </div>
      </div>

      {/* Main Form Box */}
      {loading ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center flex flex-col items-center justify-center space-y-4 shadow-sm">
          <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
          <p className="text-xs text-slate-500 font-medium">Memuat data profil cabang...</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden grid md:grid-cols-12">
          {/* Form Left Fields */}
          <div className="p-8 md:col-span-8 space-y-6 border-b md:border-b-0 md:border-r border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-[#D4AF37] rounded-full"></span>
              Informasi Umum Cabang
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Nama Tampilan Cabang</label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="Contoh: NAO Studio Premium"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 focus:border-[#D4AF37] text-slate-800 font-medium"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">No. Telepon</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="Contoh: +62 812-3456-789"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 focus:border-[#D4AF37] text-slate-800 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Informasi Rekening Bank (Struk)</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="BCA 12345678 a/n PT HKA"
                      value={bankInfo}
                      onChange={(e) => setBankInfo(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 focus:border-[#D4AF37] text-slate-800 font-medium"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Alamat Lengkap</label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <textarea
                    required
                    rows={3}
                    placeholder="Masukkan alamat lengkap cabang..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 focus:border-[#D4AF37] text-slate-800 font-medium resize-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Catatan Kaki Struk (Footer Note)</label>
                <div className="relative">
                  <FileText className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <textarea
                    required
                    rows={2}
                    placeholder="Contoh: Barang/layanan yang dibeli tidak dapat ditukar atau dikembalikan."
                    value={invoiceFooterNote}
                    onChange={(e) => setInvoiceFooterNote(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 focus:border-[#D4AF37] text-slate-800 font-medium resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Notifications */}
            {error && (
              <div className="bg-rose-50 border border-rose-200/50 rounded-2xl p-4 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                <p className="text-xs text-rose-700 font-medium leading-relaxed">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-emerald-50 border border-emerald-200/50 rounded-2xl p-4 flex items-start gap-3">
                <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0 animate-bounce" />
                <p className="text-xs text-emerald-700 font-medium leading-relaxed">{success}</p>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
              <button
                type="submit"
                disabled={saving || uploading}
                className="bg-[#1a1c1e] hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-xs px-6 py-3 rounded-xl cursor-pointer transition-all shadow-md flex items-center gap-2 shrink-0"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Simpan Perubahan</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Logo Section Right Panel */}
          <div className="p-8 md:col-span-4 bg-slate-50/50 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-800 pb-3 border-b border-slate-100 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-[#D4AF37] rounded-full"></span>
                Logo Cabang
              </h3>

              {/* Logo Preview Container */}
              <div className="w-full aspect-square max-w-[200px] mx-auto bg-white rounded-2xl border border-slate-200 shadow-inner flex flex-col items-center justify-center p-4 relative overflow-hidden group">
                {logoUrl ? (
                  <>
                    <img
                      src={logoUrl}
                      alt="Logo Cabang"
                      className="max-h-full max-w-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                      <ImageIcon className="w-6 h-6 text-white" />
                    </div>
                  </>
                ) : (
                  <div className="text-center p-3">
                    <ImageIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <span className="text-[10px] text-slate-400 font-medium block">Logo belum diunggah</span>
                  </div>
                )}

                {uploading && (
                  <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" />
                    <span className="text-[10px] text-slate-500 font-semibold mt-1">Mengunggah...</span>
                  </div>
                )}
              </div>

              <div className="text-center">
                <label className="bg-white hover:bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-700 cursor-pointer shadow-xs inline-flex items-center gap-1.5 transition-all">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{logoUrl ? 'Ganti Logo' : 'Pilih Logo'}</span>
                  <input
                    type="file"
                    accept="image/png, image/jpeg"
                    onChange={handleLogoChange}
                    className="hidden"
                    disabled={uploading || saving}
                  />
                </label>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider mb-1.5">Ketentuan Logo</span>
              <ul className="text-[10px] text-slate-500 space-y-1.5 list-disc pl-4 font-medium leading-relaxed">
                <li>Format wajib <span className="font-semibold text-slate-700">PNG</span> atau <span className="font-semibold text-slate-700">JPG/JPEG</span>.</li>
                <li>Ukuran maksimal file <span className="font-semibold text-slate-700">2 MB</span>.</li>
                <li>Sangat disarankan logo transparan untuk hasil struk terbaik.</li>
              </ul>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
