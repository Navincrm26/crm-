import {randomUUID} from 'node:crypto';
import {connect} from '../src/db.mjs';
import {email,validEmail,randomToken,hash} from '../src/security.mjs';
import {mailerFromEnv} from '../src/mail.mjs';
import {VIEWS} from '../../shared/domain.mjs';
const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
if(!args.includes('--email')||!args.includes('--name')){console.error('Usage: npm run bootstrap -- --email you@yourcompany.com --name "Admin Name" [--print-link] [--resend]');process.exit(1);}
const address=email(value('--email')),name=value('--name'),origin=process.env.APP_ORIGIN||'http://localhost:3000';
if(!validEmail(address)||!name||name.startsWith('--'))throw Error('Valid email and name are required');
const {client,db}=await connect();
try{
 const users=db.collection('users');let admin=await users.findOne({_id:'00000000-0000-4000-8000-000000000001'});
 if(admin){if(!args.includes('--resend')||admin.email!==address)throw Error('Admin exists. For an owner-requested password reset use the same email and --resend.');}
 else{if(await users.countDocuments({role:'Admin'}))throw Error('Admin already exists');admin={_id:'00000000-0000-4000-8000-000000000001',email:address,name,role:'Admin',views:VIEWS,departments:[],status:'pending',bootstrapAdmin:true,emailVerified:false,passwordHash:null,devices:[],deviceLimit:2,revision:1,securityVersion:1,createdAt:new Date()};await users.insertOne(admin);}
 if(args.includes('--reset-devices')){if(!args.includes('--resend'))throw Error('--reset-devices requires --resend');await users.updateOne({_id:admin._id},{$set:{devices:[]},$inc:{securityVersion:1}});await db.collection('sessions').deleteMany({userId:admin._id});}
 const token=randomToken(),url=new URL('/setup',origin);url.hash='token='+token;
 await users.updateOne({_id:admin._id},{$set:{setupTokenHash:hash(token),setupExpiresAt:new Date(Date.now()+3600000)}});
 if(args.includes('--print-link'))console.log('PRIVATE ONE-TIME ADMIN SETUP LINK (expires in one hour):\n'+url.href+'\nOpen privately. Do not paste into chat or commit to git.');
 else{await mailerFromEnv()({to:admin.email,name:admin.name,url:url.href});console.log('Private Admin setup email sent.');}
}finally{await client.close();}
