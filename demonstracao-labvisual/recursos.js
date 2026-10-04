/* Contratos de leitura e exportação da demonstração. Usa a matemática conferida de analise.js. */
(function(root) {
  'use strict';
  const A=root.LabDemoAnalysis;
  const labels={pooling:{mean:'Média',max:'Máximo',median:'Mediana'},normalization:{l2:'L2',l1:'L1',linf:'L∞',none:'Sem normalização'},metric:{cosine:'Cosseno',euclidean:'Distância euclidiana',dot:'Produto escalar'}};
  const describe=r=>['pooling','normalization','metric'].map(k=>labels[k][r[k]]).join(' → ');
  const statistics=A.statistics;
  function ranking(images,index,stage,recipe) {
    const all=A.nearest(images,index,stage,recipe,images.length);
    return {neighbors:all.slice(0,5),statistics:statistics(all.map(r=>r.score))};
  }
  function vectors(images,recipe) {
    return Object.fromEntries(['before','after'].map(stage=>[stage,images.map(image=>A.normalize(image.vectors[stage][recipe.pooling],recipe.normalization).vector)]));
  }
  function sequence(record,recipe,stage,scope=-1) {
    const raw=scope<0?record.vectors[stage][recipe.pooling]:record.pairs[stage][scope][recipe.pooling];
    const result=A.normalize(raw,recipe.normalization);
    const pairs=record.pairs[stage].map(pair=>A.normalize(pair[recipe.pooling],recipe.normalization).vector);
    return {...result,pairs,comparisons:pairs.slice(1).map((pair,i)=>A.compare(pairs[i],pair,recipe.metric))};
  }
  const squaredShare=A.squaredShare;
  function download(name,blob) {
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  function json(name,value) {download(name,new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));}
  function csv(name,arrays) {
    const stages=Object.keys(arrays), count=Math.max(...stages.map(s=>arrays[s].length));
    const lines=['coordenada,'+stages.join(',')];
    for(let i=0;i<count;i++) lines.push([i+1,...stages.map(s=>arrays[s][i]??'')].join(','));
    download(name,new Blob([lines.join('\n')+'\n'],{type:'text/csv;charset=utf-8'}));
  }
  const encoder=new TextEncoder();
  function npy(values) {
    const matrix=Array.isArray(values[0]),rows=matrix?values.length:1,cols=matrix?values[0].length:values.length;
    const flat=matrix?values.flat():values;
    if(!rows||!cols||flat.length!==rows*cols||!flat.every(Number.isFinite)||matrix&&values.some(row=>row.length!==cols)) throw Error('Matriz inválida para exportação.');
    const shape=matrix?`(${rows}, ${cols})`:`(${cols},)`;
    let header=`{'descr': '<f4', 'fortran_order': False, 'shape': ${shape}, }`;
    header+=' '.repeat((64-(10+header.length+1)%64)%64)+'\n';
    const out=new Uint8Array(10+header.length+flat.length*4),view=new DataView(out.buffer);
    out.set([0x93,78,85,77,80,89,1,0]);view.setUint16(8,header.length,true);out.set(encoder.encode(header),10);
    flat.forEach((v,i)=>view.setFloat32(10+header.length+i*4,v,true));return out;
  }
  function crc(bytes) {
    let c=0xffffffff;
    for(const b of bytes){c^=b;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}
    return (c^0xffffffff)>>>0;
  }
  function npz(arrays) {
    const local=[],central=[];let offset=0;
    for(const [name,values] of Object.entries(arrays)) {
      if(!/^[a-zA-Z0-9_]+$/.test(name))throw Error('Nome de matriz inválido.');
      const filename=encoder.encode(name+'.npy'),bytes=npy(values),checksum=crc(bytes);
      const lh=new Uint8Array(30+filename.length),l=new DataView(lh.buffer);
      l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(12,33,true);
      l.setUint32(14,checksum,true);l.setUint32(18,bytes.length,true);l.setUint32(22,bytes.length,true);l.setUint16(26,filename.length,true);lh.set(filename,30);
      local.push(lh,bytes);
      const ch=new Uint8Array(46+filename.length),c=new DataView(ch.buffer);
      c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(14,33,true);
      c.setUint32(16,checksum,true);c.setUint32(20,bytes.length,true);c.setUint32(24,bytes.length,true);c.setUint16(28,filename.length,true);c.setUint32(42,offset,true);ch.set(filename,46);
      central.push(ch);offset+=lh.length+bytes.length;
    }
    const end=new Uint8Array(22),e=new DataView(end.buffer),length=central.reduce((sum,x)=>sum+x.length,0);
    e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length,true);e.setUint16(10,central.length,true);e.setUint32(12,length,true);e.setUint32(16,offset,true);
    return new Blob([...local,...central,end],{type:'application/octet-stream'});
  }
  root.LabDemoResources=Object.freeze({labels,describe,statistics,ranking,vectors,sequence,squaredShare,download,json,csv,npz});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.LabDemoResources;
})(typeof window==='undefined'?globalThis:window);
