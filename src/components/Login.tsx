import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider,
  sendPasswordResetEmail,
  updatePassword
} from '../lib/authClient';
import { doc, getDoc, setDoc } from '../lib/firestoreClient';
import { auth, db, secondaryAuth, handleFirestoreError, OperationType } from '../lib/firebase';
import { PRESET_USERS } from '../data/mockData';
import { User, Role, Branch } from '../types';
import { 
  ShieldCheck, 
  Mail, 
  Lock, 
  User as UserIcon, 
  Briefcase, 
  MapPin, 
  Loader2, 
  LogIn, 
  UserPlus 
} from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
  usersList?: User[];
}

export default function Login({ onLoginSuccess, usersList = PRESET_USERS }: LoginProps) {
  // Tabs: 'signin' or 'register' or 'forgot'
  const [activeTab, setActiveTab] = useState<'signin' | 'register' | 'forgot'>('signin');
  
  // Form inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('THERAPIST');
  const [branch, setBranch] = useState<Branch>('NAO_STUDIO');
  
  // Async states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState('');
  
  // Force password change states
  const [mustChangePasswordUser, setMustChangePasswordUser] = useState<{ uid: string; profile: User } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // "Complete Profile" flow state (used after external logins like Google if no doc exists)
  const [pendingProfileUser, setPendingProfileUser] = useState<{ uid: string; email: string; displayName?: string } | null>(null);

  // Helper to lookup and link preset users by email
  const getPresetUserByEmail = (userEmail: string): User | undefined => {
    return usersList.find(u => u.email.toLowerCase() === userEmail.toLowerCase().trim());
  };

  // Helper to fetch or create a user profile document in Firestore
  const handleUserProfileRetrieval = async (firebaseUid: string, firebaseEmail: string, displayName?: string) => {
    const userDocRef = doc(db, 'users', firebaseUid);
    let userSnap;
    try {
      userSnap = await getDoc(userDocRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${firebaseUid}`);
      return;
    }

    if (userSnap.exists()) {
      // Profile exists, log in successfully
      const profileData = userSnap.data() as User;
      if (profileData.forcePasswordChange) {
        setMustChangePasswordUser({
          uid: firebaseUid,
          profile: profileData
        });
      } else {
        onLoginSuccess(profileData);
      }
    } else {
      // Check if this email belongs to a PRESET_USERS account
      const preset = getPresetUserByEmail(firebaseEmail);
      if (preset) {
        // Automatically provision and save their preset profile under this Firebase UID
        const newProfile: User = {
          id: firebaseUid,
          username: preset.username,
          name: preset.name,
          role: preset.role,
          branch: preset.branch,
          email: firebaseEmail,
          avatar: preset.avatar || `https://i.pravatar.cc/150?u=${preset.username}`
        };
        try {
          await setDoc(userDocRef, newProfile);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUid}`);
          return;
        }
        onLoginSuccess(newProfile);
      } else {
        // No preset found, request the user to complete their profile registration
        setPendingProfileUser({
          uid: firebaseUid,
          email: firebaseEmail,
          displayName: displayName || ''
        });
      }
    }
  };

  // 1. Handlers for Email & Password Sign In
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const firebaseUser = userCredential.user;
      await handleUserProfileRetrieval(firebaseUser.uid, firebaseUser.email || '', firebaseUser.displayName || '');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password. Please verify your credentials.');
      } else {
        setError(err.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 2. Handlers for Email & Password Registration
  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validations
    if (username.length < 3 || username.length > 30) {
      setError('Username must be between 3 and 30 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
      setError('Username must contain only letters, numbers, underscores, and hyphens.');
      return;
    }
    if (fullName.length < 2 || fullName.length > 50) {
      setError('Full Name must be between 2 and 50 characters.');
      return;
    }

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const firebaseUser = userCredential.user;
      
      const newProfile: User = {
        id: firebaseUser.uid,
        username: username.trim().toLowerCase(),
        name: fullName.trim(),
        role: role,
        branch: branch,
        email: email.trim().toLowerCase(),
        avatar: `https://i.pravatar.cc/150?u=${username}`
      };
      
      // Save profile to Firestore. MUST be a merge write: /api/auth/register
      // already created the account with a passwordHash, and a non-merge
      // setDoc does a full document replace server-side - since newProfile
      // here has no passwordHash field, a plain setDoc would silently wipe
      // the password that was just set, locking the new account out on its
      // very next login attempt.
      try {
        await setDoc(doc(db, 'users', firebaseUser.uid), newProfile, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}`);
        return;
      }
      
      onLoginSuccess(newProfile);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('This email address is already registered. Please sign in instead.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else {
        setError(err.message || 'Registration failed. Please check your network and settings.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 3. Google Login Sign In
  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    const provider = new GoogleAuthProvider();
    
    try {
      const userCredential = await signInWithPopup(auth, provider);
      const firebaseUser = userCredential.user;
      await handleUserProfileRetrieval(firebaseUser.uid, firebaseUser.email || '', firebaseUser.displayName || '');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Google Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  // 3b. Handler for Password Reset
  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetSent(false);
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
        setError('No registered account found with this email.');
      } else {
        setError(err.message || 'Failed to send password reset email.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 3c. Seeder helper to set up all default PRESET_USERS in Firebase Auth
  const handleSeedPresetUsers = async () => {
    if (!(import.meta as any).env?.DEV) return;
    setSeeding(true);
    setError('');
    setSeedSuccess('');
    try {
      for (const preset of PRESET_USERS) {
        try {
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, preset.email, "hka123456");
          const firebaseUser = userCredential.user;
          const newProfile: User = {
            id: firebaseUser.uid,
            username: preset.username,
            name: preset.name,
            role: preset.role,
            branch: preset.branch,
            email: preset.email,
            avatar: preset.avatar || `https://i.pravatar.cc/150?u=${preset.username}`
          };
          // Merge, not replace - same reasoning as the main registration
          // flow: a non-merge setDoc would wipe the passwordHash that
          // createUserWithEmailAndPassword just set.
          await setDoc(doc(db, 'users', firebaseUser.uid), newProfile, { merge: true });
        } catch (err: any) {
          if (err.code === 'auth/email-already-in-use') {
            console.log(`Auth user for ${preset.email} already exists.`);
          } else if (err.code === 'auth/operation-not-allowed') {
            throw new Error("Email/Password authentication provider is currently disabled in your Firebase Project. Please navigate to the Firebase Console -> Build -> Authentication -> Sign-in Method, and enable the 'Email/Password' sign-in provider.");
          } else {
            console.error(`Error seeding preset user ${preset.email}: `, err);
            throw err;
          }
        }
      }
      setSeedSuccess(`Default staff credentials have been initialized! Default password: hka123456`);
    } catch (err: any) {
      setError(err.message || 'Seeding failed. Please check your Firebase configuration.');
    } finally {
      setSeeding(false);
    }
  };

  const handleForcePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (newPassword.length < 6) {
      setError('Password baru minimal 6 karakter.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Password konfirmasi tidak cocok.');
      return;
    }
    
    setLoading(true);
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        
        // Update forcePasswordChange flag to false in Firestore
        await setDoc(doc(db, 'users', mustChangePasswordUser!.uid), {
          forcePasswordChange: false
        }, { merge: true });
        
        const updatedProfile = {
          ...mustChangePasswordUser!.profile,
          forcePasswordChange: false
        };
        
        setMustChangePasswordUser(null);
        onLoginSuccess(updatedProfile as User);
      } else {
        setError('Pengguna tidak aktif di Firebase Auth.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal mengubah password. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Complete pending profile registration (Google first-time flow)
  const handleCompleteProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingProfileUser) return;
    setError('');

    // Validations
    if (username.length < 3 || username.length > 30) {
      setError('Username must be between 3 and 30 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
      setError('Username must contain only letters, numbers, underscores, and hyphens.');
      return;
    }
    if (fullName.length < 2 || fullName.length > 50) {
      setError('Full Name must be between 2 and 50 characters.');
      return;
    }

    setLoading(true);
    const newProfile: User = {
      id: pendingProfileUser.uid,
      username: username.trim().toLowerCase(),
      name: fullName.trim(),
      role: role,
      branch: branch,
      email: pendingProfileUser.email,
      avatar: `https://i.pravatar.cc/150?u=${username}`
    };

    try {
      // Merge, not replace - same reasoning as the main registration flow.
      await setDoc(doc(db, 'users', pendingProfileUser.uid), newProfile, { merge: true });
      onLoginSuccess(newProfile);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${pendingProfileUser.uid}`);
    } finally {
      setLoading(false);
    }
  };

  if (mustChangePasswordUser) {
    return (
      <div id="login-container" className="min-h-screen bg-[#f8f6f2] flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-[#e5dfd5] p-8 flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#D4AF37] to-[#F3E5AB] flex items-center justify-center">
              <span className="font-serif font-extrabold text-[#1a1c1e] text-sm">H</span>
            </div>
            <span className="font-sans font-bold tracking-tight text-slate-800 text-sm">HKA Engine</span>
          </div>

          <h2 className="text-xl font-bold text-slate-800 mb-2">Ganti Password Wajib</h2>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Administrator Anda telah menyetel ulang password Anda. Anda harus mengubah password sebelum melanjutkan.
          </p>

          <form onSubmit={handleForcePasswordChangeSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Password Baru</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  placeholder="Minimal 6 karakter"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Konfirmasi Password Baru</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  placeholder="Ulangi password baru"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-slate-800"
                />
              </div>
            </div>

            {error && <p className="text-xs font-medium text-rose-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1a1c1e] hover:bg-slate-800 disabled:bg-slate-400 text-white font-medium text-xs py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <span>Simpan & Lanjutkan</span>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div id="login-container" className="min-h-screen bg-[#f8f6f2] flex flex-col items-center justify-center p-6 font-sans">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-[#e5dfd5] grid md:grid-cols-12 overflow-hidden">
        
        {/* Left column: Visual Luxury Branding */}
        <div className="md:col-span-5 bg-[#1a1c1e] text-white p-8 md:p-12 flex flex-col justify-between relative overflow-hidden">
          {/* Subtle geometric circles */}
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-[#D4AF37]/5 blur-xl"></div>
          <div className="absolute -bottom-20 -left-10 w-60 h-60 rounded-full bg-[#D4AF37]/5 blur-2xl"></div>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#D4AF37] to-[#F3E5AB] flex items-center justify-center">
              <span className="font-serif font-extrabold text-[#1a1c1e] text-sm">H</span>
            </div>
            <span className="font-sans font-bold tracking-tight text-white text-sm">HKA Management</span>
          </div>

          <div className="my-12">
            <h1 className="text-3xl font-serif text-[#D4AF37] font-medium leading-tight mb-4 animate-fade-in">
              Beauty Operational Engine
            </h1>
            <p className="text-xs text-slate-300 leading-relaxed">
              Durable cross-branch system coordinating Point-of-Sale, resource allocation, and unified bookings. Engineered for NAO Studio & DIAEL Beauty Center.
            </p>
          </div>

          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 pt-4 border-t border-slate-800">
            <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
            <span>Secure Enterprise Salon OS</span>
          </div>
        </div>

        {/* Right column: Secure Firebase Login */}
        <div className="md:col-span-7 p-8 md:p-12 flex flex-col justify-center min-h-[500px]">
          {pendingProfileUser ? (
            /* Complete Profile Wizard */
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Complete Your Profile</h2>
                <p className="text-xs text-slate-500 mt-1">Please provide your details to finish setting up your account.</p>
              </div>

              <form onSubmit={handleCompleteProfileSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Full Name</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Elena Rostova"
                      value={fullName || pendingProfileUser.displayName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Username</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. elena_r"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Role</label>
                    <div className="relative">
                      <Briefcase className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as Role)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-slate-800 appearance-none bg-white"
                      >
                        <option value="THERAPIST">Therapist</option>
                        <option value="SALON_MANAGER">Salon Manager</option>
                        <option value="HKA_MANAGEMENT">HKA Management</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Branch</label>
                    <div className="relative">
                      <MapPin className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <select
                        value={branch}
                        onChange={(e) => setBranch(e.target.value as Branch)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-slate-800 appearance-none bg-white"
                      >
                        <option value="NAO_STUDIO">Nao Studio</option>
                        <option value="DIAEL_BEAUTY">Diael Beauty</option>
                        <option value="ALL">All Branches</option>
                      </select>
                    </div>
                  </div>
                </div>

                {error && <p className="text-xs font-medium text-rose-500">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#1a1c1e] hover:bg-slate-800 disabled:bg-slate-400 text-white font-medium text-xs py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Create Account Profile</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            /* Main Authentication Forms */
            <div>
              {/* Tab Selector */}
              {activeTab !== 'forgot' && (
                <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-8">
                  <button
                    onClick={() => { setActiveTab('signin'); setError(''); }}
                    className={`flex-1 py-2.5 text-center text-xs font-semibold rounded-xl transition-all cursor-pointer ${activeTab === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => { setActiveTab('register'); setError(''); }}
                    className={`flex-1 py-2.5 text-center text-xs font-semibold rounded-xl transition-all cursor-pointer ${activeTab === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Register Staff
                  </button>
                </div>
              )}

              {activeTab === 'forgot' ? (
                /* Forgot Password Form */
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono mb-1">Reset Password</h2>
                    <p className="text-xs text-slate-500 mb-4">Enter your registered email address and we will send you a secure link to reset your password.</p>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        required
                        placeholder="e.g. hana@hka-management.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-slate-800"
                      />
                    </div>
                  </div>

                  {error && <p className="text-xs font-medium text-rose-500">{error}</p>}
                  {resetSent && (
                    <p className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 p-3 rounded-xl">
                      A password reset link has been sent to your email. Please check your inbox or spam folder.
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#1a1c1e] hover:bg-slate-800 disabled:bg-slate-400 text-white font-medium text-xs py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <span>Send Reset Link</span>
                    )}
                  </button>

                  <div className="text-center mt-4">
                    <button
                      type="button"
                      onClick={() => { setActiveTab('signin'); setError(''); setResetSent(false); }}
                      className="text-xs font-semibold text-[#D4AF37] hover:underline cursor-pointer"
                    >
                      Back to Sign In
                    </button>
                  </div>
                </form>
              ) : activeTab === 'signin' ? (
                /* Sign In Form */
                <form onSubmit={handleEmailSignIn} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        required
                        placeholder="e.g. hana@hka-management.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700 block">Security Password</label>
                      <button
                        type="button"
                        onClick={() => { setActiveTab('forgot'); setError(''); }}
                        className="text-[10px] font-semibold text-[#D4AF37] hover:underline cursor-pointer"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-slate-800"
                      />
                    </div>
                  </div>

                  {error && <p className="text-xs font-medium text-rose-500">{error}</p>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#1a1c1e] hover:bg-slate-800 disabled:bg-slate-400 text-white font-medium text-xs py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        <span>Verify and Login</span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* Register Form */
                <form onSubmit={handleEmailRegister} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Full Name</label>
                      <div className="relative">
                        <UserIcon className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          placeholder="Elena Rostova"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-slate-800"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Username</label>
                      <div className="relative">
                        <UserIcon className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          placeholder="elena_r"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-slate-800"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        required
                        placeholder="elena.r@diaelbeauty.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="password"
                        required
                        placeholder="Min 6 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Role</label>
                      <div className="relative">
                        <Briefcase className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                        <select
                          value={role}
                          onChange={(e) => setRole(e.target.value as Role)}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-slate-800 appearance-none bg-white"
                        >
                          <option value="THERAPIST">Therapist</option>
                          <option value="SALON_MANAGER">Salon Manager</option>
                          <option value="HKA_MANAGEMENT">HKA Management</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Branch</label>
                      <div className="relative">
                        <MapPin className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                        <select
                          value={branch}
                          onChange={(e) => setBranch(e.target.value as Branch)}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-slate-800 appearance-none bg-white"
                        >
                          <option value="NAO_STUDIO">Nao Studio</option>
                          <option value="DIAEL_BEAUTY">Diael Beauty</option>
                          <option value="ALL">All Branches</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {error && <p className="text-xs font-medium text-rose-500">{error}</p>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#1a1c1e] hover:bg-slate-800 disabled:bg-slate-400 text-white font-medium text-xs py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        <span>Register Account</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Social authentication option */}
              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-100"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-4 text-slate-400 font-medium">Or continue with</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-xs py-3 rounded-xl transition-all flex items-center justify-center gap-3 cursor-pointer shadow-sm hover:shadow-md"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                  <g transform="matrix(1, 0, 0, 1, 0, 0)">
                    <path d="M21.35,11.1H12v2.7h5.38C16.88,15.22,14.77,16.5,12,16.5c-3.04,0-5.61-2.05-6.53-4.82C5.23,11.07,5.1,10.45,5.1,9.8s0.13-1.27,0.37-1.88c0.92-2.77,3.49-4.82,6.53-4.82c1.72,0,3.27,0.64,4.47,1.69L18.4,2.77C16.7,1.19,14.47,0.2,12,0.2C7.3,0.2,3.31,2.87,1.4,6.78C1.04,7.49,0.76,8.26,0.59,9.07c-0.12,0.56-0.19,1.14-0.19,1.73s0.07,1.17,0.19,1.73c0.17,0.81,0.45,1.58,0.81,2.29c1.91,3.91,5.9,6.58,10.6,6.58c3.15,0,5.81-1.04,7.74-2.85c1.93-1.81,3.16-4.52,3.16-7.79C22.9,12,22.38,11.53,21.35,11.1z" fill="#4285F4" />
                  </g>
                </svg>
                <span>Sign in with Google</span>
              </button>

              {(import.meta as any).env?.DEV && (
                <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                  <button
                    type="button"
                    onClick={handleSeedPresetUsers}
                    disabled={seeding}
                    className="text-xs font-semibold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100/80 px-4 py-2 rounded-xl transition-all border border-amber-200/50 cursor-pointer w-full"
                  >
                    {seeding ? 'Seeding Default Staff...' : 'Seed Default Staff Accounts (hka123456)'}
                  </button>
                  {seedSuccess && (
                    <p className="text-[10px] text-emerald-600 font-medium mt-2 max-w-xs mx-auto">
                      {seedSuccess}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-6 text-center">
                <span className="text-[10px] text-slate-400 leading-relaxed max-w-xs block mx-auto">
                  Note: Email auth requires "Email/Password" enabled in the Firebase Console. Pre-configured accounts will link automatically upon Google sign-in.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
