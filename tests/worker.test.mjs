import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{validateCoupon,searchTerm} from '../deployment/worker.mjs';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test'};
test('payment writes are denied before auth or database access',async()=>{
 for(const path of ['/api/purchases','/api/payout-requests','/api/admin/purchases/1','/api/admin/payout-requests/1']){
  const res=await worker.fetch(new Request('https://test'+path,{method:path.includes('/admin/')?'PATCH':'POST'}),env);
  assert.equal(res.status,403);assert.match((await res.json()).error,/disabled/);
 }
});
test('private seller and transaction endpoints require authentication',async()=>{
 for(const path of ['/api/seller/coupons','/api/seller/summary','/api/transactions','/api/admin/purchases'])assert.equal((await worker.fetch(new Request('https://test'+path),env)).status,401);
});
test('reject forged prices, invalid dates and malformed coupon input',()=>{
 const valid={brand:'Amazon',category:'discount',title:'Test coupon',code:'PRIVATE',discountPercent:20,expiryDate:'2099-12-31'};
 assert.equal(validateCoupon(valid),null);
 for(const patch of [{brand:'Unknown'},{discountPercent:101},{discountPercent:null},{expiryDate:'2099-02-31'},{expiryDate:'2020-01-01'},{title:''},{code:''},{couponValue:100},{category:'other'}])assert.equal(typeof validateCoupon({...valid,...patch}),'string');
});
test('public catalog and pricing are available and carry security headers',async()=>{
 const res=await worker.fetch(new Request('https://test/api/pricing'),env);assert.equal(res.status,200);assert.equal((await res.json()).length,5);assert.equal(res.headers.get('X-Frame-Options'),'DENY');
});
test('search terms cannot carry PostgREST filter syntax',()=>{
 assert.equal(searchTerm('  Domino\'s  pizza '),"Domino's pizza");
 assert.equal(searchTerm('x",id.gt.0),or=(a*%_\\'),'x id.gt.0 or a');
 assert.equal(searchTerm(null),'');assert.equal(searchTerm('a'.repeat(200)).length,80);
});
// Stand-in for Supabase: records what the Worker asks the database to do.
async function withSupabase(handler,run){
 const real=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,init={})=>{calls.push({url:String(url),init});return handler(String(url),init);};
 try{await run(calls);}finally{globalThis.fetch=real;}
}
const row={id:7,brand:'Amazon',category:'discount',title:'Test',discount_percent:20,coupon_value:null,expiry_date:'2099-12-31',sale_price:10,commission:7,seller_earnings:3,status:'withdrawn'};
test('search is pushed to the database as a quoted ilike filter',async()=>{
 await withSupabase(()=>Response.json([]),async calls=>{
  const res=await worker.fetch(new Request('https://test/api/coupons?search='+encodeURIComponent('piz"za)')+'&brand=KFC'),env);
  assert.equal(res.status,200);
  const q=new URL(calls[0].url).searchParams;
  assert.equal(q.get('or'),'(title.ilike."*piz za*",brand.ilike."*piz za*")');assert.equal(q.get('brand'),'eq.KFC');assert.equal(q.get('status'),'eq.available');
 });
});
test('withdraw is scoped to the signed-in seller and 404s for other rows',async()=>{
 for(const [rows,status] of [[[row],200],[[],404]]){
  await withSupabase(url=>url.includes('/auth/v1/user')?Response.json({id:'user-1'}):Response.json(rows),async calls=>{
   const res=await worker.fetch(new Request('https://test/api/seller/coupons/7/withdraw',{method:'POST',headers:{authorization:'Bearer t'}}),env);
   assert.equal(res.status,status);
   const patch=calls.find(c=>c.init.method==='PATCH');
   assert.match(patch.url,/id=eq\.7&seller_id=eq\.user-1&status=eq\.available/);assert.equal(patch.init.body,'{"status":"withdrawn"}');assert.equal(patch.init.headers.Authorization,'Bearer t');
  });
 }
 assert.equal((await worker.fetch(new Request('https://test/api/seller/coupons/7/withdraw',{method:'POST'}),env)).status,401);
 await withSupabase(()=>new Response('{}',{status:401}),async()=>{
  assert.equal((await worker.fetch(new Request('https://test/api/seller/coupons/7/withdraw',{method:'POST',headers:{authorization:'Bearer bad'}}),env)).status,401);
 });
});
const pay={...env,UPI_ID:'shop@upi'};
test('payments switch on only with a valid UPI ID, and still need sign-in',async()=>{
 assert.deepEqual(await (await worker.fetch(new Request('https://test/api/config'),env)).json(),{paymentsEnabled:false,payoutsEnabled:false,upiId:null});
 assert.equal((await (await worker.fetch(new Request('https://test/api/config'),{...env,UPI_ID:'not a upi id'})).json()).paymentsEnabled,false);
 assert.equal((await (await worker.fetch(new Request('https://test/api/config'),pay)).json()).upiId,'shop@upi');
 for(const [path,method] of [['/api/purchases','POST'],['/api/payout-requests','POST'],['/api/admin/purchases/1','PATCH'],['/api/admin/purchases','GET']])
  assert.equal((await worker.fetch(new Request('https://test'+path,{method}),pay)).status,401);
});
test('purchase input is validated, normalised, and database refusals are passed on',async()=>{
 const post=(path,data,method='POST')=>worker.fetch(new Request('https://test'+path,{method,headers:{authorization:'Bearer t','content-type':'application/json'},body:JSON.stringify(data)}),pay);
 await withSupabase((url,init)=>url.includes('/auth/v1/user')?Response.json({id:'user-1'}):url.includes('helpyy_review_purchase')?Response.json({code:'42501',message:'Reviewer access required'},{status:403}):url.includes('helpyy_create_payout')?Response.json({code:'P0001',message:'HELPYY:There are no earnings to claim yet.'},{status:400}):Response.json({id:1,status:'pending'}),async calls=>{
  assert.equal((await post('/api/purchases',{couponId:1,paymentReference:'12'})).status,400);
  assert.equal((await post('/api/purchases',{couponId:'1',paymentReference:'123456789012'})).status,400);
  assert.equal((await post('/api/purchases',{couponId:1,paymentReference:' ab12 3456 7890 '})).status,201);
  assert.equal(calls.find(c=>c.url.includes('helpyy_create_purchase')).init.body,'{"p_coupon_id":1,"p_reference":"AB1234567890"}');
  assert.equal((await post('/api/admin/purchases/1',{status:'verified'},'PATCH')).status,403);
  assert.equal((await post('/api/admin/purchases/1',{status:'paid'},'PATCH')).status,400);
  assert.equal((await post('/api/payout-requests',{upiId:'nope'})).status,400);
  const refused=await post('/api/payout-requests',{upiId:'me@bank'});assert.equal(refused.status,409);assert.equal((await refused.json()).error,'There are no earnings to claim yet.');
 });
});
