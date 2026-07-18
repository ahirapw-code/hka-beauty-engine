import { useState, useEffect, useRef } from 'react';
import { User, Branch } from '../types';
import { doc, setDoc } from '../lib/firestoreClient';
import { ref, uploadBytes, getDownloadURL } from '../lib/storageClient';
import { db, storage } from '../lib/firebase';
import { 
  LayoutDashboard, 
  CreditCard, 
  CalendarDays, 
  Package, 
  Users, 
  LogOut, 
  Building2, 
  UserCheck,
  Target,
  Clock,
  Sliders,
  X,
  Coins,
  Wallet,
  Camera,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';


interface SidebarProps {
  user: User;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedBranch: Branch;
  setSelectedBranch: (branch: Branch) => void;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
  onUpdateOwnAvatar?: (avatarUrl: string) => void;
}

export default function Sidebar({
  user,
  activeTab,
  setActiveTab,
  selectedBranch,
  setSelectedBranch,
  onLogout,
  isOpen,
  onClose,
  onUpdateOwnAvatar
}: SidebarProps) {
  const isHKA = user.role === 'HKA_MANAGEMENT';
  const [isMobile, setIsMobile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file next time
    if (!file) return;

    setAvatarError('');

    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarError('Ukuran foto maksimal 5MB.');
      return;
    }
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setAvatarError('Format foto harus PNG, JPEG, atau WEBP.');
      return;
    }

    setUploadingAvatar(true);
    try {
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const storageRef = ref(storage, `avatars/${user.id}.${extension}`);
      const snapshot = await uploadBytes(storageRef, file, { contentType: file.type });
      const downloadUrl = await getDownloadURL(snapshot.ref);

      // Merge write only - a full replace here would wipe passwordHash and
      // other account fields the caller doesn't know about.
      await setDoc(doc(db, 'users', user.id), { avatar: downloadUrl }, { merge: true });

      onUpdateOwnAvatar?.(downloadUrl);
    } catch (err: any) {
      console.error('Error uploading avatar:', err);
      setAvatarError(err.message || 'Gagal mengunggah foto. Silakan coba lagi.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['HKA_MANAGEMENT', 'SALON_MANAGER'] },
    { id: 'pos', label: 'Point of Sale (POS)', icon: CreditCard, roles: ['HKA_MANAGEMENT', 'SALON_MANAGER', 'THERAPIST'] },
    { id: 'bookings', label: 'Bookings & Planner', icon: CalendarDays, roles: ['HKA_MANAGEMENT', 'SALON_MANAGER', 'THERAPIST'] },
    { id: 'erp', label: 'ERP & Inventory', icon: Package, roles: ['HKA_MANAGEMENT'] },
    { id: 'crm', label: 'CRM Clients', icon: Users, roles: ['HKA_MANAGEMENT', 'SALON_MANAGER'] },
    { id: 'attendance', label: 'Attendance Audit', icon: UserCheck, roles: ['HKA_MANAGEMENT', 'SALON_MANAGER'] },
    { id: 'payroll', label: 'Payroll & Komisi', icon: Coins, roles: ['HKA_MANAGEMENT', 'SALON_MANAGER'] },
    { id: 'my-payroll', label: 'Slip Gaji Saya', icon: Wallet, roles: ['SALON_MANAGER', 'THERAPIST'] },
    { id: 'branch-settings', label: 'Pengaturan Cabang', icon: Sliders, roles: ['HKA_MANAGEMENT'] },
    { id: 'therapist-target', label: 'My Target', icon: Target, roles: ['THERAPIST'] },
    { id: 'attendance-terminal', label: 'Attendance Terminal', icon: Clock, roles: ['SALON_MANAGER', 'THERAPIST'] },
  ];

  const allowedMenuItems = menuItems.filter(item => item.roles.includes(user.role));

  const getMenuItemLabel = (item: { id: string; label: string }) => {
    if (item.id === 'bookings' && user.role === 'THERAPIST') {
      return 'My Bookings';
    }
    return item.label;
  };

  const getBranchName = (b: Branch) => {
    if (b === 'NAO_STUDIO') return 'NAO Studio';
    if (b === 'DIAEL_BEAUTY') return 'DIAEL Beauty';
    return 'All Branches';
  };

  const sidebarContent = (
    <div className="flex flex-col h-full w-full">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#D4AF37] to-[#F3E5AB] flex items-center justify-center shadow-lg">
            <span className="font-serif font-extrabold text-[#1a1c1e] text-lg">H</span>
          </div>
          <div>
            <h1 className="font-sans font-bold tracking-tight text-white text-base">HKA Engine</h1>
            <span className="text-[10px] text-slate-400 font-mono tracking-wider">MANAGEMENT OS v1.0</span>
          </div>
        </div>
        {isMobile && (
          <button 
            id="mobile-sidebar-close"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-850 text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Profile & Access Details */}
      <div className="p-4 mx-3 my-4 bg-slate-900/50 rounded-xl border border-slate-800">
        <div className="flex items-center gap-3">
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={handleAvatarFileChange}
          />
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            title="Ubah foto profil (maks. 5MB)"
            className="relative w-10 h-10 shrink-0 rounded-full group cursor-pointer touch-manipulation disabled:cursor-wait"
          >
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full object-cover ring-2 ring-[#D4AF37]/50" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-[#D4AF37]">
                {user.name.charAt(0)}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploadingAvatar ? (
                <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5 text-white" />
              )}
            </div>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-xs font-semibold text-white truncate">{user.name}</h2>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-[#D4AF37] border border-amber-500/20">
                {user.role.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>
        {avatarError && (
          <p className="mt-2 text-[10px] text-rose-400 font-mono">{avatarError}</p>
        )}

        {/* Operational Scope */}
        <div className="mt-3 pt-3 border-t border-slate-800/80">
          <p className="text-[10px] text-slate-400 font-mono">OPERATIONAL SCOPE</p>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-200">
            <Building2 className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span className="font-medium truncate">{getBranchName(user.branch)}</span>
          </div>
        </div>
      </div>

      {/* Cross-Branch Switcher (HKA Only) */}
      {isHKA && (
        <div className="px-4 py-2 border-b border-slate-800/50 pb-4">
          <label className="text-[10px] text-slate-400 font-mono block mb-2">CROSS-BRANCH SELECTOR</label>
          <div className="grid grid-cols-1 gap-1">
            <button
              id="sidebar-branch-all"
              onClick={() => {
                setSelectedBranch('ALL');
                if (isMobile) onClose();
              }}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-all ${
                selectedBranch === 'ALL'
                  ? 'bg-slate-800 text-[#D4AF37] border border-amber-500/30'
                  : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
              }`}
            >
              <span>All Branches</span>
              <Building2 className="w-3 h-3" />
            </button>
            <button
              id="sidebar-branch-nao"
              onClick={() => {
                setSelectedBranch('NAO_STUDIO');
                if (isMobile) onClose();
              }}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-all ${
                selectedBranch === 'NAO_STUDIO'
                  ? 'bg-slate-800 text-[#D4AF37] border border-amber-500/30'
                  : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
              }`}
            >
              <span>NAO Studio</span>
            </button>
            <button
              id="sidebar-branch-diael"
              onClick={() => {
                setSelectedBranch('DIAEL_BEAUTY');
                if (isMobile) onClose();
              }}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-all ${
                selectedBranch === 'DIAEL_BEAUTY'
                  ? 'bg-slate-800 text-[#D4AF37] border border-amber-500/30'
                  : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
              }`}
            >
              <span>DIAEL Beauty</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Menu Navigation */}
      <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <span className="px-3 text-[10px] text-slate-400 font-mono block mb-2 uppercase tracking-wider">Operational Hub</span>
        {allowedMenuItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`sidebar-tab-${item.id}`}
              onClick={() => {
                setActiveTab(item.id);
                if (isMobile) onClose();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 relative ${
                isActive 
                  ? 'text-white bg-slate-800 shadow-md font-semibold' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/30'
              }`}
            >
              {isActive && (
                <motion.div 
                  layoutId="activeBar"
                  className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-[#D4AF37]"
                />
              )}
              <IconComponent className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#D4AF37]' : 'text-slate-400'}`} />
              <span>{getMenuItemLabel(item)}</span>
            </button>
          );
        })}
      </div>

      {/* Footer Log Out */}
      <div className="p-4 border-t border-slate-800 mt-auto">
        <button
          id="sidebar-logout"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Log Out</span>
        </button>
      </div>
    </div>
  );

  if (!isMobile) {
    return (
      <div id="hka-sidebar" className="w-64 bg-[#1a1c1e] text-slate-100 flex flex-col h-screen border-r border-slate-800 shrink-0">
        {sidebarContent}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="sidebar-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-40 backdrop-blur-xs"
          />

          {/* Drawer with slide & swipe gestures */}
          <motion.div
            key="sidebar-drawer"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            drag="x"
            dragConstraints={{ left: -256, right: 0 }}
            dragElastic={0.15}
            onDragEnd={(e, info) => {
              if (info.offset.x < -60 || info.velocity.x < -200) {
                onClose();
              }
            }}
            className="fixed inset-y-0 left-0 z-50 w-64 bg-[#1a1c1e] text-slate-100 flex flex-col h-screen border-r border-slate-800 shadow-2xl touch-pan-y"
          >
            {sidebarContent}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
