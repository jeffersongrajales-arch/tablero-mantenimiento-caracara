(function(root){
const clean=v=>v==null||v===''?'Sin dato':String(v);
function match(r,s,currency='usd'){
 for(const [key,values] of Object.entries(s.dims))if(values.size&&!values.has(clean(r[key])))return false;
 if(s.review==='exclude'&&r.review||s.review==='only'&&!r.review)return false;
 if(s.from&&r.date<s.from||s.to&&r.date>s.to)return false;
 const amount=r[currency]||0;
 if(s.min!==''&&amount<Number(s.min)||s.max!==''&&amount>Number(s.max))return false;
 if(s.sign==='positive'&&amount<=0||s.sign==='negative'&&amount>=0||s.sign==='zero'&&amount!==0)return false;
 if(s.otMatch==='matched'&&!r.matchedOT||s.otMatch==='unmatched'&&r.matchedOT||s.otMatch==='zero'&&Number(r.ot)!==0)return false;
 if(s.search){const hay=[r.po,r.ot,r.doc,r.description,r.vendor,r.vendorId,r.otName,r.account,r.accountName,r.material,r.materialName,r.req,r.equipment,r.location,r.costCenter,r.contract].join(' ').toLocaleLowerCase('es');if(!hay.includes(s.search.toLocaleLowerCase('es')))return false;}
 return true;
}
function sum(rows,key){return rows.reduce((a,r)=>a+(Number(r[key])||0),0)}
function groups(rows,key,currency){const map=new Map();for(const r of rows){let name=clean(r[key]);if(!map.has(name))map.set(name,{name,n:0,value:0,pos:new Set(),review:0});const g=map.get(name);g.n++;g.value+=Number(r[currency])||0;if(Number(r.po))g.pos.add(String(r.po));if(r.review)g.review+=Number(r[currency])||0;}return [...map.values()].sort((a,b)=>Math.abs(b.value)-Math.abs(a.value));}
const api={clean,match,sum,groups};root.CostEngine=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
