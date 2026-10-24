import {train} from './core.js';
self.onmessage=async({data})=>{try{const result=await train(data.samples,data.config,data.backboneSha,row=>self.postMessage({type:'progress',row}));self.postMessage({type:'done',result})}catch(error){self.postMessage({type:'error',message:error.message})}};
