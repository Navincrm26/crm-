import {MongoClient,GridFSBucket} from 'mongodb';
import {DEFAULT_ROLE_VIEWS} from '../../shared/domain.mjs';
export async function connect(uri=process.env.MONGODB_URI){if(!uri)throw Error('MONGODB_URI is required');const client=new MongoClient(uri,{serverSelectionTimeoutMS:10000});await client.connect();const db=client.db();await prepare(db);return {client,db,bucket:new GridFSBucket(db,{bucketName:'attachments'})};}
export async function prepare(db){
 await Promise.all([
  db.collection('users').createIndex({email:1},{unique:true}),
  db.collection('sessions').createIndex({expiresAt:1},{expireAfterSeconds:0}),
  db.collection('sessions').createIndex({userId:1}),
  db.collection('rate_limits').createIndex({expiresAt:1},{expireAfterSeconds:0}),
  db.collection('records').createIndex({type:1,ownerId:1,updatedAt:-1}),
  db.collection('records').createIndex({type:1,department:1,assigneeIds:1}),
  db.collection('records').createIndex({customerId:1}),
  db.collection('audit_events').createIndex({createdAt:-1}),
  db.collection('file_links').createIndex({recordId:1})
 ]);
 for(const [role,views]of Object.entries(DEFAULT_ROLE_VIEWS))await db.collection('roles').updateOne({_id:role},{$setOnInsert:{views,revision:1}},{upsert:true});
}
