const assert=require('node:assert/strict');
(async()=>{
 const {createProject,validateProject,readProjectFromForm}=await import('../schematic_Lighting_1a.js');
 const input={poles:[{id:'custom-pole',lowerDiameter:165,thickness:4,height:8000}],arms:[{diameter:76.3,thickness:3.2,length:1000,height:7000}],overheadWires:[{height:6000,diameter:12,weight:0.19,span:5000}]};
 const project=createProject(input);assert(validateProject(project).valid);assert.equal(project.overheadWires[0].id,'wire-1');assert.equal(project.poles[0].upperDiameter,165);
 project.poles[0].height=9000;assert.equal(input.poles[0].height,8000);
 for(const type of ['embedment','baseplate-under-gl']) {
 const buried=createProject({...input,installation:{type,depth:1200}});assert(validateProject(buried).valid);assert.equal(buried.poles[0].height,8000);
 for(const depth of [0,-1,null,Infinity]) assert(!validateProject(createProject({...input,installation:{type,depth}})).valid);
 }
 assert(!validateProject(createProject({...input,installation:{type:'on-gl',depth:100}})).valid);
 const restored=createProject(JSON.parse(JSON.stringify(project)));assert.equal(restored.poles[0].id,'custom-pole');
 assert(!validateProject(createProject()).valid);
 const invalid=createProject(input);invalid.overheadWires[0].height=9000;invalid.arms[0].verticalAngle=90;invalid.overheadWires[0].id='custom-pole';
 const errors=validateProject(invalid).errors;assert(errors.some(e=>e.path.endsWith('.height')));assert(errors.some(e=>e.path.endsWith('.verticalAngle')));assert(errors.some(e=>e.path.endsWith('.id')));
 const values={'installation-type':'on-gl','installation-depth':'0','pole-count':'1','arm-count':'0','do-count':'0','ohw-count':'0','pole-1-name':'','pole-1-type':'straight','pole-1-material':'STK400','pole-1-diameter':'165','pole-1-thickness':'4','pole-1-height':'8000','pole-1-quantity':'1'};
 const root={querySelector(selector){const id=selector.match(/id="([^"]+)"/)[1];return id in values?{value:values[id]}:null;}};
 assert(validateProject(readProjectFromForm(root)).valid);
 values['installation-type']='embedment';values['installation-depth']='1200';assert.equal(readProjectFromForm(root).installation.depth,1200);
 values['installation-type']='on-gl';assert.equal(readProjectFromForm(root).installation.depth,0);
 values['pole-1-height']='';assert(!validateProject(readProjectFromForm(root)).valid);
 values['ohw-count']='5';assert.throws(()=>readProjectFromForm(root));
 assert.doesNotThrow(()=>validateProject({poles:[null],arms:[],directObjects:[],overheadWires:[]}));
 console.log('PASS V2 pure data import, IDs, independent snapshots, validation, active-row form adapter and invalid fields');
})().catch(e=>{console.error(e);process.exitCode=1;});
