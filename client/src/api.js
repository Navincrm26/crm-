export async function api(path,method='GET',body){
 const response=await fetch('/api'+path,{method,credentials:'same-origin',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json().catch(()=>({error:'Unexpected server response'}));
 if(!response.ok){const error=new Error(data.error||'Request failed');error.status=response.status;if(response.status===401&&path!=='/auth/login'&&path!=='/auth/me')window.dispatchEvent(new Event('crm:expired'));throw error;}
 return data;
}
export const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(n)||0);
export const dateText=value=>value?new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeZone:'Asia/Kolkata'}).format(new Date(value)):'—';
export function navigate(path){history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));}
