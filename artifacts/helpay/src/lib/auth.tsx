import { createContext, useContext, useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import { setAuthTokenGetter } from '@workspace/api-client-react';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);
const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabasePublishableKey) : null;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
setAuthTokenGetter(async () => supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null);
const Context = createContext<{session: Session|null; loaded: boolean}>({session:null, loaded:false});
export function ClerkProvider({children}: {children:ReactNode}) {
  const [state,setState] = useState<{session:Session|null;loaded:boolean}>({session:null,loaded:false});
  useEffect(() => {
    if (!supabase) {
      setState({session:null,loaded:true});
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({data})=> {if(active) setState({session:data.session,loaded:true});});
    const {data} = supabase.auth.onAuthStateChange((_event, session)=>setState({session,loaded:true}));
    return ()=>{active=false;data.subscription.unsubscribe();};
  },[]);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useAuth(){const {session,loaded}=useContext(Context);return {isLoaded:loaded,isSignedIn:!!session,userId:session?.user.id};}
export function useUser(){const {session}=useContext(Context);return {user:session?{id:session.user.id,fullName:session.user.user_metadata?.full_name as string|undefined,primaryEmailAddress:{emailAddress:session.user.email}}:null};}
const addListener = (callback:(event:{user:{id:string}|null})=>void)=> {
  if (!supabase) return () => {};
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>callback({user:session?{id:session.user.id}:null}));
  return ()=>data.subscription.unsubscribe();
};
export function useClerk(){return {addListener,signOut:async ({redirectUrl}:{redirectUrl:string})=>{if(!supabase) return;const {error}=await supabase.auth.signOut();if(!error) window.location.assign(redirectUrl);}};}
function AuthForm({signup=false}:{signup?:boolean}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setMessage('');
    try {
      if (!supabase) throw new Error('Authentication is not configured.');
      const {data,error}=signup
        ?await supabase.auth.signUp({email,password,options:{emailRedirectTo:new URL(`${basePath}/dashboard`,window.location.origin).toString()}})
        :await supabase.auth.signInWithPassword({email,password});
      if(error) setMessage(error.message);
      else if(data.session) window.location.assign(`${basePath}/dashboard`);
      else setMessage('Check your email to confirm your account, then return here to sign in.');
    }catch{setMessage('Unable to connect. Please try again.');}finally{setBusy(false);}
  }
  async function sendPasswordReset(){
    setBusy(true);setMessage('');
    try {
      if (!supabase) throw new Error('Authentication is not configured.');
      const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:new URL(`${basePath}/reset-password`,window.location.origin).toString()});
      if(error) setMessage(error.message);
      else setMessage('If an account exists for this address, you’ll receive a password reset link shortly.');
    }catch{setMessage('Unable to connect. Please try again.');}finally{setBusy(false);}
  }
  return <form onSubmit={submit} className="auth-card" style={{width:'100%',maxWidth:440,padding:32,background:'#fffdf8',borderRadius:24,boxShadow:'0 12px 40px #253b3212'}}>
    <h1 className="font-display">{signup?'Join OfferPay':'Welcome back'}</h1><p>{signup?'Create your account to get started':'Sign in to find your next good offer'}</p>
    <label className="label" htmlFor="auth-email">Email address</label><input className="field" id="auth-email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/>
    <label className="label" htmlFor="auth-password">Password</label><input className="field" id="auth-password" type="password" autoComplete={signup?'new-password':'current-password'} minLength={8} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/>
    {signup&&<p className="form-help">Use at least 8 characters. Confirm your email before signing in.</p>}
    {!signup&&<button type="button" className="text-link" style={{marginTop:8}} onClick={sendPasswordReset} disabled={busy}>Forgot password?</button>}
    {message&&<p role="status" aria-live="polite" className="form-help">{message}</p>}
    <button className="btn btn-primary full-width" disabled={busy} style={{marginTop:20}}>{busy?'Please wait…':signup?'Create account':'Sign in'}</button>
    <p style={{marginTop:20}}>{signup?'Already have an account?':'New to OfferPay?'} <a className="text-link" href={`${basePath}${signup?'/sign-in':'/sign-up'}`}>{signup?'Sign in':'Create account'}</a></p>
  </form>;
}
export function SignIn(_props:Record<string,unknown>){return <AuthForm/>;}
export function SignUp(_props:Record<string,unknown>){return <AuthForm signup/>;}
export function ResetPassword(){
  const [password,setPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState(''),[message,setMessage]=useState(''),[updated,setUpdated]=useState(false),[busy,setBusy]=useState(false);
  async function submit(e:FormEvent){
    e.preventDefault();setMessage('');
    if(password!==confirmPassword){setMessage('Passwords do not match.');return;}
    setBusy(true);
    try {
      if (!supabase) throw new Error('Authentication is not configured.');
      const {error}=await supabase.auth.updateUser({password});
      if(error) setMessage(error.message);
      else setUpdated(true);
    }catch{setMessage('Unable to connect. Please try again.');}finally{setBusy(false);}
  }
  return <form onSubmit={submit} className="auth-card" style={{width:'100%',maxWidth:440,padding:32,background:'#fffdf8',borderRadius:24,boxShadow:'0 12px 40px #253b3212'}}>
    <h1 className="font-display">Set a new password</h1>
    <p>Choose a new password for your OfferPay account.</p>
    {updated?<><p role="status" aria-live="polite" className="form-help">Your password has been updated.</p><a className="btn btn-primary full-width" href={`${basePath}/dashboard`}>Continue to OfferPay</a></>:<>
      <label className="label" htmlFor="new-password">New password</label><input className="field" id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/>
      <label className="label" htmlFor="confirm-password">Confirm new password</label><input className="field" id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/>
      {message&&<p role="alert" className="form-help">{message}</p>}
      <button className="btn btn-primary full-width" disabled={busy} style={{marginTop:20}}>{busy?'Please wait…':'Update password'}</button>
    </>}
    <p style={{marginTop:20}}><a className="text-link" href={`${basePath}/sign-in`}>Back to sign in</a></p>
  </form>;
}
