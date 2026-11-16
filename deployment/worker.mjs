import {APPROVED_BRANDS, PRICING} from './catalog.mjs';
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const listing=c=>({id:c.id,brand:c.brand,category:c.category,title:c.title,discountPercent:c.discount_percent,couponValue:c.coupon_value,expiryDate:c.expiry_date,salePrice:c.sale_price,commission:c.commission,sellerEarnings:c.seller_earnings,status:c.status});
export function searchTerm(value){
 return (typeof value==='string'?value:'').normalize('NFKC').replace(/[^\p{L}\p{N} &'.-]/gu,' ').replace(/\s+/g,' ').trim().slice(0,80);
}
export function validateCoupon(p){
 if(!p||typeof p!=='object'||!APPROVED_BRANDS.some(b=>b.name===p.brand)) return 'Choose an approved brand.';
 if(typeof p.title!=='string'||p.title.trim().length<3||p.title.length>160||typeof p.code!=='string'||!p.code.trim()||p.code.length>200) return 'Enter a title (3–160 characters) and a code (1–200 characters).';
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());
 if(typeof p.expiryDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.expiryDate)||!Number.isFinite(Date.parse(p.expiryDate))||new Date(p.expiryDate).toISOString().slice(0,10)!==p.expiryDate||p.expiryDate<today) return 'Choose a valid expiry date, today or later.';
 if(p.category==='discount'){if(!Number.isInteger(p.discountPercent)||p.discountPercent<10||p.discountPercent>100||p.couponValue!=null)return 'Discount must be 10–100%.';}
 else if(p.category==='worth'){if(!Number.isInteger(p.couponValue)||p.couponValue<0||p.couponValue>1000||p.discountPercent!=null)return 'Coupon value must be ₹0–₹1,000.';}
 else return 'Choose discount or worth.';
 return null;
}
async function api(request,env){
 const url=new URL(request.url),path=url.pathname.replace(/\/$/,''),method=request.method;
 if(!['GET','HEAD','OPTIONS'].includes(method)&&/(purchases|payout-requests)/.test(path))return json({error:'Payments and payouts are disabled.'},403);
 if(method==='OPTIONS')return new Response(null,{status:204});
 if(!['GET','POST'].includes(method))return json({error:'Method not allowed.'},405);
 if(method==='GET'&&path==='/api/brands')return json(APPROVED_BRANDS);
 if(method==='GET'&&path==='/api/pricing')return json(PRICING);
 if(method==='GET'&&path==='/api/config')return json({paymentsEnabled:false,payoutsEnabled:false});
 const token=request.headers.get('authorization');
 const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',...(token?{Authorization:token}:{})};
 async function rest(resource,options={}){
  const res=await fetch(`${env.SUPABASE_URL}/rest/v1/${resource}`,{...options,headers:options.headers??headers,signal:AbortSignal.timeout(10000)});
  if(!res.ok) throw new Error(`Database request failed: ${res.status}`);
  return res.json();
 }
 const columns='id,brand,category,title,discount_percent,coupon_value,expiry_date,sale_price,commission,seller_earnings,status';
 if(method==='GET'&&path==='/api/healthz'){await rest('helpyy_coupons?select=id&limit=1');return json({status:'ok',database:'connected',paymentsEnabled:false});}
 if(method==='GET'&&path==='/api/coupons'){
  const q=new URLSearchParams({select:columns,status:'eq.available',expiry_date:`gte.${new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date())}`,order:'created_at.desc',limit:'100'});
  if(url.searchParams.get('brand'))q.set('brand',`eq.${url.searchParams.get('brand')}`);
  // Search runs in the database. Only letters, digits, spaces and a few brand
  // punctuation marks survive, so no PostgREST filter syntax can be injected.
  const search=searchTerm(url.searchParams.get('search'));
  if(search)q.set('or',`(title.ilike."*${search}*",brand.ilike."*${search}*")`);
  const rows=await rest(`helpyy_coupons?${q}`);
  return json(rows.map(listing));
 }
 if(!token?.startsWith('Bearer '))return json({error:'Sign in to continue.'},401);
 const auth=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers,signal:AbortSignal.timeout(10000)});
 if(!auth.ok)return json({error:'Session expired. Sign in again.'},401);
 const user=await auth.json();
 if(path.startsWith('/api/admin/'))return json({error:'Payment review is disabled.'},403);
 if(method==='POST'&&path==='/api/coupons'){
  if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'JSON required.'},415);
  const raw=await request.text();if(raw.length>8192)return json({error:'Request too large.'},413);
  let input;try{input=JSON.parse(raw);}catch{return json({error:'Invalid JSON.'},400);}
  const error=validateCoupon(input);if(error)return json({error},400);
  const rows=await rest('rpc/helpyy_create_coupon',{method:'POST',body:JSON.stringify({payload:input})});
  return json(listing(rows[0]),201);
 }
 if(method==='GET'&&path==='/api/seller/coupons'){
  const rows=await rest(`helpyy_coupons?select=${columns}&seller_id=eq.${user.id}&order=created_at.desc&limit=100`);
  const codes=await rest(`helpyy_coupon_codes?select=coupon_id,code&seller_id=eq.${user.id}&limit=100`);
  return json(rows.map(c=>({...listing(c),code:codes.find(x=>x.coupon_id===c.id)?.code??'',paymentStatus:null})));
 }
 const withdraw=method==='POST'&&path.match(/^\/api\/seller\/coupons\/(\d{1,15})\/withdraw$/);
 if(withdraw){
  // RLS limits the update to the caller's own rows; the seller filter is defence in depth.
  const rows=await rest(`helpyy_coupons?id=eq.${withdraw[1]}&seller_id=eq.${user.id}&status=eq.available&select=${columns}`,{method:'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify({status:'withdrawn'})});
  if(!rows.length)return json({error:'Listing not found, or already withdrawn.'},404);
  return json(listing(rows[0]));
 }
 // No payment ledger exists in this new, payment-disabled deployment.
 if(method==='GET'&&path==='/api/seller/summary')return json({totalEarned:0,availableToClaim:0,pendingPayments:0,couponsSold:0});
 if(method==='GET'&&['/api/transactions','/api/payout-requests'].includes(path))return json([]);
 return json({error:'Not found.'},404);
}
export default {async fetch(request,env){
 let response;
 try{response=new URL(request.url).pathname.startsWith('/api/')?await api(request,env):await env.ASSETS.fetch(request);}
 catch{response=json({error:'Service temporarily unavailable. Please try again.'},503);}
 const headers=new Headers(response.headers);
 headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('X-Frame-Options','DENY');headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');headers.set('Strict-Transport-Security','max-age=31536000');
 headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' "+env.SUPABASE_URL+"; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
 return new Response(response.body,{status:response.status,headers});
}};
