"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const text=name=>fs.readFileSync(path.join(root,name),"utf8");
const read=name=>JSON.parse(text(name));
const ledger=name=>{
  const lines=text(name).trim().split("\n"),keys=lines.shift().split(",");
  return lines.map(line=>Object.fromEntries(line.split(",").map((value,i)=>[keys[i],i>1?+value:value])));
};
const fixture=()=>{
  const nodes=new Map();
  return {getElementById(id){if(!nodes.has(id))nodes.set(id,{textContent:"—",hidden:false});return nodes.get(id);}};
};
module.exports={root,text,read,ledger,fixture};
