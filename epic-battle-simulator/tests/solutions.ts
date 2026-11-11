// Reference armies found by tools/solve.ts: two different mixed answers per stage, each within budget,
// using only units unlocked at that point, and winning on three seeds. They prove every stage is fair.
import type { Army } from "../tools/balance-lib";

export const SOLUTIONS: Record<number, Army[]> = {
  1: [[["archer",2],["guardian",3],["spear",3]],[["spear",5],["guardian",3]]],
  2: [[["guardian",4],["archer",5]],[["swordsman",5],["archer",4]]],
  3: [[["guardian",5],["archer",5],["swordsman",2]],[["spear",6],["archer",7]]],
  4: [[["skeleton",13],["archer",7]],[["zombie",17],["crossbow",4],["skeleton",5]]],
  5: [[["archer",11],["guardian",7]],[["archer",4],["guardian",2],["cleric",2],["crossbow",6]]],
  6: [[["guardian",5],["crossbow",3],["halberdier",2],["archer",3]],[["halberdier",4],["archer",3],["crossbow",3],["skeleton",4]]],
  7: [[["swordsman",4],["orc",5],["bonearcher",12]],[["cleric",2],["bonearcher",4],["archer",5],["swordsman",7]]],
  8: [[["archer",3],["orc",6],["cleric",4],["crossbow",4]],[["archer",7],["guardian",6],["crossbow",5]]],
  9: [[["javelin",3],["guardian",6],["crossbow",8]],[["javelin",13],["guardian",7]]],
  10: [[["bomber",5],["crossbow",3],["spear",10],["cleric",1]],[["guardian",7],["bonearcher",11],["crossbow",4]]],
  11: [[["zombie",26],["guardian",9],["bomber",5],["swordsman",4]],[["orc",17],["cleric",8]]],
  12: [[["guardian",15],["pirate",3],["shaman",3],["crossbow",4]],[["crossbow",9],["shaman",3],["guardian",13]]],
  13: [[["pirate",9],["cleric",3],["guardian",11]],[["bomber",6],["pirate",5],["monk",7],["cleric",3]]],
  14: [[["assassin",15],["berserker",12]],[["assassin",7],["archer",9],["crossbow",4],["orc",11]]],
  15: [[["assassin",10],["swordsman",13],["bomber",7]],[["mage",5],["assassin",12],["orc",11]]],
  16: [[["javelin",17],["guardian",8],["cleric",5]],[["bomber",7],["knight",4],["guardian",10]]],
  17: [[["paladin",3],["bonearcher",13],["knight",2],["elf",7]],[["cleric",4],["halberdier",7],["bomber",4],["assassin",11]]],
  18: [[["bomber",8],["paladin",3],["frost",10]],[["paladin",2],["spear",19],["guardian",12],["bomber",7]]],
  19: [[["cleric",11],["troll",3],["elf",10],["knight",2]],[["knight",4],["paladin",3],["vampire",4],["skeleton",33]]],
  20: [[["javelin",11],["paladin",3],["railgun",4],["knight",4]],[["cleric",8],["orc",18],["paladin",3],["monk",10]]],
};
