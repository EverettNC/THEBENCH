import { FAMILY_NAMES } from "./lexicon.ts";
import { recoverMangles } from "./mangle.ts";
import type { HonestyDialect, PorchCorrection } from "./types";

export type DialectLayer = {
  asSaid: string;
  forTheFamily: string;
  corrections: PorchCorrection[];
  route: string[];
  dialect: HonestyDialect;
};

export function reconstructDialect(rawEar: string): DialectLayer {
  if (!rawEar.trim()) {
    return { asSaid: "", forTheFamily: "", corrections: [], route: [], dialect: "passthrough" };
  }
  const local = recoverMangles(rawEar);
  const route = FAMILY_NAMES.filter((n) => local.text.toLowerCase().includes(n.toLowerCase()));
  return {
    asSaid: local.text,
    forTheFamily: local.text,
    corrections: local.corrections,
    route: [...route],
    dialect: "passthrough",
  };
}
