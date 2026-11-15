import { createContext, useContext, useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import { setAuthTokenGetter } from '@workspace/api-client-react';
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
setAuthTokenGetter(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);
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
function AuthForm({signup=false}:{signup?:boolean}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setMessage('');
    try {
      const {data,error}=signup?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});
      if(error) setMessage(error.message);
      else if(data.session) window.location.assign('/dashboard');
      else setMessage('Check your email to confirm your account, then return here to sign in.');
    }catch{setMessage('Unable to connect. Please try again.');}finally{setBusy(false);}
  }
  return <form onSubmit={submit} className="auth-card" style={{width:'100%',maxWidth:440,padding:32,background:'#fffdf8',borderRadius:24,boxShadow:'0 12px 40px #253b3212'}}>
    <h1 className="font-display">{signup?'Join helpay':'Welcome back'}</h1><p>{signup?'Create your account to get started':'Sign in to find your next good offer'}</p>
    <label className="label" htmlFor="auth-email">Email address</label><input className="field" id="auth-email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/>
    <label className="label" htmlFor="auth-password">Password</label><input className="field" id="auth-password" type="password" autoComplete={signup?'new-password':'current-password'} minLength={8} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/>
    {signup&&<p className="form-help">Use at least 8 characters. Confirm your email before signing in.</p>}
    {message&&<p role="status" className="form-help">{message}</p>}
    <button className="btn btn-primary full-width" disabled={busy} style={{marginTop:20}}>{busy?'Please wait…':signup?'Create account':'Sign in'}</button>
    <p style={{marginTop:20}}>{signup?'Already have an account?':'New to helpay?'} <a className="text-link" href={signup?'/sign-in':'/sign-up'}>{signup?'Sign in':'Create account'}</a></p>
  </form>;
}
export function SignIn(_props:Record<string,unknown>){return <AuthForm/>;}
export function SignUp(_props:Record<string,unknown>){return <AuthForm signup/>;}
