import {APPROVED_BRANDS, PRICING} from './catalog.mjs';
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const listing=c=>({id:c.id,brand:c.brand,category:c.category,title:c.title,discountPercent:c.discount_percent,couponValue:c.coupon_value,expiryDate:c.expiry_date,salePrice:c.sale_price,commission:c.commission,sellerEarnings:c.seller_earnings,status:c.status});
class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
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
 // Payments run only when a UPI ID is configured. Buyers pay that ID in their own UPI
 // app; nothing is treated as paid until a reviewer confirms the money arrived.
 const upiId=/^[A-Za-z0-9._-]{2,255}@[A-Za-z0-9._-]{2,64}$/.test(env.UPI_ID??'')?env.UPI_ID:null;
 if(!upiId&&!['GET','HEAD','OPTIONS'].includes(method)&&/(purchases|payout-requests)/.test(path))return json({error:'Payments and payouts are disabled.'},403);
 if(method==='OPTIONS')return new Response(null,{status:204});
 if(!['GET','POST','PATCH'].includes(method))return json({error:'Method not allowed.'},405);
 if(method==='GET'&&path==='/api/brands')return json(APPROVED_BRANDS);
 if(method==='GET'&&path==='/api/pricing')return json(PRICING);
 if(method==='GET'&&path==='/api/config')return json({paymentsEnabled:!!upiId,payoutsEnabled:!!upiId,upiId});
 const token=request.headers.get('authorization');
 const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',...(token?{Authorization:token}:{})};
 async function rest(resource,options={}){
  const res=await fetch(`${env.SUPABASE_URL}/rest/v1/${resource}`,{...options,headers:options.headers??headers,signal:AbortSignal.timeout(10000)});
  if(!res.ok){
   // Database functions mark messages that are safe to show with a HELPYY: prefix.
   const body=await res.json().catch(()=>null),message=typeof body?.message==='string'&&body.message.startsWith('HELPYY:')?body.message.slice(7):null;
   if(message)throw new ApiError(409,message);
   if(res.status===403||body?.code==='42501')throw new ApiError(403,'You don’t have access to this.');
   throw new Error(`Database request failed: ${res.status}`);
  }
  return res.json();
 }
 const rpc=(name,args={})=>rest(`rpc/${name}`,{method:'POST',body:JSON.stringify(args)});
 const body=async()=>{
  if(!request.headers.get('content-type')?.includes('application/json'))throw new ApiError(415,'JSON required.');
  const raw=await request.text();if(raw.length>8192)throw new ApiError(413,'Request too large.');
  try{const value=JSON.parse(raw);if(value&&typeof value==='object')return value;}catch{}
  throw new ApiError(400,'Invalid JSON.');
 };
 const columns='id,brand,category,title,discount_percent,coupon_value,expiry_date,sale_price,commission,seller_earnings,status';
 if(method==='GET'&&path==='/api/healthz'){await rest('helpyy_coupons?select=id&limit=1');return json({status:'ok',database:'connected',paymentsEnabled:!!upiId});}
 if(method==='GET'&&path==='/api/coupons'){
  const q=new URLSearchParams({select:columns,status:'eq.available',expiry_date:`gte.${new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date())}`,order:'created_at.desc',limit:'100'});
  if(url.searchParams.get('brand'))q.set('brand',`eq.${url.searchParams.get('brand')}`);
  if(['discount','worth'].includes(url.searchParams.get('category')))q.set('category',`eq.${url.searchParams.get('category')}`);
  q.set('order',{price_asc:'sale_price.asc,created_at.desc',price_desc:'sale_price.desc,created_at.desc',expiring:'expiry_date.asc,created_at.desc'}[url.searchParams.get('sort')]??'created_at.desc');
  // Search runs in the database. Only letters, digits, spaces and a few brand
  // punctuation marks survive, so no PostgREST filter syntax can be injected.
  const search=searchTerm(url.searchParams.get('search'));
  if(search)q.set('or',`(title.ilike."*${search}*",brand.ilike."*${search}*")`);
  const rows=await rest(`helpyy_coupons?${q}`);
  return json(rows.map(listing));
 }
 const single=method==='GET'&&path.match(/^\/api\/coupons\/(\d{1,15})$/);
 if(single){
  // Same visibility as the list: available and unexpired only. Never includes the code.
  const rows=await rest(`helpyy_coupons?${new URLSearchParams({select:columns,id:`eq.${single[1]}`,status:'eq.available',expiry_date:`gte.${new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date())}`})}`);
  return rows.length?json(listing(rows[0])):json({error:'This offer is no longer available.'},404);
 }
 if(!token?.startsWith('Bearer '))return json({error:'Sign in to continue.'},401);
 const auth=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers,signal:AbortSignal.timeout(10000)});
 if(!auth.ok)return json({error:'Session expired. Sign in again.'},401);
 const user=await auth.json();
 if(path.startsWith('/api/admin/')){
  // The database decides who is a reviewer; every function below re-checks it.
  if(!upiId)return json({error:'Payment review is disabled.'},403);
  if(method==='GET'&&path==='/api/admin/purchases')return json(await rpc('helpyy_admin_purchases'));
  if(method==='GET'&&path==='/api/admin/payout-requests')return json(await rpc('helpyy_admin_payouts'));
  const review=method==='PATCH'&&path.match(/^\/api\/admin\/(purchases|payout-requests)\/(\d{1,15})$/);
  if(review){
   const input=await body(),purchase=review[1]==='purchases';
   if(!(purchase?['verified','rejected']:['paid','rejected']).includes(input.status))return json({error:'Choose a valid review status.'},400);
   return json(await rpc(purchase?'helpyy_review_purchase':'helpyy_review_payout',{p_id:Number(review[2]),p_status:input.status}));
  }
  return json({error:'Not found.'},404);
 }
 if(method==='PATCH')return json({error:'Method not allowed.'},405);
 if(method==='POST'&&path==='/api/purchases'){
  const input=await body(),reference=typeof input.paymentReference==='string'?input.paymentReference.replace(/\s/g,'').toUpperCase():'';
  if(!Number.isSafeInteger(input.couponId)||input.couponId<1)return json({error:'Choose an offer.'},400);
  if(!/^[A-Z0-9]{6,40}$/.test(reference))return json({error:'Enter the transaction reference exactly as your UPI app shows it (6–40 letters or digits).'},400);
  return json(await rpc('helpyy_create_purchase',{p_coupon_id:input.couponId,p_reference:reference}),201);
 }
 if(method==='POST'&&path==='/api/payout-requests'){
  const input=await body(),target=typeof input.upiId==='string'?input.upiId.trim():'';
  if(!/^[A-Za-z0-9._-]{2,255}@[A-Za-z0-9._-]{2,64}$/.test(target))return json({error:'Enter a valid UPI ID, like name@bank.'},400);
  return json(await rpc('helpyy_create_payout',{p_upi_id:target}),201);
 }
 if(method==='POST'&&path==='/api/coupons'){
  const input=await body();
  const error=validateCoupon(input);if(error)return json({error},400);
  const rows=await rest('rpc/helpyy_create_coupon',{method:'POST',body:JSON.stringify({payload:input})});
  return json(listing(rows[0]),201);
 }
 if(method==='GET'&&path==='/api/seller/coupons'){
  const rows=await rest(`helpyy_coupons?select=${columns}&seller_id=eq.${user.id}&order=created_at.desc&limit=100`);
  const codes=await rest(`helpyy_coupon_codes?select=coupon_id,code&seller_id=eq.${user.id}&limit=100`);
  return json(rows.map(c=>({...listing(c),code:codes.find(x=>x.coupon_id===c.id)?.code??'',paymentStatus:c.status==='reserved'?'pending':c.status==='sold'?'verified':null})));
 }
 const withdraw=method==='POST'&&path.match(/^\/api\/seller\/coupons\/(\d{1,15})\/withdraw$/);
 if(withdraw){
  // RLS limits the update to the caller's own rows; the seller filter is defence in depth.
  const rows=await rest(`helpyy_coupons?id=eq.${withdraw[1]}&seller_id=eq.${user.id}&status=eq.available&select=${columns}`,{method:'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify({status:'withdrawn'})});
  if(!rows.length)return json({error:'Listing not found, or already withdrawn.'},404);
  return json(listing(rows[0]));
 }
 if(method==='GET'&&path==='/api/seller/summary')return json(await rpc('helpyy_seller_summary'));
 if(method==='GET'&&path==='/api/transactions')return json(await rpc('helpyy_transactions'));
 if(method==='GET'&&path==='/api/payout-requests')return json(await rpc('helpyy_my_payouts'));
 return json({error:'Not found.'},404);
}
export default {async fetch(request,env){
 let response;
 try{response=new URL(request.url).pathname.startsWith('/api/')?await api(request,env):await env.ASSETS.fetch(request);}
 catch(error){response=error instanceof ApiError?json({error:error.message},error.status):json({error:'Service temporarily unavailable. Please try again.'},503);}
 const headers=new Headers(response.headers);
 headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('X-Frame-Options','DENY');headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');headers.set('Strict-Transport-Security','max-age=31536000');
 headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' "+env.SUPABASE_URL+"; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
 return new Response(response.body,{status:response.status,headers});
}};
