import {randomBytes,createHash,scrypt as callbackScrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(callbackScrypt);
export const randomToken=()=>randomBytes(32).toString('base64url');
export const hash=value=>createHash('sha256').update(String(value)).digest('hex');
export class AppError extends Error{constructor(status,message){super(message);this.status=status;}}
export function assert(ok,status,message){if(!ok)throw new AppError(status,message);}
export const email=value=>typeof value==='string'?value.trim().toLowerCase():'';
export const validEmail=value=>typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const validId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export function strongPassword(value){return typeof value==='string'&&value.length>=12&&Buffer.byteLength(value)<=128&&[ /[a-z]/,/[A-Z]/,/[0-9]/,/[^a-zA-Z0-9]/ ].filter(r=>r.test(value)).length>=3;}
export async function passwordHash(value){const salt=randomBytes(16).toString('hex');const derived=await scrypt(value,salt,64,{N:32768,r:8,p:1,maxmem:128*1024*1024});return `scrypt$${salt}$${derived.toString('hex')}`;}
export async function verifyPassword(value,stored){
 if(typeof value!=='string'||Buffer.byteLength(value)>128||typeof stored!=='string')return false;
 const [kind,salt,digest]=stored.split('$');if(kind!=='scrypt'||!salt||!/^[a-f0-9]{128}$/.test(digest||''))return false;
 const actual=await scrypt(value,salt,64,{N:32768,r:8,p:1,maxmem:128*1024*1024});return timingSafeEqual(actual,Buffer.from(digest,'hex'));
}
export function cookies(req){const result={};for(const part of (req.headers.cookie||'').split(';')){const p=part.indexOf('=');if(p>0)result[part.slice(0,p).trim()]=part.slice(p+1).trim();}return result;}
export const validToken=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
export function text(value,max=200){assert(typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\x00-\x08]/.test(value),400,'A required field is missing or too long');return value.trim();}
export function safeData(value){
 assert(value&&typeof value==='object'&&!Array.isArray(value),400,'Invalid form data');
 assert(JSON.stringify(value).length<=200000,413,'Record is too large');
 function walk(v,depth=0){assert(depth<10,400,'Data is nested too deeply');if(Array.isArray(v)){assert(v.length<=1000,400,'Too many items');return v.map(x=>walk(x,depth+1));}if(v&&typeof v==='object'){const result={};for(const [k,x]of Object.entries(v)){assert(!k.startsWith('$')&&!k.includes('.')&&!['__proto__','constructor','prototype'].includes(k),400,'Invalid field name');result[k]=walk(x,depth+1);}return result;}assert(v===null||['string','number','boolean'].includes(typeof v),400,'Invalid field value');return v;}
 return walk(value);
}
