import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, ResetPassword, SignIn, SignUp, apiPost, useAuth, useClerk, useUser } from './lib/auth';
import {
  useCreateCoupon, useCreatePayoutRequest, useCreatePurchase, useGetBrands,
  useGetCouponPricing, useGetCoupons, useGetSellerCoupons, useGetSellerSummary,
  useGetTransactions, useGetPayoutRequests, useGetAdminPurchases,
  useGetAdminPayoutRequests, useReviewPurchase, useReviewPayoutRequest,
  getGetCouponsQueryKey, getGetSellerCouponsQueryKey, getGetSellerSummaryQueryKey,
  getGetTransactionsQueryKey, getGetPayoutRequestsQueryKey,
  getGetBrandsQueryKey, getGetCouponPricingQueryKey,
  getGetAdminPurchasesQueryKey, getGetAdminPayoutRequestsQueryKey,
} from '@workspace/api-client-react';
import type { CouponListing, CouponInput, Transaction, PayoutRequest, AdminPurchase, AdminPayoutRequest } from '@workspace/api-client-react';
import { Route, Switch, Router as WouterRouter, Link, useLocation } from 'wouter';
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, BadgeCheck, Banknote, Check,
  ChevronDown, CircleAlert, Clock3, CreditCard, Filter, HandCoins,
  HeartHandshake, LogOut, Menu, Search, ShieldCheck, Sparkles, Tag,
  TicketCheck, Wallet, X,
} from 'lucide-react';


const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const money = (value?: number | null) => `₹${(value ?? 0).toLocaleString('en-IN')}`;
const dateLabel = (date: string) => new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const statusLabel: Record<string, string> = {
  pending: 'Pending review', verified: 'Verified', rejected: 'Not approved',
  payout_requested: 'Payout requested', paid: 'Paid',
};

function Mark({ light = false }: { light?: boolean }) {
  return <Link href="/" data-testid="link-home" className={`brand-mark ${light ? 'brand-mark-light' : ''}`}><span className="mark-symbol">h.</span><span>helpay</span></Link>;
}

function SiteHeader({ compact = false }: { compact?: boolean }) {
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="site-header">
    <div className="header-inner">
      <Mark />
      <nav className="desktop-nav" aria-label="Main navigation">
        <Link href="/dashboard" data-testid="link-marketplace">Marketplace</Link>
        <Link href="/pricing" data-testid="link-pricing">How pricing works</Link>
        {isSignedIn && <Link href="/seller" data-testid="link-seller">My sales</Link>}
      </nav>
      <div className="header-actions">
        {isSignedIn ? <>
          <Link href="/profile" className="header-profile" data-testid="link-profile">My account <ArrowRight size={15}/></Link>
          <button className="icon-button hide-mobile" aria-label="Sign out" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out"><LogOut size={17}/></button>
        </> : <><Link className="text-link hide-mobile" href="/sign-in" data-testid="link-sign-in">Sign in</Link><Link className="btn btn-primary" href="/sign-up" data-testid="link-get-started">{compact ? 'Join helpay' : 'Get started'} <ArrowRight size={16}/></Link></>}
        <button className="icon-button mobile-menu" aria-label="Toggle menu" onClick={() => setMenuOpen(v => !v)} data-testid="button-menu">{menuOpen ? <X size={19}/> : <Menu size={19}/>}</button>
      </div>
    </div>
    {menuOpen && <div className="mobile-drawer">
      <Link href="/dashboard" onClick={() => setMenuOpen(false)}>Marketplace</Link><Link href="/pricing" onClick={() => setMenuOpen(false)}>How pricing works</Link>
      {isSignedIn ? <><Link href="/seller" onClick={() => setMenuOpen(false)}>My sales</Link><Link href="/profile" onClick={() => setMenuOpen(false)}>My account</Link></> : <><Link href="/sign-in" onClick={() => setMenuOpen(false)}>Sign in</Link><Link href="/sign-up" onClick={() => setMenuOpen(false)}>Create account</Link></>}
    </div>}
  </header>;
}

function Footer() {
  return <footer className="footer"><div className="footer-inner"><Mark light/><p>Good offers shouldn’t go to waste.<br/>ceo of c.j mahindra </p><div><Link href="/pricing">Pricing</Link><Link href="/sign-in">Sign in</Link><Link href="/sign-up">Join helpay</Link><Link href="/admin">Reviewer</Link></div><small>Transparent prices. Familiar brands. Offers shared fairly.</small></div></footer>;
}

function BottomNav() {
  const { isSignedIn } = useAuth();
  const [location] = useLocation();
  if (location.startsWith('/sign-in') || location.startsWith('/sign-up') || location.startsWith('/reset-password')) return null;
  const items = [
    { href: '/pricing', label: 'Pricing', icon: <Banknote size={19}/> },
    { href: isSignedIn ? '/upload' : '/sign-in', label: 'Upload', icon: <Tag size={19}/> },
    { href: isSignedIn ? '/seller' : '/sign-in', label: 'Seller', icon: <Wallet size={19}/> },
    { href: isSignedIn ? '/profile' : '/sign-in', label: 'Profile', icon: <CreditCard size={19}/> },
  ];
  return (
    <nav className="bottom-nav" aria-label="Helpay navigation">
      {items.map(item => <Link key={item.label} href={item.href} className="bottom-nav-item is-active font-extrabold text-[20px]" aria-current={location === item.href ? 'page' : undefined}>
        {item.icon}<span>{item.label}</span>
      </Link>)}
    </nav>
  );
}

function AuthLoading() {
  return <div className="loading-wrap"><div className="skeleton-block"/><div className="skeleton-line"/><div className="skeleton-line short"/></div>;
}

function Protected({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => { if (isLoaded && !isSignedIn) setLocation('/sign-in'); }, [isLoaded, isSignedIn, setLocation]);
  if (!isLoaded) return <AuthLoading />;
  if (!isSignedIn) return null;
  return <>{children}</>;
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => { if (isLoaded && isSignedIn) setLocation('/dashboard'); }, [isLoaded, isSignedIn, setLocation]);
  if (!isLoaded) return <AuthLoading />;
  return isSignedIn ? null : <Marketplace publicMode />;
}

function QueryState({ loading, error, retry, children }: { loading: boolean; error?: boolean; retry: () => void; children: ReactNode }) {
  if (loading) return <div className="coupon-grid">{[1,2,3].map(i => <div className="coupon-card skeleton-card" key={i}><div className="skeleton-line short"/><div className="skeleton-line"/><div className="skeleton-line short"/></div>)}</div>;
  if (error) return <div className="state-card error-state"><CircleAlert size={26}/><h3>We couldn’t load this just now.</h3><p>Your account and offers are safe. Try again in a moment.</p><button className="btn btn-primary" onClick={retry} data-testid="button-retry">Try again</button></div>;
  return <>{children}</>;
}

function CouponCard({ coupon, onBuy }: { coupon: CouponListing; onBuy: (coupon: CouponListing) => void }) {
  return <article className="coupon-card coupon-ticket" data-testid={`card-coupon-${coupon.id}`}>
    <div className="coupon-card-top"><span className="category-pill">{coupon.category === 'discount' ? 'Percentage off' : 'Coupon value'}</span><span className="expiry">Until {dateLabel(coupon.expiryDate)}</span></div>
    <div className="brand-avatar">{coupon.brand.slice(0,1).toUpperCase()}</div>
    <p className="coupon-brand">{coupon.brand}</p>
    <h3>{coupon.title}</h3>
    <div className="offer-value">{coupon.discountPercent ? `${coupon.discountPercent}%` : money(coupon.couponValue)} <span>{coupon.discountPercent ? 'off' : 'voucher value'}</span></div>
    <div className="coupon-bottom"><div><small>One-time price</small><strong>{money(coupon.salePrice)}</strong></div><button className="btn btn-accent" onClick={() => onBuy(coupon)} data-testid={`button-buy-${coupon.id}`}>Get this offer <ArrowRight size={15}/></button></div>
    <div className="fee-note"><ShieldCheck size={14}/> Coupon code shared after payment review</div>
  </article>;
}

function Marketplace({ publicMode = false }: { publicMode?: boolean }) {
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [activeCoupon, setActiveCoupon] = useState<CouponListing | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [purchaseDone, setPurchaseDone] = useState(false);
  const [reference, setReference] = useState('');
  const { isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  const params = useMemo(() => ({ ...(search.trim() ? { search: search.trim() } : {}), ...(brandFilter ? { brand: brandFilter } : {}) }), [search, brandFilter]);
  const coupons = useGetCoupons(params, { query: { queryKey: getGetCouponsQueryKey(params) } });
  const brands = useGetBrands({ query: { queryKey: getGetBrandsQueryKey() } });
  const createPurchase = useCreatePurchase();
  const qc = useQueryClient();

  const beginPurchase = (coupon: CouponListing) => {
    if (!isSignedIn) { setLocation('/sign-in'); return; }
    setActiveCoupon(coupon); setShowCheckout(true); setPurchaseDone(false); setReference('');
  };
  const submitPurchase = (e: FormEvent) => {
    e.preventDefault();
    if (!activeCoupon || reference.trim().length < 6) return;
    createPurchase.mutate({ data: { couponId: activeCoupon.id, paymentReference: reference.trim() } }, {
      onSuccess: async () => {
        await Promise.all([
          qc.invalidateQueries({ queryKey: getGetCouponsQueryKey() }),
          qc.invalidateQueries({ queryKey: getGetTransactionsQueryKey() }),
          qc.invalidateQueries({ queryKey: getGetSellerSummaryQueryKey() }),
          qc.invalidateQueries({ queryKey: getGetSellerCouponsQueryKey() }),
        ]);
        setPurchaseDone(true);
      },
    });
  };
  return <div className="site-shell">
    <SiteHeader compact={!publicMode}/>
    {publicMode && <section className="hero-section">
      <div className="hero-copy reveal"><span className="eyebrow"><span className="eyebrow-dot"/> A better way to pass it on</span>
        <h1>Good offers<br/>find <em>good homes.</em></h1>
        <p>Shop genuine coupons from brands you already know. Or turn an offer you won’t use into a little extra back.</p>
        <div className="hero-ctas"><a className="btn btn-primary" href="#offers">Browse offers <ArrowRight size={17}/></a><Link className="btn btn-quiet" href={isSignedIn ? '/upload' : '/sign-up'} data-testid="link-sell-coupon">Share a coupon <ArrowUpRight size={16}/></Link></div>
        <div className="hero-proof"><span><ShieldCheck size={16}/> Clear, fixed prices</span><span><HeartHandshake size={16}/> Fair seller earnings</span></div>
      </div>
      <div className="hero-art reveal">
        <div className="sun-disc"/><div className="hero-ticket"><div className="ticket-brand">a little something</div><div className="ticket-percentage">30<span>%</span></div><div className="ticket-rule"/><div className="ticket-bottom"><span>YOUR NEXT FAVOURITE</span><span>₹10</span></div></div>
        <div className="hero-sticker"><Sparkles size={15}/> offers, passed on</div>
        <div className="hero-side-note">GOOD THINGS<br/>DON’T GO TO WASTE</div>
      </div>
    </section>}
    <main className={publicMode ? 'marketplace-main' : 'app-main'}>
      {!publicMode && <div className="page-heading"><div><span className="eyebrow">The helpay marketplace</span><h1 className="font-display">Offers worth passing on.</h1><p>Legitimate savings from familiar brands, shared by shoppers like you.</p></div><Link href="/upload" className="btn btn-primary" data-testid="button-upload-top"><Tag size={16}/> Share a coupon</Link></div>}
      <section id="offers" className="offer-section">
        <div className="section-title-row"><div><span className="eyebrow">{publicMode ? 'A few good finds' : 'Browse offers'}</span><h2>{publicMode ? 'Worth a closer look.' : 'Available right now'}</h2></div><div className="offers-count">{coupons.data?.length ?? '—'} <span>offers</span></div></div>
        <div className="filter-row">
          <label className="search-box"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search brands or offers" data-testid="input-search-coupons"/></label>
          <label className="select-wrap"><Filter size={16}/><select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} aria-label="Filter by brand" data-testid="select-brand"><option value="">Every brand</option>{(brands.data ?? []).map(b => <option key={b.name} value={b.name}>{b.name}</option>)}</select><ChevronDown size={15}/></label>
        </div>
        {brands.isError && <p className="inline-warning">Brand filters are temporarily unavailable. <button className="text-link" onClick={() => void brands.refetch()}>Try again</button></p>}
        <QueryState loading={coupons.isLoading} error={coupons.isError} retry={() => void coupons.refetch()}>
          {coupons.data?.length ? <div className="coupon-grid">{coupons.data.map(c => <CouponCard key={c.id} coupon={c} onBuy={beginPurchase}/>)}</div> :
            <div className="empty-state"><div className="empty-icon"><TicketCheck size={24}/></div><h3>No offers found just yet.</h3><p>Try another search, or come back soon. Good coupons get added all the time.</p>{search || brandFilter ? <button className="btn btn-quiet" onClick={() => { setSearch(''); setBrandFilter(''); }} data-testid="button-clear-filters">Clear filters</button> : <Link href={isSignedIn ? '/upload' : '/sign-up'} className="btn btn-primary">Share the first one <ArrowRight size={15}/></Link>}</div>}
        </QueryState>
      </section>
      {publicMode && <section className="how-strip"><div><span className="step-number">01</span><div><strong>Find an offer</strong><p>Browse coupons from approved, familiar brands.</p></div></div><div><span className="step-number">02</span><div><strong>See the listed price</strong><p>Prices are shown upfront. Purchases are not enabled yet.</p></div></div><div><span className="step-number">03</span><div><strong>Payments coming later</strong><p>Do not send money. Payment setup is still pending.</p></div></div></section>}
      <section className="market-trust"><div className="trust-icon"><ShieldCheck size={22}/></div><div><strong>Clarity comes first.</strong><p>Coupon codes aren’t shown publicly. Payments and payouts are currently disabled.</p></div><Link href="/pricing">See the pricing <ArrowRight size={15}/></Link></section>
    </main>
    {publicMode && <Footer/>}
    {showCheckout && activeCoupon && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowCheckout(false); }}>
      <section className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
        <button className="modal-close" onClick={() => setShowCheckout(false)} aria-label="Close checkout" data-testid="button-close-checkout"><X size={18}/></button>
        <span className="eyebrow">Payments unavailable</span><h2 id="checkout-title">Purchases are not enabled yet.</h2><p>You can browse and list coupons. Payments and payouts will open after payment setup is complete. Do not send money.</p><button className="btn btn-primary full-width" onClick={() => setShowCheckout(false)}>Back to marketplace</button>
      </section>
    </div>}
  </div>;
}

function UploadPage() {
  const brands = useGetBrands({ query: { queryKey: getGetBrandsQueryKey() } });
  const pricing = useGetCouponPricing({ query: { queryKey: getGetCouponPricingQueryKey() } });
  const createCoupon = useCreateCoupon();
  const qc = useQueryClient();
  const [category, setCategory] = useState<'discount'|'worth'>('discount');
  const [brand, setBrand] = useState('');
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [value, setValue] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const selectedBrand = (brands.data ?? []).find(b => b.name === brand);
  const valueNumber = Number(value);
  const matchedRule = pricing.data?.find(r => r.basis === category && valueNumber >= r.minValue && valueNumber <= r.maxValue);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedBrand || !matchedRule) return;
    const input: CouponInput = {
      brand, category, title: title.trim(), code: code.trim(), expiryDate,
      ...(category === 'discount' ? { discountPercent: valueNumber } : { couponValue: valueNumber }),
    };
    createCoupon.mutate({ data: input }, { onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetCouponsQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetSellerCouponsQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetSellerSummaryQueryKey() }),
      ]);
      setSubmitted(true);
    }});
  };
  return <Protected><div className="site-shell"><SiteHeader/><main className="form-page">
    <Link href="/seller" className="back-link" data-testid="link-back-sales"><ArrowDownLeft size={15}/> Back to my sales</Link>
    <div className="form-layout"><div className="form-intro"><span className="eyebrow">Share what you won’t use</span><h1 className="font-display">An unused offer can still do good.</h1><p>List an eligible coupon and help another shopper save. Your earnings are shown upfront, with no hidden deductions.</p><div className="form-aside"><ShieldCheck size={20}/><div><strong>Only approved brands</strong><small>Choose from our verified brand list so buyers know what they’re getting.</small></div></div></div>
    <section className="form-card">
       {submitted ? <div className="submitted-state"><div className="success-mark"><Check size={24}/></div><span className="eyebrow">Coupon listed</span><h2>Thanks for passing it on.</h2><p>Your coupon is now available in the marketplace. Buyers won’t see its code unless their payment is verified.</p><div className="pending-banner"><ShieldCheck size={17}/><span><strong>Code kept private</strong><small>Only you can see it until a verified sale is completed.</small></span></div><Link className="btn btn-primary full-width" href="/seller">View my sales <ArrowRight size={15}/></Link></div> :
      <><div className="form-card-heading"><span className="step-chip">NEW LISTING</span><h2>Coupon details</h2><p>Tell us what the offer is and when it expires.</p></div>
        {brands.isError && <div className="form-error-box"><CircleAlert size={17}/> Approved brands couldn’t be loaded. <button className="text-link" type="button" onClick={() => void brands.refetch()}>Try again</button></div>}
        {pricing.isError && <div className="form-error-box"><CircleAlert size={17}/> Fixed pricing couldn’t be loaded. <button className="text-link" type="button" onClick={() => void pricing.refetch()}>Try again</button></div>}
        <form onSubmit={submit} className="stack-form">
          <div><label className="label" htmlFor="brand-select">Brand</label><select id="brand-select" className="field" value={brand} onChange={e => setBrand(e.target.value)} required data-testid="select-approved-brand"><option value="">Choose an approved brand</option>{(brands.data ?? []).map(b => <option key={b.name} value={b.name}>{b.name} · {b.category}</option>)}</select>{brands.isLoading && <small className="form-help">Loading approved brands…</small>}</div>
          <div><label className="label" htmlFor="coupon-title">Offer title</label><input id="coupon-title" className="field" minLength={3} maxLength={100} required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 30% off your next order" data-testid="input-coupon-title"/></div>
          <div className="two-fields"><div><label className="label" htmlFor="coupon-kind">Offer type</label><select className="field" id="coupon-kind" value={category} onChange={e => setCategory(e.target.value as 'discount'|'worth')} data-testid="select-coupon-category"><option value="discount">Percentage discount</option><option value="worth">Coupon value</option></select></div><div><label className="label" htmlFor="coupon-value">{category === 'discount' ? 'Discount (%)' : 'Coupon worth (₹)'}</label><input id="coupon-value" type="number" className="field" value={value} min={category === 'discount' ? 10 : 0} max={category === 'discount' ? 100 : 1000} onChange={e => setValue(e.target.value)} required placeholder={category === 'discount' ? '10–100' : '0–1000'} data-testid="input-coupon-value"/></div></div>
          <div><label className="label" htmlFor="coupon-code">Coupon code</label><input id="coupon-code" className="field" value={code} onChange={e => setCode(e.target.value)} minLength={3} maxLength={120} required placeholder="Enter the code exactly as shown" data-testid="input-coupon-code"/><small className="form-help">Your code stays private and is never shown on public listings.</small></div>
          <div><label className="label" htmlFor="coupon-expiry">Expiry date</label><input id="coupon-expiry" type="date" className="field" value={expiryDate} min={new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())} onChange={e => setExpiryDate(e.target.value)} required data-testid="input-coupon-expiry"/></div>
          <div className="earnings-preview"><div><small>Listed at</small><strong>{matchedRule ? money(matchedRule.salePrice) : '—'}</strong></div><span className="preview-divider"/><div><small>Your earnings</small><strong>{matchedRule ? money(matchedRule.sellerEarnings) : '—'}</strong></div>{!matchedRule && <span className="preview-footnote">Select a value to see fixed pricing</span>}</div>
          {createCoupon.isError && <p className="form-error" role="alert">{(createCoupon.error as { data?: { error?: string } } | null)?.data?.error ?? 'Couldn’t submit this coupon. Check the details and try again.'}</p>}
           <button className="btn btn-primary full-width" type="submit" disabled={createCoupon.isPending || brands.isLoading || !matchedRule || !brand || !expiryDate} data-testid="button-submit-coupon">{createCoupon.isPending ? 'Submitting…' : <>Submit coupon <ArrowRight size={16}/></>}</button>
        </form></>}
    </section></div>
  </main><Footer/></div></Protected>;
}

function SellerPage() {
  const coupons = useGetSellerCoupons({ query: { queryKey: getGetSellerCouponsQueryKey() } });
  const summary = useGetSellerSummary({ query: { queryKey: getGetSellerSummaryQueryKey() } });
  const transactions = useGetTransactions({ query: { queryKey: getGetTransactionsQueryKey() } });
  const payoutRequests = useGetPayoutRequests({ query: { queryKey: getGetPayoutRequestsQueryKey() } });
  const payout = useCreatePayoutRequest();
  const qc = useQueryClient();
  const [payoutRequested, setPayoutRequested] = useState(false);
  const [payoutResponse, setPayoutResponse] = useState<PayoutRequest | null>(null);
  const [upiId, setUpiId] = useState('');
  const [withdrawing, setWithdrawing] = useState<number | null>(null);
  const [withdrawError, setWithdrawError] = useState('');
  const withdrawCoupon = async (c: { id: number; brand: string; title: string }) => {
    if (!window.confirm(`Withdraw “${c.title}” (${c.brand}) from the marketplace? Buyers will no longer see it. This can’t be undone.`)) return;
    setWithdrawing(c.id); setWithdrawError('');
    try {
      await apiPost(`/api/seller/coupons/${c.id}/withdraw`);
      await Promise.all([qc.invalidateQueries({ queryKey: getGetSellerCouponsQueryKey() }), qc.invalidateQueries({ queryKey: getGetCouponsQueryKey() })]);
    } catch (err) { setWithdrawError(err instanceof Error ? err.message : 'Couldn’t withdraw this listing. Please try again.'); }
    finally { setWithdrawing(null); }
  };
  const recentSales = (transactions.data ?? []).filter(t => t.direction === 'sale');
  const handlePayout = () => payout.mutate({ data: { upiId: upiId.trim() } }, { onSuccess: async (request) => {
    await Promise.all([qc.invalidateQueries({ queryKey: getGetSellerSummaryQueryKey() }), qc.invalidateQueries({ queryKey: getGetTransactionsQueryKey() }), qc.invalidateQueries({ queryKey: getGetPayoutRequestsQueryKey() })]);
    setPayoutResponse(request);
    setPayoutRequested(true);
  }});
  return (
    <Protected><div className="site-shell"><SiteHeader/><main className="app-main seller-page">
      <div className="page-heading"><div><span className="eyebrow">Your seller space</span><h1 className="font-display">Small offers. Real earnings.</h1><p>See how your shared coupons are doing and what’s ready to claim.</p></div><Link href="/upload" className="btn btn-primary" data-testid="button-share-another"><Tag size={16}/> Share a coupon</Link></div>
      {(summary.isError || coupons.isError || transactions.isError) && <div className="inline-error"><CircleAlert size={16}/> Some seller details couldn’t be loaded. <button className="text-link" onClick={() => { void summary.refetch(); void coupons.refetch(); void transactions.refetch(); }} data-testid="button-retry-seller">Try again</button></div>}
      <div className="seller-stats">
        <div className="stat-card stat-featured"><span>Total earned</span><strong>{summary.isLoading ? <i className="value-skeleton"/> : money(summary.data?.totalEarned)}</strong><small>From verified sales</small><Banknote size={22}/></div>
        <div className="stat-card"><span>Available to claim</span><strong>{summary.isLoading ? <i className="value-skeleton"/> : money(summary.data?.availableToClaim)}</strong><small>Ready for payout request</small><Wallet size={20}/></div>
        <div className="stat-card"><span>Pending payments</span><strong>{summary.isLoading ? <i className="value-skeleton"/> : money(summary.data?.pendingPayments)}</strong><small>Awaiting payment review</small><Clock3 size={20}/></div>
        <div className="stat-card"><span>Coupons sold</span><strong>{summary.isLoading ? <i className="value-skeleton"/> : (summary.data?.couponsSold ?? 0)}</strong><small>Across your listings</small><TicketCheck size={20}/></div>
      </div>
       <section className="payout-banner"><div className="payout-mark"><HandCoins size={23}/></div><div className="payout-copy"><h3>Payouts are disabled</h3><p>Bank and payment setup will be completed separately. No money transfers are available.</p></div></section>
      {payout.isError && <p className="form-error">Payout request could not be submitted. Please try again.</p>}
      {payoutResponse && <div className="inline-success" data-testid="status-payout-request"><Check size={16}/> Request #{payoutResponse.id} for {money(payoutResponse.amount)} received · {statusLabel[payoutResponse.status] ?? payoutResponse.status}</div>}
       {payoutRequests.data && payoutRequests.data.length > 0 && <section className="dashboard-section payout-history"><div className="section-title-row"><div><span className="eyebrow">Payout activity</span><h2>Your payout requests</h2></div></div><div className="listing-list">{payoutRequests.data.map(request => <div className="listing-row" key={request.id}><div className="listing-main"><strong>Request #{request.id}</strong><span>{dateLabel(request.createdAt)}</span></div><div className="listing-value"><strong>{money(request.amount)}</strong><small>requested</small></div><span className={`status-pill status-${request.status}`}>{statusLabel[request.status] ?? request.status}</span></div>)}</div></section>}
       <section className="dashboard-section"><div className="section-title-row"><div><span className="eyebrow">Your listings</span><h2>Coupons you’ve shared</h2></div><span className="section-count">{coupons.data?.length ?? 0} listed</span></div>
         {withdrawError && <p className="form-error" role="alert">{withdrawError}</p>}
         {coupons.isLoading ? <div className="listing-row skeleton-card"/> : coupons.isError ? <div className="state-card"><p>Couldn’t load your coupons.</p><button className="text-link" onClick={() => void coupons.refetch()}>Try again</button></div> : coupons.data?.length ? <div className="listing-list">{coupons.data.map(c => <div className="listing-row" key={c.id} data-testid={`row-seller-coupon-${c.id}`}><div className="brand-avatar small">{c.brand.slice(0,1)}</div><div className="listing-main"><strong>{c.brand}</strong><span>{c.title}</span>{c.code && <span>Your code: <code className="coupon-code">{c.code}</code></span>}</div><div className="listing-value"><strong>{money(c.sellerEarnings)}</strong><small>your share</small></div><span className={`status-pill ${c.status === 'available' ? 'status-good' : 'status-pending'}`}>{c.status === 'available' ? 'Listed' : c.status === 'reserved' ? 'Payment review pending' : c.status === 'withdrawn' ? 'Withdrawn' : c.status}</span>{c.status === 'available' && <button className="text-link" onClick={() => void withdrawCoupon(c)} disabled={withdrawing === c.id} data-testid={`button-withdraw-${c.id}`}>{withdrawing === c.id ? 'Withdrawing…' : 'Withdraw'}</button>}</div>)}</div> : <div className="empty-state compact-empty"><div className="empty-icon"><TicketCheck size={22}/></div><h3>Your first listing starts here.</h3><p>Share a coupon you won’t use and put it to good use for someone else.</p><Link href="/upload" className="btn btn-primary">Share a coupon</Link></div>}
      </section>
      <section className="dashboard-section"><div className="section-title-row"><div><span className="eyebrow">Latest activity</span><h2>Your sales</h2></div><Link href="/profile" className="text-link">All transactions <ArrowRight size={14}/></Link></div>{recentSales.length ? <TransactionTable transactions={recentSales.slice(0,5)}/> : <div className="empty-state compact-empty"><p>No sales to show yet. Once a buyer’s payment is verified, the sale will appear here.</p></div>}</section>
    </main><Footer/></div></Protected>
  );
}

function TransactionTable({ transactions }: { transactions: Transaction[] }) {
  return <div className="transaction-table-wrap"><table className="transaction-table"><thead><tr><th>Offer</th><th>Type</th><th>Date</th><th>Status</th><th>Coupon code</th><th className="align-right">Amount</th></tr></thead><tbody>{transactions.map(t => <tr key={t.id} data-testid={`row-transaction-${t.id}`}><td><strong>{t.brand}</strong><small>{t.title}</small></td><td><span className={`direction ${t.direction}`}>{t.direction === 'purchase' ? <ArrowDownLeft size={13}/> : <ArrowUpRight size={13}/>} {t.direction}</span></td><td>{dateLabel(t.createdAt)}</td><td><span className={`status-pill status-${t.status}`}>{statusLabel[t.status] ?? t.status}</span></td><td>{t.couponCode ? <code className="coupon-code">{t.couponCode}</code> : t.direction === 'purchase' && t.status === 'pending' ? <small>After review</small> : '—'}</td><td className="align-right"><strong>{money(t.amount)}</strong></td></tr>)}</tbody></table></div>;
}

function ProfilePage() {
  const { user } = useUser();
  const transactions = useGetTransactions({ query: { queryKey: getGetTransactionsQueryKey() } });
  const userName = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Your account';
  return <Protected><div className="site-shell"><SiteHeader/><main className="app-main profile-page">
    <div className="page-heading"><div><span className="eyebrow">Your helpay account</span><h1 className="font-display">Good to have you here.</h1><p>Manage your details and keep an eye on every offer you’ve shared or bought.</p></div></div>
    <section className="profile-card"><div className="profile-avatar">{userName.slice(0,1).toUpperCase()}</div><div className="profile-details"><span className="eyebrow">Account details</span><h2 data-testid="text-account-name">{userName}</h2><p>{user?.primaryEmailAddress?.emailAddress ?? 'Email address not available'}</p></div><div className="account-verified"><BadgeCheck size={17}/> Signed in securely</div></section>
    <section className="dashboard-section"><div className="section-title-row"><div><span className="eyebrow">The full picture</span><h2>Transaction history</h2></div><span className="section-count">{transactions.data?.length ?? 0} records</span></div>
      <QueryState loading={transactions.isLoading} error={transactions.isError} retry={() => void transactions.refetch()}>{transactions.data?.length ? <TransactionTable transactions={transactions.data}/> : <div className="empty-state compact-empty"><div className="empty-icon"><CreditCard size={22}/></div><h3>No transactions just yet.</h3><p>Your purchases and coupon sales will show here, with their current review status.</p><Link href="/dashboard" className="btn btn-primary">Browse marketplace</Link></div>}</QueryState>
    </section>
  </main><Footer/></div></Protected>;
}

function AdminPage() {
  const purchases = useGetAdminPurchases({ query: { queryKey: getGetAdminPurchasesQueryKey() } });
  const payouts = useGetAdminPayoutRequests({ query: { queryKey: getGetAdminPayoutRequestsQueryKey() } });
  const reviewPurchase = useReviewPurchase();
  const reviewPayout = useReviewPayoutRequest();
  const qc = useQueryClient();
  const refreshMarketplace = async () => Promise.all([
    qc.invalidateQueries({ queryKey: getGetCouponsQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetSellerCouponsQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetSellerSummaryQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetTransactionsQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetPayoutRequestsQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetAdminPurchasesQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetAdminPayoutRequestsQueryKey() }),
  ]);
  const decidePurchase = (id: number, status: 'verified'|'rejected') => reviewPurchase.mutate(
    { id, data: { status } },
    { onSuccess: refreshMarketplace },
  );
  const decidePayout = (id: number, status: 'paid'|'rejected') => reviewPayout.mutate(
    { id, data: { status } },
    { onSuccess: refreshMarketplace },
  );
  const noAccess = purchases.isError || payouts.isError;

  return <Protected><div className="site-shell"><SiteHeader/><main className="app-main admin-page">
    <div className="page-heading"><div><span className="eyebrow">Restricted reviewer area</span><h1 className="font-display">Payment review.</h1><p>Verify UPI payments before sharing a code. Mark payouts paid only after completing the transfer.</p></div></div>
    {noAccess ? <div className="state-card error-state"><ShieldCheck size={25}/><h3>Reviewer access is required.</h3><p>This area is limited to the helpay reviewer account. If you should have access, confirm that you’re signed in with the configured reviewer email.</p></div> : <>
      <section className="review-warning"><CircleAlert size={20}/><div><strong>Manual checks are required.</strong><p>Compare each payment reference with the received UPI payment before approving. Coupon codes are released only after you mark a payment verified.</p></div></section>
      {(purchases.isError || payouts.isError || reviewPurchase.isError || reviewPayout.isError) && <div className="inline-error"><CircleAlert size={16}/> Some review information could not be loaded or saved. Try again.</div>}
      <section className="dashboard-section"><div className="section-title-row"><div><span className="eyebrow">Buyer payments</span><h2>Waiting for verification</h2></div><span className="section-count">{purchases.data?.length ?? 0} pending</span></div>
        {purchases.isLoading ? <div className="listing-row skeleton-card"/> : purchases.data?.length ? <div className="review-list">{purchases.data.map((purchase: AdminPurchase) => <article className="review-row" key={purchase.id} data-testid={`row-review-purchase-${purchase.id}`}><div className="review-main"><strong>{purchase.brand} · {purchase.title}</strong><span>Payment ref: <code>{purchase.paymentReference}</code></span><small>{dateLabel(purchase.createdAt)} · {money(purchase.amount)} · Seller receives {money(purchase.sellerEarnings)}</small></div><div className="review-actions"><button className="btn btn-quiet" onClick={() => decidePurchase(purchase.id, 'rejected')} disabled={reviewPurchase.isPending} data-testid={`button-reject-purchase-${purchase.id}`}>Reject</button><button className="btn btn-primary" onClick={() => decidePurchase(purchase.id, 'verified')} disabled={reviewPurchase.isPending} data-testid={`button-verify-purchase-${purchase.id}`}>Verify payment</button></div></article>)}</div> : <div className="empty-state compact-empty"><h3>No payment references waiting.</h3><p>New UPI submissions will appear here for manual verification.</p></div>}
      </section>
      <section className="dashboard-section"><div className="section-title-row"><div><span className="eyebrow">Seller payouts</span><h2>Transfer requests</h2></div><span className="section-count">{payouts.data?.length ?? 0} pending</span></div>
        {payouts.isLoading ? <div className="listing-row skeleton-card"/> : payouts.data?.length ? <div className="review-list">{payouts.data.map((request: AdminPayoutRequest) => <article className="review-row" key={request.id} data-testid={`row-review-payout-${request.id}`}><div className="review-main"><strong>Request #{request.id} · {money(request.amount)}</strong><span>UPI destination: <code>{request.upiId}</code></span><small>Seller account {request.sellerId.slice(0, 12)}… · {dateLabel(request.createdAt)}</small></div><div className="review-actions"><button className="btn btn-quiet" onClick={() => decidePayout(request.id, 'rejected')} disabled={reviewPayout.isPending} data-testid={`button-reject-payout-${request.id}`}>Reject</button><button className="btn btn-primary" onClick={() => decidePayout(request.id, 'paid')} disabled={reviewPayout.isPending} data-testid={`button-mark-paid-${request.id}`}>Mark paid</button></div></article>)}</div> : <div className="empty-state compact-empty"><h3>No payout requests waiting.</h3><p>Seller claims will appear here after earnings are available.</p></div>}
      </section>
    </>}
  </main><Footer/></div></Protected>;
}

function PricingPage() {
  const pricing = useGetCouponPricing({ query: { queryKey: getGetCouponPricingQueryKey() } });
  const discountRules = pricing.data?.filter(rule => rule.basis === 'discount') ?? [];
  const worthRules = pricing.data?.filter(rule => rule.basis === 'worth') ?? [];
  return <div className="site-shell"><SiteHeader/><main className="app-main pricing-page">
    <div className="pricing-hero"><span className="eyebrow">powered by c.j mahindra </span><h1 className="font-display">cheap price to buy coupon </h1><p>Buyers see the full price before they pay. Sellers see their earnings before they share an offer.</p></div>
    {pricing.isError && <div className="inline-error"><CircleAlert size={16}/> Pricing couldn’t load right now. <button className="text-link" onClick={() => void pricing.refetch()} data-testid="button-retry-pricing">Try again</button></div>}
    {pricing.isLoading ? <div className="price-rule-grid">{[1,2,3].map(i => <div className="rule-card skeleton-card" key={i}/>)}</div> : <>
      <div className="pricing-group"><div className="group-heading"><span className="group-number">01</span><div><h2>Percentage discounts</h2><p>For coupons that take a percentage off your order.</p></div></div><div className="price-rule-grid">{discountRules.map(r => <RuleCard rule={r} key={r.label}/>)}</div></div>
      <div className="pricing-group"><div className="group-heading"><span className="group-number">02</span><div><h2>Fixed-value coupons</h2><p>For coupons worth a specific rupee amount.</p></div></div><div className="price-rule-grid">{worthRules.map(r => <RuleCard rule={r} key={r.label}/>)}</div></div>
    </>}
    <section className="pricing-note"><div className="trust-icon"><ShieldCheck size={22}/></div><div><h3>Your earnings, shown upfront.</h3><p>See your payout before you list a coupon. Earnings become available after a sale is verified.</p></div></section>
    <div className="pricing-cta"><div><span className="eyebrow">Ready to pass it on?</span><h2>Put a good offer back in circulation.</h2></div><Link href="/upload" className="btn btn-primary">Share a coupon <ArrowRight size={15}/></Link></div>
  </main><Footer/></div>;
}

function RuleCard({ rule }: { rule: { basis: string; label: string; minValue: number; maxValue: number; salePrice: number; sellerEarnings: number } }) {
  return <article className="rule-card"><span className="rule-label">{rule.label}</span><div className="rule-price">{money(rule.salePrice)}<small>buyer pays</small></div><div className="rule-breakdown"><div><span>Seller earns</span><strong>{money(rule.sellerEarnings)}</strong></div></div></article>;
}

function SignInPage() {
  return <div className="auth-layout"><div className="auth-brand"><Mark/><span>Coupons, passed on fairly.</span></div><div className="auth-form"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/></div><aside className="auth-aside"><div className="auth-aside-content"><span className="eyebrow">A little goes a long way</span><h1 className="font-display">Savings have a way of finding you.</h1><p>Find a real offer from a familiar brand. Know exactly what it costs. That’s helpay.</p><div className="auth-quote"><ShieldCheck size={19}/><span>Clear prices. Private codes. Payments currently disabled.</span></div></div><span className="auth-aside-foot">GOOD OFFERS FIND GOOD HOMES.</span></aside></div>;
}
function SignUpPage() {
  return <div className="auth-layout"><div className="auth-brand"><Mark/><span>Coupons, passed on fairly.</span></div><div className="auth-form"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/></div><aside className="auth-aside"><div className="auth-aside-content"><span className="eyebrow">Make good offers count</span><h1 className="font-display">Share a little savings.</h1><p>List coupons you won’t use, see your exact earnings upfront, and let another shopper make the most of them.</p><div className="auth-quote"><HandCoins size={19}/><span>Fixed tiers. Clear earnings. No surprises.</span></div></div><span className="auth-aside-foot">GOOD OFFERS FIND GOOD HOMES.</span></aside></div>;
}
function ResetPasswordPage() {
  return <div className="auth-layout"><div className="auth-brand"><Mark/><span>Coupons, passed on fairly.</span></div><div className="auth-form"><ResetPassword/></div><aside className="auth-aside"><div className="auth-aside-content"><span className="eyebrow">Back in a moment</span><h1 className="font-display">Let’s get you signed in again.</h1><p>We’ll email you a secure link. It works once and expires soon after it’s sent.</p><div className="auth-quote"><ShieldCheck size={19}/><span>Clear prices. Private codes. Payments currently disabled.</span></div></div><span className="auth-aside-foot">GOOD OFFERS FIND GOOD HOMES.</span></aside></div>;
}
function ClerkQueryCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const current = user?.id ?? null;
    if (previousUserId.current !== undefined && previousUserId.current !== current) qc.clear();
    previousUserId.current = current;
  }), [addListener, qc]);
  return null;
}
function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider>
    <QueryClientProvider client={queryClient}>
      <ClerkQueryCacheInvalidator/>
      <Switch>
        <Route path="/" component={HomeRedirect}/>
        <Route path="/sign-in/*?" component={SignInPage}/>
        <Route path="/sign-up/*?" component={SignUpPage}/>
        <Route path="/reset-password" component={ResetPasswordPage}/>
        <Route path="/dashboard"><Protected><Marketplace/></Protected></Route>
        <Route path="/upload" component={UploadPage}/>
        <Route path="/seller" component={SellerPage}/>
        <Route path="/profile" component={ProfilePage}/>
        <Route path="/admin"><Protected><AdminPage/></Protected></Route>
        <Route path="/pricing" component={PricingPage}/>
        <Route><NotFound/></Route>
      </Switch>
      <BottomNav/>
    </QueryClientProvider>
  </ClerkProvider>;
}
function NotFound() { return <div className="not-found"><Mark/><span className="eyebrow">404 · Wrong turn</span><h1 className="font-display">This offer isn’t here.</h1><p>Let’s get you back to the good stuff.</p><Link href="/" className="btn btn-primary">Back to helpay <ArrowRight size={16}/></Link></div>; }

function App() {
  if (!clerkPubKey) {
    return <div className="config-state"><Mark/><h1>Getting helpay ready.</h1><p>Authentication is being configured. Please try again shortly.</p></div>;
  }
  return <WouterRouter base={basePath}><ClerkRoutes/></WouterRouter>;
}

export default App; 
