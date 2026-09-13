import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';

export function bundledNotices() {
  return {
    name:'convocerto-bundled-notices', apply:'build',
    generateBundle(_options, bundle) {
      const inventory=JSON.parse(readFileSync('public/notices/dependencies.json','utf8'));
      const notices=new Map(inventory.packages.map(item=>[`${item.name}@${item.version}`,item]));
      const packages=new Map(), unresolved=[];
      for(const chunk of Object.values(bundle)) {
        if(chunk.type!=='chunk') continue;
        for(const [id, module] of Object.entries(chunk.modules)) {
          if(module.renderedLength === 0) continue;
          if(!id.includes('/node_modules/')) continue;
          const path=id.replace(/^\0/,'').split('?')[0];
          let directory=dirname(path), info;
          while(directory!==dirname(directory) && directory.includes('/node_modules')) {
            const candidate=join(directory,'package.json');
            if(existsSync(candidate)) {
              const parsed=JSON.parse(readFileSync(candidate,'utf8'));
              if(parsed.name && parsed.version) {info=parsed;break;}
            }
            directory=dirname(directory);
          }
          if(!info) {unresolved.push(basename(path));continue;}
          const key=`${info.name}@${info.version}`;
          const previous=packages.get(key);
          if(previous) {previous.moduleCount++;continue;}
          const notice=notices.get(key);
          packages.set(key,{name:info.name,version:info.version,moduleCount:1,declaredLicense:info.license ?? null,noticeStatus:notice?.documents.length ? 'text-collected' : 'text-missing',supplementalSources:notice?.documents.filter(document=>document.source).map(({source,sha256,basis})=>({source,sha256,basis})) ?? []});
        }
      }
      const entries=[...packages.values()].sort((a,b)=>`${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`,'en'));
      const report={scope:'Packages contributing modules to this Rollup output; includes lazy chunks. Embedded third-party code, fonts, external models, WASM and music assets need separate review.',packages:entries,unresolvedModuleFiles:[...new Set(unresolved)].sort(),missingLicenseText:entries.filter(item=>item.noticeStatus==='text-missing').map(item=>`${item.name}@${item.version}`),commercialClearance:false};
      this.emitFile({type:'asset',fileName:'notices/bundled-packages.json',source:JSON.stringify(report,null,2)+'\n'});
    },
  };
}
