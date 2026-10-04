/* Adaptador de dados para a demo. As fórmulas estão em analysis_core.py;
   analysis-core.js é gerado automaticamente dessa fonte, sob AGPL-3.0-only. */
(function(root){
  'use strict';
  const core=root.LabVisualMath;
  if(!core)throw Error('Núcleo canônico de análise não carregado.');
  function nearest(images,index,stage,recipe,count=5){
    const vectors=images.map(item=>core.normalize(item.vectors[stage][recipe.pooling],recipe.normalization,32).vector);
    return core.ranking(vectors,index,recipe.metric,count).neighbors;
  }
  const api=Object.freeze({version:core.version,normalize:core.normalize,compare:core.compare,nearest,statistics:core.statistics,squaredShare:core.squared_share});
  root.LabDemoAnalysis=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
