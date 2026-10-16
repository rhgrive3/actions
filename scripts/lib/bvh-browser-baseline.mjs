import {createHash} from 'node:crypto';
// The allocation/traversal baseline remains ee06. Adopt only the source-ID
// contact rule introduced by b5d9cf208472fed2f775e74afc1632a1586f72bc.
// Both timed engines must implement that same rule; otherwise chart-seam
// triangle/face/material ownership, not the optimization, is being compared.
export function canonicalBvhBaseline(source) {
 if(createHash('sha256').update(source).digest('hex')!=='8ddfa80124c6d6f47c56ba0d9325f2faf9fca4688894b34e336769b3c43f921a')throw Error('Unexpected frozen BVH baseline');
 const old='if(distance<.00001||distance>best)continue;';
 if(source.split(old).length!==2)throw Error('Expected one frozen ray acceptance predicate');
 return source.replace(old,'if(distance<.00001||distance>best||distance===best&&id>=0&&t>id)continue;');
}
