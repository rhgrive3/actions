// Every shipped network module must also identify the source bytes from which
// it was built. Inspect the staged artifacts, not a duplicate of the copy rule.
export function assertNetworkArtifactSourceBinding(identity) {
 const artifacts=identity?.artifacts,files=identity?.files,network=identity?.build?.network;
 if(!artifacts||!files||!network)throw Error('Network source coverage requires a complete build identity');
 const copied=new Set();
 for(const name of Object.keys(artifacts)){
  const match=/^(?:_versions\/[^/]+\/)?patches\/network-replication\/(.+\.mjs)$/.exec(name);
  if(match)copied.add(match[1]);
 }
 if(!copied.size)throw Error('Network source coverage found no emitted modules');
 for(const rel of [...copied].sort()){
  const source=files['network-replication/'+rel],declared=network[rel];
  if(typeof source!=='string'||!/^[0-9a-f]{64}$/.test(source)||source!==declared)
   throw Error('Emitted network module lacks matching source identity: '+rel);
 }
 return copied.size;
}
