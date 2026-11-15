import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{validateCoupon} from '../deployment/worker.mjs';
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
