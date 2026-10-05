import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {connect} from '../src/db.mjs';
import {safeData,validId} from '../src/security.mjs';
import {STAGES,MASTER_KINDS} from '../../shared/domain.mjs';
import {DEPARTMENTS} from '../../shared/workflow.mjs';
// Explicit normalized format: no silent guessing of old Sites/Supabase schema.
const args=process.argv.slice(2),filename=args.find(a=>!a.startsWith('--'));
if(!filename){console.error('Usage: npm run import -- ./export.json [--apply]');process.exit(1);}
const input=JSON.parse(await readFile(filename,'utf8'));
if(input.format!=='navin-mern-v1'||!Array.isArray(input.records))throw Error('Expected navin-mern-v1. See docs/DATA_IMPORT.md; raw Sites exports must be mapped first.');
const records=input.records.map(r=>({...r,_id:r.id||r._id,data:safeData(r.data)}));
const ids=new Set();for(const r of records){if(!validId(r._id)||ids.has(r._id))throw Error('Invalid or duplicate record UUID');ids.add(r._id);if(!['customer','enquiry','task','quotation','master'].includes(r.type))throw Error('Unknown record type');if(!validId(r.ownerId))throw Error('Every record needs an existing mapped ownerId');if(r.type==='enquiry'&&!STAGES.includes(r.data.status))throw Error('Map enquiry stage first');if(r.type==='task'&&!DEPARTMENTS.includes(r.department))throw Error('Map task department first');if(r.type==='master'&&!MASTER_KINDS.includes(r.data.kind))throw Error('Invalid master kind');}
for(const r of records)if(r.customerId&&!ids.has(r.customerId))throw Error('Include referenced customers in this import file');
console.log(`Validated ${records.length} records. Credentials, accounts, sessions and file bytes are NOT imported.`);
if(!args.includes('--apply')){console.log('Dry run only. Review and back up the destination before adding --apply.');process.exit(0);}
if(process.env.ALLOW_DATA_IMPORT!=='yes')throw Error('Set ALLOW_DATA_IMPORT=yes explicitly for the apply command');
const {db,client}=await connect();try{
 const owners=[...new Set(records.map(r=>r.ownerId))];if(await db.collection('users').countDocuments({_id:{$in:owners},status:'active',role:{$in:['Admin','Marketing']}})!==owners.length)throw Error('Create and activate mapped record owners before importing');
 const assignees=[...new Set(records.flatMap(r=>r.assigneeIds||[]))];if(await db.collection('users').countDocuments({_id:{$in:assignees},status:'active'})!==assignees.length)throw Error('Map every assignee to an existing active user');
 const session=client.startSession();try{await session.withTransaction(async()=>{for(const r of records){const doc={_id:r._id,type:r.type,ownerId:r.ownerId,customerId:r.customerId||null,enquiryId:r.enquiryId||null,department:r.department||null,assigneeIds:r.assigneeIds||[],data:r.data,deleted:!!r.deleted,revision:Number.isInteger(r.revision)?r.revision:1,createdAt:new Date(r.createdAt||Date.now()),updatedAt:new Date(r.updatedAt||Date.now()),createdBy:r.createdBy||r.ownerId,history:(r.history||[]).slice(-500).map(h=>({...h,at:new Date(h.at)}))};await db.collection('records').insertOne(doc,{session});}await db.collection('audit_events').insertOne({_id:randomUUID(),actorId:null,event:'operator.import',target:'records',detail:{count:records.length},createdAt:new Date()},{session});});}finally{await session.endSession();}
 console.log('Import committed. Existing duplicate IDs cause a rollback; no records are overwritten.');
}finally{await client.close();}
