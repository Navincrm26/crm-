export const VIEWS=['dashboard','enquiries','tasks','quotations','masters'];
export const VIEW_LABELS={dashboard:'Customers & dashboard',enquiries:'Enquiries',tasks:'Department tasks',quotations:'Quotations',masters:'Masters'};
export const ROLES=['Admin','Marketing','Department'];
export const STAGES=['Enquiry','Sampling','Photo sent','Price quotation','Price negotiation','Approved','Sales order sending','Production','Quality','Dispatch','Payment follow-up','Closed'];
export const MASTER_KINDS=['model','material','hook','trading','sample'];
export const DEFAULT_ROLE_VIEWS={Admin:VIEWS,Marketing:VIEWS,Department:['tasks']};
export const PIPELINE=['Sampling Team','SO Team','Production Team','Quality Team','Dispatch Team','Payment Follow-up'];
export function quoteLine(item,masters,margin=15){
 const code=String(item.model||'').trim().toUpperCase();
 const model=masters.find(m=>m.kind==='model'&&String(m.code).toUpperCase()===code)||{};
 const material=masters.find(m=>m.kind==='material'&&m.label===item.material)||{};
 const trade=masters.find(m=>m.kind==='trading'&&String(m.code).toUpperCase()===code&&(!m.material||m.material===item.material));
 const hook=masters.find(m=>m.kind==='hook'&&m.label===item.hook);
 const number=v=>Number.isFinite(Number(v))?Number(v):0;
 const trading=!!trade||model.type==='trade';
 const grams=number(trade?.grammage)||number(model.ppGrams)*(material.type==='PP'||material.type==='LD'?1:1.188);
 const materialCost=grams*number(material.cost)/1000;
 const hookCost=item.hook==='No Hook / Not Required'?0:number(hook?.cost??model.hook);
 const inward=number((item.inward!==''&&item.inward!=null?item.inward:trade?.inward??trade?.calledOut));
 const printing=number(item.printingCost);
 const base=(trading?inward:materialCost+number(model.job)+number(model.packing)+number(model.clips))+hookCost+printing;
 const suggested=base*(1+number(margin)/100), rounded=Math.round((suggested+Number.EPSILON)*10)/10;
 const rate=item.manualRate!==''&&item.manualRate!=null?number(item.manualRate):rounded;
 return {...item,model:code,trading,grams,materialCost,hookCost,base,suggested,rate,quantity:Math.max(0,number(item.quantity)),amount:rate*Math.max(0,number(item.quantity))};
}
export function todayIndia(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
