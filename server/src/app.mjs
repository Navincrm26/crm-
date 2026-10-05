import express from 'express';
import helmet from 'helmet';
import {randomUUID} from 'node:crypto';
import {ObjectId} from 'mongodb';
import {pipeline} from 'node:stream/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {VIEWS,ROLES,STAGES,MASTER_KINDS,quoteLine} from '../../shared/domain.mjs';
import {DEPARTMENTS,taskStatuses} from '../../shared/workflow.mjs';
import {AppError,assert,email,validEmail,validId,validToken,randomToken,hash,passwordHash,verifyPassword,strongPassword,cookies,text,safeData} from './security.mjs';

const HOUR=3600000,IDLE=45*60000,ABSOLUTE=7*24*HOUR;
const typeViews={customer:['dashboard','enquiries','quotations'],enquiry:['enquiries'],task:['tasks'],quotation:['quotations'],master:['masters']};
const taskStaffFields=['status','reply','samples','courier','awb','sentDate','quantity','partQuantity','expectedDate','dispatchDate','vehicle','driverPhone','paymentStatus','commitmentDate','callbackDate','promisedDate','contactPerson','contactPhone','remarks','readyRemark','trackingUrl'];
export function publicUser(u){return {id:u._id,name:u.name,email:u.email,role:u.role,departments:u.departments,views:u.views,status:u.status,emailVerified:!!u.emailVerified,passwordSet:!!u.passwordHash,deviceLimit:u.deviceLimit,revision:u.revision};}
export function createApp({db,client,bucket,mail,origin,production=false,now=()=>new Date(),staticDir=resolve('client/dist')}){
 assert(/^https?:\/\//.test(origin),500,'APP_ORIGIN must be an absolute origin');origin=new URL(origin).origin;
 const app=express(),users=db.collection('users'),sessions=db.collection('sessions'),records=db.collection('records'),roles=db.collection('roles'),audit=db.collection('audit_events');
 app.disable('x-powered-by');if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1);
 app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'","'wasm-unsafe-eval'"],workerSrc:["'self'",'blob:'],connectSrc:["'self'",'https://cdn.jsdelivr.net','https://tessdata.projectnaptha.com'],imgSrc:["'self'",'data:','blob:'],styleSrc:["'self'","'unsafe-inline'"],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:production?[]:null}},strictTransportSecurity:production?undefined:false}));
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('origin')!==origin)return res.status(403).json({error:'Invalid request origin'});next();});
 app.use(express.json({limit:'300kb'}));
 const cookieOptions={httpOnly:true,secure:production,sameSite:'strict',path:'/'};
 const setCookie=(res,name,value,maxAge)=>res.cookie(name,value,{...cookieOptions,maxAge});
 const clearSession=res=>res.clearCookie('crm_sid',cookieOptions);
 const log=async(actor,event,target,detail={})=>audit.insertOne({_id:randomUUID(),actorId:actor?._id||null,event,target,detail,createdAt:now()});
 const sessionHash=req=>validToken(cookies(req).crm_sid)?hash(cookies(req).crm_sid):null;
 async function revokeCurrent(req){const id=sessionHash(req);if(id)await sessions.deleteOne({_id:id});}
 async function rateLimit(req,scope,limit=10){
  const stamp=now(),bucketNumber=Math.floor(+stamp/(15*60000));
  const id=hash(`${scope}:${req.ip}:${bucketNumber}`);
  const hit=await db.collection('rate_limits').findOneAndUpdate({_id:id},{$inc:{count:1},$setOnInsert:{expiresAt:new Date((bucketNumber+2)*15*60000)}},{upsert:true,returnDocument:'after'});
  assert(hit.count<=limit,429,'Too many attempts. Please try again in 15 minutes.');
 }
 async function loadSession(req){
  const id=sessionHash(req);if(!id)return null;const stamp=now();
  const session=await sessions.findOne({_id:id,expiresAt:{$gt:stamp},lastActiveAt:{$gt:new Date(+stamp-IDLE)}});
  if(!session){await sessions.deleteOne({_id:id});return null;}
  const user=await users.findOne({_id:session.userId,status:'active',securityVersion:session.securityVersion});
  if(!user||!user.devices?.some(d=>d.hash===session.deviceHash&&d.status==='approved')){await sessions.deleteOne({_id:id});return null;}
  const role=await roles.findOne({_id:user.role});
  const views=user.role==='Admin'?[...VIEWS]:(user.views||[]).filter(v=>role?.views?.includes(v));
  return {user,session,views};
 }
 const auth=async(req,res,next)=>{const state=await loadSession(req);if(!state){clearSession(res);return res.status(401).json({error:'Please sign in again'});}Object.assign(req,state);next();};
 const admin=(req,res,next)=>req.user.role==='Admin'?next():res.status(403).json({error:'Admin access required'});
 const hasView=(req,view)=>req.user.role==='Admin'||req.views.includes(view);
 const requireView=(req,view)=>assert(hasView(req,view),403,'This page is not assigned to your account');
 const home=req=>req.user.role==='Department'&&req.views.includes('tasks')?'/tasks':'/'+(req.views[0]||'no-access');
 const userSummary=req=>({...publicUser(req.user),views:req.views,dashboardPath:home(req),sessionId:req.session._id.slice(0,8)});
 function scope(req,type){
  assert(Object.hasOwn(typeViews,type),400,'Unknown record type');
  assert(req.user.role==='Admin'||typeViews[type].some(v=>req.views.includes(v)),403,'This page is not assigned to your account');
  if(req.user.role==='Admin')return {type,deleted:{$ne:true}};
  if(type==='master')return {type,deleted:{$ne:true}};
  if(type==='task')return {type,deleted:{$ne:true},$or:[...(req.user.role==='Marketing'?[{ownerId:req.user._id}]:[]),{department:{$in:req.user.departments||[]},$or:[{assigneeIds:req.user._id},{assigneeIds:{$size:0}}]}]};
  assert(req.user.role==='Marketing',403,'Marketing access required');return {type,deleted:{$ne:true},ownerId:req.user._id};
 }
 async function getRecord(req,id){assert(validId(id),404,'Record not found');const record=await records.findOne({_id:id,deleted:{$ne:true}});assert(record,404,'Record not found');assert(await records.findOne({_id:id,...scope(req,record.type)}),403,'Record access denied');return record;}
 const expose=r=>({...r,id:r._id,_id:undefined});
 async function transact(fn){const session=client.startSession();try{return await session.withTransaction(()=>fn(session));}finally{await session.endSession();}}
 async function setupLink(user,send=true){const token=randomToken();await users.updateOne({_id:user._id},{$set:{setupTokenHash:hash(token),setupExpiresAt:new Date(+now()+HOUR)}});const url=origin+'/setup#token='+token;if(send)await mail({to:user.email,name:user.name,url});return url;}
 app.locals.setupLink=setupLink;

 app.get('/api/health',async(req,res)=>{await db.command({ping:1});res.json({status:'ready',database:'MongoDB'});});
 app.post('/api/auth/login',async(req,res)=>{
  await revokeCurrent(req);clearSession(res);await rateLimit(req,'login',20);
  const address=email(req.body.email),password=req.body.password;
  assert(validEmail(address)&&typeof password==='string'&&password.length<=128,400,'Enter a valid email and password');
  const user=await users.findOne({email:address});
  const verified=await verifyPassword(password,user?.passwordHash||('scrypt$'+'0'.repeat(32)+'$'+'0'.repeat(128)));
  assert(verified,401,'Email or password is incorrect');
  assert(user.status==='active'&&user.emailVerified,403,'Your account is waiting for Admin activation or is disabled');
  let deviceToken=cookies(req).crm_device;if(!validToken(deviceToken))deviceToken=randomToken();
  const deviceHash=hash(deviceToken);let device=user.devices?.find(d=>d.hash===deviceHash);
  setCookie(res,'crm_device',deviceToken,365*24*HOUR);
  if(!device){
   const deviceRow={id:randomUUID(),hash:deviceHash,label:String(req.get('user-agent')||'Browser').slice(0,200),createdAt:now(),status:'pending'};
   // Only the first device of the one-time bootstrap Admin is auto-approved.
   const bootstrap=user.bootstrapAdmin&&!(user.devices||[]).length;
   const filter={_id:user._id,status:'active','devices.hash':{$ne:deviceHash},'devices.49':{$exists:false},...(bootstrap?{'devices.0':{$exists:false}}:{})};
   if(bootstrap)deviceRow.status='approved';
   const inserted=await users.updateOne(filter,{$push:{devices:deviceRow}});
   if(inserted.modifiedCount)device=deviceRow;else device=(await users.findOne({_id:user._id}))?.devices?.find(d=>d.hash===deviceHash);
   await log(user,'device.request',user._id,{deviceId:device?.id||null});
  }
  assert(device&&device.status!=='revoked',403,'This device is blocked. Contact Admin.');
  if(device.status!=='approved')return res.status(202).json({status:'DEVICE_APPROVAL_REQUIRED',message:'This device is waiting for Admin approval. Sign in again after approval.'});
  const sid=randomToken(),stamp=now();await sessions.insertOne({_id:hash(sid),userId:user._id,deviceHash,securityVersion:user.securityVersion,createdAt:stamp,lastActiveAt:stamp,expiresAt:new Date(+stamp+ABSOLUTE)});
  setCookie(res,'crm_sid',sid,ABSOLUTE);await log(user,'session.login',user._id,{deviceId:device.id});res.json({ok:true});
 });
 app.post('/api/auth/logout',async(req,res)=>{await revokeCurrent(req);clearSession(res);res.json({ok:true});});
 app.post('/api/auth/setup-password',async(req,res)=>{
  await rateLimit(req,'setup',20);assert(validToken(req.body.token),400,'Setup link is invalid or expired');
  assert(strongPassword(req.body.password),400,'Use at least 12 characters with 3 of: uppercase, lowercase, numbers and symbols');
  const encoded=await passwordHash(req.body.password);
  const user=await users.findOneAndUpdate({setupTokenHash:hash(req.body.token),setupExpiresAt:{$gt:now()}},{$set:{passwordHash:encoded,emailVerified:true,passwordSetAt:now()},$unset:{setupTokenHash:'',setupExpiresAt:''},$inc:{securityVersion:1}},{returnDocument:'after'});
  assert(user,400,'Setup link is invalid, expired or already used');await sessions.deleteMany({userId:user._id});
  if(user.bootstrapAdmin&&user.status==='pending')await users.updateOne({_id:user._id,status:'pending'},{$set:{status:'active'}});
  await log(user,'password.setup',user._id);res.json({ok:true,message:user.bootstrapAdmin?'Password set. You can sign in.':'Password set. Contact Admin for account activation and device approval.'});
 });
 app.get('/api/auth/me',auth,(req,res)=>res.json(userSummary(req)));
 app.post('/api/auth/activity',auth,async(req,res)=>{
  // Polls and GET requests never reach this timestamp update.
  const result=await sessions.updateOne({_id:req.session._id,lastActiveAt:{$gt:new Date(+now()-IDLE)},expiresAt:{$gt:now()}},{$set:{lastActiveAt:now()}});
  assert(result.matchedCount,401,'Session expired');res.json({ok:true});
 });
 app.post('/api/auth/change-password',auth,async(req,res)=>{
  await rateLimit(req,'change-password:'+req.user._id,10);
  assert(await verifyPassword(req.body.currentPassword,req.user.passwordHash),403,'Current password is incorrect');
  assert(strongPassword(req.body.password)&&req.body.password!==req.body.currentPassword,400,'Choose a new password of at least 12 characters and 3 character classes');
  await users.updateOne({_id:req.user._id},{$set:{passwordHash:await passwordHash(req.body.password)},$inc:{securityVersion:1}});await sessions.deleteMany({userId:req.user._id});clearSession(res);await log(req.user,'password.change',req.user._id);res.json({ok:true});
 });
 app.get('/api/directory',auth,async(req,res)=>{
  const filter=req.user.role==='Department'?{_id:req.user._id}:{status:'active'};
  res.json({users:(await users.find(filter,{projection:{name:1,role:1,departments:1}}).toArray()).map(u=>({id:u._id,name:u.name,role:u.role,departments:u.departments})),departments:DEPARTMENTS,stages:STAGES});
 });
 app.get('/api/admin/users',auth,admin,async(req,res)=>res.json({users:(await users.find().sort({name:1}).toArray()).map(publicUser),roles:await roles.find().toArray(),departments:DEPARTMENTS,views:VIEWS}));
 function assignment(body){
  assert(['Marketing','Department'].includes(body.role),400,'Choose Marketing or Department');
  assert(Array.isArray(body.departments)&&body.departments.length<=3&&body.departments.every(d=>DEPARTMENTS.includes(d)),400,'Choose valid departments');
  assert(body.role!=='Department'||body.departments.length>0,400,'Select at least one department');
  assert(Array.isArray(body.views)&&body.views.length>0&&body.views.every(v=>VIEWS.includes(v)),400,'Select permitted views');
  const deviceLimit=Number(body.deviceLimit||1);assert([1,2].includes(deviceLimit),400,'Device limit must be 1 or 2');
  return {role:body.role,departments:[...new Set(body.departments)],views:[...new Set(body.views)],deviceLimit};
 }
 app.post('/api/admin/users',auth,admin,async(req,res)=>{
  const name=text(req.body.name,120),address=email(req.body.email);assert(validEmail(address),400,'Enter a valid email');
  const assign=assignment(req.body);assert(assign.role!=='Department'||assign.views.every(v=>v==='tasks'),400,'Department accounts support the tasks view');const role=await roles.findOne({_id:assign.role});assert(assign.views.every(v=>role.views.includes(v)),400,'Selected views are not allowed by the role');
  const user={_id:randomUUID(),name,email:address,...assign,status:'pending',passwordHash:null,emailVerified:false,devices:[],securityVersion:1,revision:1,createdAt:now()};
  await users.insertOne(user);await log(req.user,'user.create',user._id,{email:address,role:user.role});res.status(201).json(publicUser(user));
 });
 app.patch('/api/admin/users/:id',auth,admin,async(req,res)=>{
  const user=await users.findOne({_id:req.params.id});assert(user&&user.role!=='Admin',400,'Staff account required');
  const assign=assignment(req.body);assert(assign.role!=='Department'||assign.views.every(v=>v==='tasks'),400,'Department accounts support the tasks view');const role=await roles.findOne({_id:assign.role});assert(assign.views.every(v=>role.views.includes(v)),400,'Views are not allowed by the role');
  assert(user.devices.filter(d=>d.status==='approved').length<=assign.deviceLimit,409,'Revoke extra devices before lowering the device limit');
  const result=await users.updateOne({_id:user._id,revision:req.body.revision},{$set:assign,$inc:{revision:1,securityVersion:1}});assert(result.modifiedCount,409,'Account changed. Reload and retry');await sessions.deleteMany({userId:user._id});await log(req.user,'user.permissions',user._id,assign);res.json({ok:true});
 });
 app.post('/api/admin/users/:id/setup',auth,admin,async(req,res)=>{
  await rateLimit(req,'send-setup:'+req.params.id,4);const user=await users.findOne({_id:req.params.id});assert(user&&user.role!=='Admin'&&user.status!=='disabled',400,'Select a pending or active staff account');
  try{await setupLink(user);}catch{throw new AppError(502,'Setup email could not be sent. Check the server SMTP configuration before retrying.');}
  await log(req.user,'user.setup-email',user._id);res.json({ok:true,message:'Private setup email sent'});
 });
 app.post('/api/admin/users/:id/action',auth,admin,async(req,res)=>{
  const user=await users.findOne({_id:req.params.id});assert(user&&user._id!==req.user._id&&user.role!=='Admin',400,'Select a staff account');
  const action=req.body.action;assert(['activate','disable','force-logout'].includes(action),400,'Invalid action');
  if(action==='activate')assert(user.passwordHash&&user.emailVerified,409,'The user must finish private password setup first');
  await users.updateOne({_id:user._id},{$set:action==='force-logout'?{}:{status:action==='activate'?'active':'disabled'},$inc:{securityVersion:1,revision:1}});
  await sessions.deleteMany({userId:user._id});await log(req.user,'user.'+action,user._id);res.json({ok:true});
 });
 app.patch('/api/admin/roles/:role',auth,admin,async(req,res)=>{
  assert(['Marketing','Department'].includes(req.params.role)&&Array.isArray(req.body.views)&&req.body.views.length>0&&req.body.views.every(v=>VIEWS.includes(v)),400,'Invalid role views');
  assert(req.params.role!=='Department'||req.body.views.every(v=>v==='tasks'),400,'Department role supports the tasks view');
  const result=await roles.updateOne({_id:req.params.role,revision:req.body.revision},{$set:{views:[...new Set(req.body.views)]},$inc:{revision:1}});assert(result.modifiedCount,409,'Role changed. Reload and retry');const affected=(await users.find({role:req.params.role},{projection:{_id:1}}).toArray()).map(u=>u._id);await users.updateMany({_id:{$in:affected}},{$inc:{securityVersion:1}});await sessions.deleteMany({userId:{$in:affected}});await log(req.user,'role.permissions',req.params.role,{views:req.body.views});res.json({ok:true});
 });
 app.get('/api/admin/security',auth,admin,async(req,res)=>{
  const list=await users.find({},{projection:{name:1,email:1,devices:1,deviceLimit:1}}).toArray();
  res.json({devices:list.flatMap(u=>(u.devices||[]).map(d=>({id:d.id,status:d.status,label:d.label,createdAt:d.createdAt,userId:u._id,name:u.name,email:u.email,deviceLimit:u.deviceLimit}))),sessions:await sessions.find({expiresAt:{$gt:now()},lastActiveAt:{$gt:new Date(+now()-IDLE)}},{projection:{_id:0,deviceHash:0,securityVersion:0}}).toArray(),events:await audit.find().sort({createdAt:-1}).limit(200).toArray()});
 });
 app.post('/api/admin/devices/:userId/:deviceId',auth,admin,async(req,res)=>{
  const {userId,deviceId}=req.params;assert(['approve','revoke'].includes(req.body.action),400,'Invalid device action');
  const user=await users.findOne({_id:userId});assert(user&&user.role!=='Admin',400,'Staff device required');
  const device=user.devices.find(d=>d.id===deviceId);assert(device,404,'Device not found');
  if(req.body.action==='approve'){
   assert(user.status==='active'&&device.status==='pending',409,'Activate the account and select a pending device');
   const approvedCount={$size:{$filter:{input:'$devices',as:'d',cond:{$eq:['$$d.status','approved']}}}};
   const result=await users.updateOne({_id:userId,status:'active',devices:{$elemMatch:{id:deviceId,status:'pending'}},$expr:{$lt:[approvedCount,'$deviceLimit']}},{$set:{'devices.$[d].status':'approved'}},{arrayFilters:[{'d.id':deviceId,'d.status':'pending'}]});
   assert(result.modifiedCount,409,'Device limit reached or device already changed');
  }else{await users.updateOne({_id:userId},{$set:{'devices.$[d].status':'revoked'}},{arrayFilters:[{'d.id':deviceId}]});await sessions.deleteMany({userId,deviceHash:device.hash});}
  await log(req.user,'device.'+req.body.action,userId,{deviceId});res.json({ok:true});
 });

 app.get('/api/quote-catalog',auth,async(req,res)=>{requireView(req,'quotations');res.json({records:(await records.find({type:'master',deleted:{$ne:true}}).toArray()).map(expose)});});
 app.get('/api/records/:type',auth,async(req,res)=>{
  const filter=scope(req,req.params.type);const rows=await records.find(filter).sort({updatedAt:-1}).limit(10000).toArray();res.json({records:rows.map(expose)});
 });
 app.get('/api/record/:id',auth,async(req,res)=>res.json(expose(await getRecord(req,req.params.id))));
 function validateRecord(type,data){
  if(type==='customer')data.name=text(data.name,200);
  if(type==='enquiry'){data.title=text(data.title,200);assert(STAGES.includes(data.status),400,'Select an enquiry stage');if(data.status==='Closed')data.closeReason=text(data.closeReason,1000);}
  if(type==='task'){assert(DEPARTMENTS.includes(data.department),400,'Select a department');assert([...taskStatuses(data.department),'Assigned','Task Closed'].includes(data.status),400,'Select a status for this department');if(data.status==='Task Closed')data.closeReason=text(data.closeReason,1000);}
  if(type==='master'){for(const k of ['ppGrams','job','packing','clips','hook','cost','grammage','inward','calledOut','quantity'])if(data[k]!=null)assert(Number.isFinite(Number(data[k]))&&Number(data[k])>=0,400,'Master costs and quantities must be non-negative numbers');assert(MASTER_KINDS.includes(data.kind),400,'Select a master kind');data.label=text(data.label||data.code,120);}
  if(type==='quotation'){data.customerName=text(data.customerName,200);assert(Array.isArray(data.items)&&data.items.length>0&&data.items.length<=100,400,'Add quotation items');assert(Number(data.margin)>=0&&Number(data.margin)<=100,400,'Invalid margin');}
  for(const key of ['phone','contactPhone','driverPhone'])if(data[key])assert(String(data[key]).length<=40,400,'Phone number is too long');
  return data;
 }
 async function computeQuote(data){const masters=(await records.find({type:'master',deleted:{$ne:true}}).toArray()).map(r=>r.data);data.items=data.items.map(item=>{assert(item&&typeof item==='object',400,'Invalid quote item');assert(masters.some(m=>(m.kind==='model'||m.kind==='trading')&&String(m.code).toUpperCase()===String(item.model).toUpperCase()),400,'Create the model or trading item in Masters first');for(const k of ['printingCost','inward','manualRate'])if(item[k]!==''&&item[k]!=null)assert(Number.isFinite(Number(item[k]))&&Number(item[k])>=0,400,'Item prices must be non-negative numbers');assert(Number(item.quantity||0)>=0&&Number(item.quantity||0)<=1e9,400,'Invalid item quantity');const line=quoteLine(item,masters,data.margin);assert(line.rate>=0&&Number.isFinite(line.rate),400,'Invalid quote price');return line;});data.total=data.items.reduce((sum,i)=>sum+i.amount,0);return data;}
 app.post('/api/records/:type',auth,async(req,res)=>{
  const type=req.params.type;scope(req,type);assert(req.user.role!=='Department',403,'Department users may reply only to assigned tasks');
  let data=validateRecord(type,safeData(req.body.data));const stamp=now();let ownerId=req.user._id,customerId=null,enquiryId=null;
  if(type==='master')requireView(req,'masters');
  if(type==='customer'&&req.user.role==='Admin'&&req.body.ownerId){const owner=await users.findOne({_id:req.body.ownerId,status:'active',role:{$in:['Marketing','Admin']}});assert(owner,400,'Select an active marketing owner');ownerId=owner._id;}
  if(['enquiry','task','quotation'].includes(type)){
   const customer=await getRecord(req,req.body.customerId);assert(customer.type==='customer',400,'Customer required');customerId=customer._id;ownerId=customer.ownerId;data.customerName=customer.data.name;
  }
  if(type==='task'&&data.status==='Task Closed')assert(req.user.role==='Admin',403,'Only Admin may close department tasks');
  if(type==='task'&&req.body.enquiryId){const enquiry=await getRecord(req,req.body.enquiryId);assert(enquiry.type==='enquiry'&&enquiry.customerId===customerId,400,'Enquiry does not belong to this customer');enquiryId=enquiry._id;}
  const assigneeIds=type==='task'?(req.body.assigneeIds||[]):[];assert(Array.isArray(assigneeIds)&&assigneeIds.length<=30&&assigneeIds.every(validId),400,'Invalid assignees');
  if(assigneeIds.length)assert(await users.countDocuments({_id:{$in:assigneeIds},status:'active',departments:data.department})===new Set(assigneeIds).size,400,'Choose active staff assigned to that department');
  if(type==='quotation'){data=await computeQuote(data);const counter=await db.collection('counters').findOneAndUpdate({_id:'quotation-26-27'},{$inc:{value:1}},{upsert:true,returnDocument:'after'});data.number=`NP/26-27/${String(counter.value).padStart(5,'0')}`;data.status='Draft';}
  const record={_id:randomUUID(),type,ownerId,customerId,enquiryId,department:type==='task'?data.department:null,assigneeIds,data,revision:1,history:[{at:stamp,by:req.user._id,action:'created',status:data.status||null}],createdAt:stamp,updatedAt:stamp,createdBy:req.user._id};
  await records.insertOne(record);await log(req.user,type+'.create',record._id);res.status(201).json(expose(record));
 });
 app.patch('/api/record/:id',auth,async(req,res)=>{
  const current=await getRecord(req,req.params.id);assert(Number.isInteger(req.body.revision),400,'Revision required');
  assert(current.data.status!=='Task Closed'||req.user.role==='Admin',403,'Only Admin may change closed department tasks');
  const incoming=safeData(req.body.data);let data;
  if(req.user.role==='Department'){
   assert(current.type==='task',403,'Only assigned tasks can be updated');assert(Object.keys(incoming).every(k=>taskStaffFields.includes(k)),403,'Only task reply fields may be changed');data={...current.data,...incoming};
  }else data={...current.data,...incoming};
  if(current.type==='task'){
   assert(data.department===current.department,403,'Task department cannot be changed');
   if(data.status==='Task Closed')assert(req.user.role==='Admin',403,'Only Admin may close department tasks');
  }
  data=validateRecord(current.type,data);
  if(current.type==='quotation'){data.number=current.data.number;data=await computeQuote(data);}
  let ownerId=current.ownerId;const ownerChange=req.body.ownerId&&req.body.ownerId!==ownerId;
  if(ownerChange){assert(req.user.role==='Admin'&&current.type==='customer',403,'Only Admin may reassign customers');const target=await users.findOne({_id:req.body.ownerId,status:'active',role:{$in:['Admin','Marketing']}});assert(target,400,'Select an active owner');ownerId=target._id;}
  const event={at:now(),by:req.user._id,action:'updated',status:data.status||null,reply:typeof incoming.reply==='string'?incoming.reply:null};
  await transact(async(session)=>{
   const updated=await records.updateOne({_id:current._id,revision:req.body.revision,deleted:{$ne:true}},{$set:{data,ownerId,updatedAt:now()},$inc:{revision:1},$push:{history:{$each:[event],$slice:-500}}},{session});assert(updated.modifiedCount,409,'This record changed. Reload before saving.');
   if(ownerChange)await records.updateMany({customerId:current._id},{$set:{ownerId,updatedAt:now()},$inc:{revision:1}},{session});
   // Task closure is administrative only: it never changes the linked enquiry.
   if(current.type==='task'&&current.enquiryId&&data.status!=='Task Closed'&&data.status!==current.data.status){
    const stage=data.status==='Sample Sent'?'Photo sent':data.status==='Sales Order Uploaded'?'Production':data.status==='Production Completed'?'Quality':['Fully Dispatched','Dispatched'].includes(data.status)?'Payment follow-up':null;
    if(stage)await records.updateOne({_id:current.enquiryId,type:'enquiry','data.status':{$ne:'Closed'},deleted:{$ne:true}},{$set:{'data.status':stage,updatedAt:now()},$inc:{revision:1},$push:{history:{$each:[{...event,action:'department-update',status:stage}],$slice:-500}}},{session});
   }
  });await log(req.user,current.type+'.update',current._id,{ownerChange:!!ownerChange});res.json(expose(await records.findOne({_id:current._id})));
 });
 app.delete('/api/record/:id',auth,admin,async(req,res)=>{
  const record=await getRecord(req,req.params.id);if(record.type==='customer')assert(await records.countDocuments({customerId:record._id,deleted:{$ne:true}})===0,409,'Close or remove linked records before deleting this customer');
  const result=await records.updateOne({_id:record._id,revision:req.body.revision},{$set:{deleted:true,updatedAt:now()},$inc:{revision:1}});assert(result.modifiedCount,409,'Record changed');await log(req.user,record.type+'.delete',record._id);res.json({ok:true});
 });
 app.get('/api/files/:recordId',auth,async(req,res)=>{await getRecord(req,req.params.recordId);res.json({files:await db.collection('file_links').find({recordId:req.params.recordId},{projection:{gridId:0}}).toArray()});});
 app.post('/api/files/:recordId',auth,express.raw({type:()=>true,limit:'10mb'}),async(req,res)=>{
  const record=await getRecord(req,req.params.recordId);assert(record.type!=='master',400,'Attach files to customers, enquiries, tasks or quotations');
  assert(Buffer.isBuffer(req.body)&&req.body.length>0,400,'Select a file');
  const mime=req.get('content-type')?.split(';')[0];assert(['application/pdf','image/jpeg','image/png','image/webp','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(mime),400,'Use PDF, JPG, PNG, WebP, CSV or XLSX');
  const name=decodeURIComponent(req.get('x-file-name')||'attachment').replace(/[\r\n/\\]/g,'_').slice(0,180),id=randomUUID();
  const stream=bucket.openUploadStream(name,{metadata:{recordId:record._id,mime}});await new Promise((resolve,reject)=>{stream.on('error',reject);stream.on('finish',resolve);stream.end(req.body);});
  try{await db.collection('file_links').insertOne({_id:id,recordId:record._id,gridId:stream.id,name,mime,size:req.body.length,createdAt:now(),createdBy:req.user._id});}catch(error){await bucket.delete(stream.id);throw error;}
  await log(req.user,'file.upload',record._id,{fileId:id});res.status(201).json({id,name});
 });
 app.get('/api/download/:id',auth,async(req,res)=>{
  const file=await db.collection('file_links').findOne({_id:req.params.id});assert(file,404,'File not found');await getRecord(req,file.recordId);
  res.set({'Content-Type':file.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Content-Length':String(file.size)});await pipeline(bucket.openDownloadStream(new ObjectId(file.gridId)),res);
 });
 app.delete('/api/files/:id',auth,admin,async(req,res)=>{const file=await db.collection('file_links').findOne({_id:req.params.id});assert(file,404,'File not found');await getRecord(req,file.recordId);await bucket.delete(file.gridId);await db.collection('file_links').deleteOne({_id:file._id});await log(req.user,'file.delete',file.recordId,{fileId:file._id});res.json({ok:true});});
 app.get('/api/admin/export',auth,admin,async(req,res)=>{res.set('Content-Disposition','attachment; filename="navin-crm-records.json"');res.json({format:'navin-mern-v1',exportedAt:now(),records:(await records.find().toArray()).map(expose),users:(await users.find().toArray()).map(publicUser),fileManifest:await db.collection('file_links').find({},{projection:{gridId:0}}).toArray()});});
 app.use('/api',(req,res)=>res.status(404).json({error:'API not found'}));
 if(existsSync(staticDir)){
  app.use(express.static(staticDir,{index:false,maxAge:'1h'}));
  app.get('/{*path}',async(req,res)=>{
   const route=req.path.split('/')[1];if(['dashboard','enquiries','tasks','quotations','masters','users','security','account','print'].includes(route)){
    const state=await loadSession(req);if(!state)return res.redirect(303,'/login');Object.assign(req,state);
    if(['users','security'].includes(route))assert(req.user.role==='Admin',403,'Admin access required');else if(route==='print')requireView(req,'quotations');else if(VIEWS.includes(route))requireView(req,route);
   }res.set('Cache-Control','no-store').sendFile(resolve(staticDir,'index.html'));
  });
 }
 app.use((error,req,res,next)=>{if(res.headersSent)return next(error);if(error.code===11000)return res.status(409).json({error:'This email or record already exists'});const status=error.status||500;if(status>=500)console.error('CRM request failed',error.name);res.status(status).json({error:status>=500&&!(error instanceof AppError)?'Service unavailable. Contact the administrator.':error.message});});
 return app;
}
