const {voice}=require('./synth.js'); const fs=require('fs'); const sr=22050;
function wav(name,x){ const b=Buffer.alloc(44+x.length*2); b.write('RIFF',0); b.writeUInt32LE(36+x.length*2,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(sr,24); b.writeUInt32LE(sr*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(x.length*2,40); for(let i=0;i<x.length;i++) b.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(x[i]*32767))),44+i*2); fs.writeFileSync(name,b); }
wav('syn_good.wav',voice({lead:1.4,tail:2.5}));
wav('syn_jump.wav',voice({lead:1.4,tail:2.5,f0:(t)=>t<1?100:133}));
wav('syn_break.wav',voice({lead:1.4,tail:2.5,breaks:[[1.0,1.25]]}));
console.log('ok');
