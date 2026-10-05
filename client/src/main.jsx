import React,{useState,useEffect,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {api,navigate} from './api';
import {Login,Setup,Account,useSessionActivity} from './auth';
import {Alert,useResource} from './components';
import {Dashboard,Enquiries,Tasks} from './crm';
import {Quotations,QuotePrint} from './quotations';
import {Masters} from './masters';
import {Users,Security} from './admin';
import './styles.css';
export const navigation=[['dashboard','Overview','◈'],['enquiries','Enquiries','↗'],['tasks','Department tasks','▤'],['quotations','Quotations','▧'],['masters','Masters','▦'],['users','Users & roles','◎'],['security','Devices & sessions','◇']];
export function App(){const [user,setUser]=useState(null),[loading,setLoading]=useState(true),[path,setPath]=useState(location.pathname),[error,setError]=useState(''),[menu,setMenu]=useState(false);const directory=useResource(user?'/directory':null);
 const expired=useCallback(()=>{setUser(null);setError('Your session ended. Please sign in again.');navigate('/login');},[]);useSessionActivity(user,expired);
 useEffect(()=>{const route=()=>{setPath(location.pathname);setMenu(false);};window.addEventListener('popstate',route);api('/auth/me').then(u=>{setUser(u);if(['/','/login'].includes(location.pathname))navigate(u.dashboardPath);}).catch(e=>{if(e.status!==401)setError(e.message);}).finally(()=>setLoading(false));return()=>window.removeEventListener('popstate',route);},[]);
 async function logout(){try{await api('/auth/logout','POST',{});setUser(null);navigate('/login');}catch(e){setError(e.message);}}
 if(path==='/setup')return <Setup/>;if(loading)return <main className="loading"><div className="logo">N+</div><p>Opening your workspace…</p></main>;if(!user)return <><Alert>{error}</Alert><Login onLogin={u=>{setUser(u);setError('');}}/></>;
 const key=path.split('/')[1]||'dashboard',allowed=user.role==='Admin'||user.views.includes(key),props={user,directory:directory.data?.users||[]};
 const routes={dashboard:<Dashboard {...props}/>,enquiries:<Enquiries {...props}/>,tasks:<Tasks {...props}/>,quotations:<Quotations {...props}/>,masters:<Masters user={user}/>,users:<Users/>,security:<Security/>,account:<Account onLogout={expired}/>};
 if(key==='print')return user.views.includes('quotations')?<QuotePrint id={path.split('/')[3]}/>:<Alert>This page is not assigned to you.</Alert>;
 let content;if(key==='account')content=routes.account;else if(['users','security'].includes(key))content=user.role==='Admin'?routes[key]:<Alert>Admin access required.</Alert>;else content=allowed&&routes[key]?routes[key]:<section className="panel"><h1>Page not assigned</h1><p>Contact Admin to review your role and permitted views.</p></section>;
 return <div className="app-shell"><aside className={'sidebar '+(menu?'open':'')}><a className="brand" href={user.dashboardPath} onClick={e=>{e.preventDefault();navigate(user.dashboardPath);}}><div className="logo">N<span>+</span></div><div>Navin CRM<small>PLASTIC TECH</small></div></a><p className="nav-label">WORKSPACE</p><nav>{navigation.filter(([route])=>user.role==='Admin'||(!['users','security'].includes(route)&&user.views.includes(route))).map(([route,label,icon])=><a key={route} href={'/'+route} className={key===route?'active':''} onClick={e=>{e.preventDefault();navigate('/'+route);}}><span>{icon}</span>{label}</a>)}</nav><div className="sidebar-bottom"><p>One workspace.<br/>Clear ownership.</p><small>Navin CRM · MERN</small></div></aside><div className="workspace"><header className="topbar"><button className="icon menu-toggle" aria-label="Open navigation" onClick={()=>setMenu(!menu)}>☰</button><span className="workspace-title">{user.role==='Admin'?'Administration':user.role==='Marketing'?'Marketing workspace':'Department workspace'}</span><div className="profile"><div className="avatar">{user.name[0]}</div><button className="text-button" onClick={()=>navigate('/account')}><b>{user.name}</b><small>{user.role}</small></button><button className="secondary small" onClick={logout}>Sign out</button></div></header><main className="main-content"><Alert>{error||directory.error}</Alert>{content}{user.role==='Admin'&&key==='dashboard'&&<p className="small muted"><a href="/api/admin/export">Export CRM records</a> · File bytes require a separate MongoDB backup.</p>}</main></div></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
