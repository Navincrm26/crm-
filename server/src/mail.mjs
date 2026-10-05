import nodemailer from 'nodemailer';
export function mailerFromEnv(){
 if(!process.env.SMTP_HOST)return async()=>{throw Error('SMTP is not configured. Configure SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM before sending setup emails.');};
 const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',requireTLS:process.env.SMTP_SECURE!=='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined});
 return async({to,name,url})=>transport.sendMail({from:process.env.MAIL_FROM,to,subject:'Set up your Navin CRM password',text:`Hello ${name},\n\nYour administrator has requested password setup for Navin CRM. Open this private link within one hour:\n${url}\n\nChoose your own password. Do not share this link. Your administrator may still need to activate your account and approve your device.\n\nIf you did not expect this invitation, contact your administrator.`});
}
