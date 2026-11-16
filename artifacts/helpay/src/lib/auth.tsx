import { createContext, useContext, useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import { setAuthTokenGetter } from '@workspace/api-client-react';
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const appUrl = (path: string) => `${window.location.origin}${basePath}${path}`;
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const accessToken = async () => (await supabase.auth.getSession()).data.session?.access_token ?? null;
setAuthTokenGetter(accessToken);
const Context = createContext<{session: Session|null; loaded: boolean}>({session:null, loaded:false});
export function ClerkProvider({children}: {children:ReactNode}) {
  const [state,setState] = useState<{session:Session|null;loaded:boolean}>({session:null,loaded:false});
  useEffect(() => {
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
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>callback({user:session?{id:session.user.id}:null}));
  return ()=>data.subscription.unsubscribe();
};
export function useClerk(){return {addListener,signOut:async ({redirectUrl}:{redirectUrl:string})=>{const {error}=await supabase.auth.signOut();if(!error) window.location.assign(redirectUrl);}};}
/** Authenticated JSON call for endpoints that are not in the generated client. */
export async function apiPost<T>(path: string): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${basePath}${path}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const body = await res.json().catch(() => null) as { error?: string } | null;
  if (!res.ok) throw new Error(body?.error || 'Something went wrong. Please try again.');
  return body as T;
}
const cardStyle = {width:'100%',maxWidth:440,padding:32,background:'#fffdf8',borderRadius:24,boxShadow:'0 12px 40px #253b3212'} as const;
const socialProviders = [
  { id: 'google', label: 'Google', icon: <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z"/></svg> },
  { id: 'facebook', label: 'Facebook', icon: <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.500-4.700 1.300 0 2.700.2 2.700.2v2.900h-1.500c-1.500 0-1.900.9-1.900 1.900V12h3.300l-.5 3.500h-2.800v8.400A12 12 0 0 0 24 12z"/></svg> },
] as const;
/**
 * Google and Facebook buttons. Each one appears only while that provider is
 * switched on in the Supabase project, so visitors never meet a dead button.
 */
function SocialButtons({signup,onError}:{signup:boolean;onError:(message:string)=>void}) {
  const [enabled,setEnabled]=useState<Record<string,boolean>>({});
  const [busy,setBusy]=useState('');
  useEffect(()=>{
    let active=true;
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`,{headers:{apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}})
      .then(res=>res.ok?res.json():null).then(settings=>{if(active&&settings?.external) setEnabled(settings.external);}).catch(()=>{});
    return ()=>{active=false;};
  },[]);
  const available=socialProviders.filter(p=>enabled[p.id]);
  if(!available.length) return null;
  async function start(provider:'google'|'facebook'){
    setBusy(provider);
    try{
      const {error}=await supabase.auth.signInWithOAuth({provider,options:{redirectTo:appUrl('/sign-in')}});
      if(error){onError(error.message);setBusy('');}
    }catch{onError('Unable to connect. Please try again.');setBusy('');}
  }
  return <div style={{display:'grid',gap:10,marginTop:18}}>
    <p className="form-help" style={{textAlign:'center',margin:0}}>or</p>
    {available.map(p=><button key={p.id} type="button" className="btn btn-quiet full-width" style={{justifyContent:'center'}} disabled={!!busy} onClick={()=>void start(p.id)} data-testid={`button-oauth-${p.id}`}>{p.icon} {busy===p.id?'Opening…':`${signup?'Sign up':'Continue'} with ${p.label}`}</button>)}
  </div>;
}
function AuthForm({signup=false}:{signup?:boolean}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);
  // A failed Google/Facebook sign-in comes back here with the reason in the URL.
  const [message,setMessage]=useState(()=>new URLSearchParams(window.location.search).get('error_description')??new URLSearchParams(window.location.hash.slice(1)).get('error_description')??'');
  const {session}=useContext(Context);
  useEffect(()=>{if(session) window.location.replace(appUrl('/dashboard'));},[session]);
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setMessage('');
    try {
      const {data,error}=signup?await supabase.auth.signUp({email,password,options:{emailRedirectTo:appUrl('/dashboard')}}):await supabase.auth.signInWithPassword({email,password});
      if(error) setMessage(error.message);
      // With a session, the effect above moves on to the dashboard.
      else if(!data.session) setMessage('Check your email to confirm your account, then return here to sign in.');
    }catch{setMessage('Unable to connect. Please try again.');}finally{setBusy(false);}
  }
  return <form onSubmit={submit} className="auth-card" style={cardStyle}>
    <h1 className="font-display">{signup?'Join helpay':'Welcome back'}</h1><p>{signup?'Create your account to get started':'Sign in to find your next good offer'}</p>
    <label className="label" htmlFor="auth-email">Email address</label><input className="field" id="auth-email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/>
    <label className="label" htmlFor="auth-password">Password</label><input className="field" id="auth-password" type="password" autoComplete={signup?'new-password':'current-password'} minLength={8} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/>
    {signup?<p className="form-help">Use at least 8 characters. Confirm your email before signing in.</p>:<p className="form-help"><a className="text-link" href={`${basePath}/reset-password`} data-testid="link-forgot-password">Forgot your password?</a></p>}
    {message&&<p role="status" className="form-help">{message}</p>}
    <button className="btn btn-primary full-width" disabled={busy} style={{marginTop:20}}>{busy?'Please wait…':signup?'Create account':'Sign in'}</button>
    <SocialButtons signup={signup} onError={setMessage}/>
    <p style={{marginTop:20}}>{signup?'Already have an account?':'New to helpay?'} <a className="text-link" href={`${basePath}${signup?'/sign-in':'/sign-up'}`}>{signup?'Sign in':'Create account'}</a></p>
  </form>;
}
export function SignIn(_props:Record<string,unknown>){return <AuthForm/>;}
export function SignUp(_props:Record<string,unknown>){return <AuthForm signup/>;}
/**
 * Two steps on one page: ask for a reset email, then (after the emailed link
 * signs the visitor in with a recovery session) choose a new password.
 */
export function ResetPassword() {
  const {session,loaded}=useContext(Context);
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
  const linkError=new URLSearchParams(window.location.hash.slice(1)).get('error_description');
  async function request(e:FormEvent){
    e.preventDefault();setBusy(true);setMessage('');
    try{
      const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:appUrl('/reset-password')});
      // Same message whether or not the address has an account.
      if(error&&error.status===429) setMessage('Too many requests. Please wait a few minutes and try again.');
      else if(error&&!error.status) setMessage('Unable to connect. Please try again.');
      else setDone(true);
    }catch{setMessage('Unable to connect. Please try again.');}finally{setBusy(false);}
  }
  async function update(e:FormEvent){
    e.preventDefault();setBusy(true);setMessage('');
    try{
      const {error}=await supabase.auth.updateUser({password});
      if(error) setMessage(error.message); else window.location.assign(appUrl('/dashboard'));
    }catch{setMessage('Unable to connect. Please try again.');}finally{setBusy(false);}
  }
  if(!loaded) return <div className="auth-card" style={cardStyle}><p>Loading…</p></div>;
  if(session) return <form onSubmit={update} className="auth-card" style={cardStyle}>
    <h1 className="font-display">Choose a new password</h1><p>For {session.user.email}</p>
    <label className="label" htmlFor="new-password">New password</label><input className="field" id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/>
    <p className="form-help">Use at least 8 characters.</p>
    {message&&<p role="alert" className="form-error">{message}</p>}
    <button className="btn btn-primary full-width" disabled={busy} style={{marginTop:20}}>{busy?'Please wait…':'Save new password'}</button>
  </form>;
  return <form onSubmit={request} className="auth-card" style={cardStyle}>
    <h1 className="font-display">Reset your password</h1>
    {done?<p role="status">If an account exists for {email}, a reset link is on its way. Open it on this device to choose a new password.</p>:<>
      <p>Enter your email and we’ll send you a link to choose a new one.</p>
      {linkError&&<p role="alert" className="form-error">That reset link is invalid or has expired. Request a new one below.</p>}
      <label className="label" htmlFor="reset-email">Email address</label><input className="field" id="reset-email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/>
      {message&&<p role="alert" className="form-error">{message}</p>}
      <button className="btn btn-primary full-width" disabled={busy} style={{marginTop:20}}>{busy?'Please wait…':'Send reset link'}</button>
    </>}
    <p style={{marginTop:20}}><a className="text-link" href={`${basePath}/sign-in`}>Back to sign in</a></p>
  </form>;
}
