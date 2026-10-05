import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import request from 'supertest';
import {MongoClient,GridFSBucket} from 'mongodb';
import {prepare} from '../server/src/db.mjs';
import {createApp} from '../server/src/app.mjs';
import {passwordHash,randomToken,hash} from '../server/src/security.mjs';
import {VIEWS} from '../shared/domain.mjs';
// Real MongoDB test. Never silently substitutes an in-memory mock.
test('isolated Atlas: setup, duplicates, activation, devices, data scope and session expiry',async()=>{
 const uri=process.env.TEST_MONGODB_URI;assert(uri,'Set TEST_MONGODB_URI to an EMPTY, dedicated database named navin_crm_test_<suffix>');
 const name=new URL(uri).pathname.slice(1);assert(/^navin_crm_test_[a-z0-9_-]+$/i.test(name),'A dedicated navin_crm_test_<suffix> database is required');
 const client=new MongoClient(uri);await client.connect();const db=client.db();let ownsDb=false;
 try{
  assert(!(await db.listCollections().hasNext()),'Refusing a database with existing collections');ownsDb=true;await prepare(db);
  let clock=new Date();const emails=[];const app=createApp({db,client,bucket:new GridFSBucket(db,{bucketName:'attachments'}),mail:async m=>emails.push(m),origin:'http://localhost:3000',now:()=>clock});
  const adminId=randomUUID(),password='Isolated-TEST-Password-42';await db.collection('users').insertOne({_id:adminId,email:'admin@example.test',name:'TEST Admin',role:'Admin',views:VIEWS,departments:[],status:'active',emailVerified:true,passwordHash:await passwordHash(password),devices:[],bootstrapAdmin:true,deviceLimit:2,revision:1,securityVersion:1});
  const admin=request.agent(app),staff=request.agent(app),outsider=request.agent(app),dept=request.agent(app),secondDevice=request.agent(app);const send=(agent,path,body)=>agent.post('/api'+path).set('Origin','http://localhost:3000').send(body);
  await send(admin,'/auth/login',{email:'admin@example.test',password}).expect(200);
  const make=(email,role='Marketing')=>send(admin,'/admin/users',{name:'TEST '+role,email,role,departments:role==='Department'?['Sampling Team']:[],views:role==='Department'?['tasks']:['dashboard','enquiries','tasks','quotations'],deviceLimit:1});
  const created=await make('staff@example.test').expect(201),id=created.body.id;
  await make('STAFF@EXAMPLE.TEST').expect(409);await send(admin,`/admin/users/${id}/action`,{action:'activate'}).expect(409);
  await send(admin,`/admin/users/${id}/setup`,{}).expect(200);const token=new URL(emails.at(-1).url).hash.slice(7);
  await send(staff,'/auth/setup-password',{token,password:'weak'}).expect(400);await send(staff,'/auth/setup-password',{token,password}).expect(200);await send(staff,'/auth/setup-password',{token,password}).expect(400);
  await send(staff,'/auth/login',{email:'staff@example.test',password}).expect(403);await send(admin,`/admin/users/${id}/action`,{action:'activate'}).expect(200);
  await send(staff,'/auth/login',{email:'staff@example.test',password}).expect(202);await staff.get('/api/records/customer').expect(401);
  const u=await db.collection('users').findOne({_id:id});await send(admin,`/admin/devices/${id}/${u.devices[0].id}`,{action:'approve'}).expect(200);
  await send(staff,'/auth/login',{email:'staff@example.test',password}).expect(200);await staff.get('/api/auth/me').expect(200);await staff.get('/api/admin/users').expect(403);await staff.get('/users').expect(403);
  await send(secondDevice,'/auth/login',{email:'staff@example.test',password}).expect(202);const second=(await db.collection('users').findOne({_id:id})).devices[1];await send(admin,`/admin/devices/${id}/${second.id}`,{action:'approve'}).expect(409);
  const own=await send(staff,'/records/customer',{data:{name:'TEST own customer'}}).expect(201);const foreign=await send(admin,'/records/customer',{data:{name:'TEST private customer'}}).expect(201);
  const visible=await staff.get('/api/records/customer').expect(200);assert.equal(visible.body.records.length,1);await staff.get('/api/record/'+foreign.body.id).expect(403);
  await staff.patch('/api/record/'+foreign.body.id).set('Origin','http://localhost:3000').send({revision:1,data:{name:'tamper'}}).expect(403);
  const file=await admin.post('/api/files/'+foreign.body.id).set('Origin','http://localhost:3000').set('Content-Type','application/pdf').set('X-File-Name','TEST.pdf').send(Buffer.from('%PDF-1.4 TEST')).expect(201);await staff.get('/api/download/'+file.body.id).expect(403);await admin.get('/api/download/'+file.body.id).expect(200);
  const task=await send(staff,'/records/task',{customerId:own.body.id,data:{department:'Sampling Team',status:'Sample Request Received',title:'TEST sample'}}).expect(201);
  await staff.patch('/api/record/'+task.body.id).set('Origin','http://localhost:3000').send({revision:1,data:{status:'Task Closed',closeReason:'test'}}).expect(403);
  await admin.patch('/api/record/'+task.body.id).set('Origin','http://localhost:3000').send({revision:1,data:{status:'Task Closed',closeReason:'TEST complete'}}).expect(200);
  await send(admin,`/admin/users/${id}/action`,{action:'force-logout'}).expect(200);await staff.get('/api/auth/me').expect(401);
  await send(staff,'/auth/login',{email:'staff@example.test',password}).expect(200);const before=(await db.collection('sessions').findOne({userId:id})).lastActiveAt;clock=new Date(+clock+40*60000);await staff.get('/api/auth/me').expect(200);assert.equal(+(await db.collection('sessions').findOne({userId:id})).lastActiveAt,+before);clock=new Date(+clock+6*60000);await staff.get('/api/auth/me').expect(401);
  await send(staff,'/auth/login',{email:'staff@example.test',password}).expect(200);await send(admin,'/auth/login',{email:'admin@example.test',password}).expect(200);await send(admin,`/admin/users/${id}/action`,{action:'disable'}).expect(200);await staff.get('/api/auth/me').expect(401);await send(staff,'/auth/login',{email:'staff@example.test',password}).expect(403);
  console.log('Atlas assertions completed. Removing only the dedicated empty-at-start test database.');
 }finally{if(ownsDb)await db.dropDatabase();await client.close();}
});
