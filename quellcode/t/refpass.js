const R=require('./ref.js'); const REF=require('./refwords.json');
const rows=[['silben',5,'Fra',1],['silben',7,'Pro',1],['silben',9,'Krie',1],['silben',11,'Bla',1],['silben',13,'Glei',1],['silben',16,'Tra',1],['silben',18,'frei',1],['silben',20,'Bru',1],['silben',22,'Dra',1],['silben',24,'Flo',1],['silben',26,'Schlie',1],['silben',28,'Gra',1],['silben',30,'Troll',1],['antwort',3,'Berlin',2],['antwort',6,'Milch',1]];
let ok=0; for(const [n,k,l,syl] of rows){ const t=R.an(n,k); const j=R.C.judge(t,{syl,ref:REF[l.toLowerCase()],airCheck:true},R.C.LIMITS); if(j.pass)ok++; else console.log('NICHT BESTANDEN',l,j.items.filter(i=>!i.ok).map(i=>i.text).join(' | ')); }
console.log(`${ok} von ${rows.length} CD-Beispielen bestehen die eigene Bewertung`);
